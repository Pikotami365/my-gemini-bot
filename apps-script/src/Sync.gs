/**
 * Автоматические задачи, статусы групп и риски.
 * Запускается по таймеру каждые 10 минут (installTriggers) и после сохранений по конкретной группе.
 * Идемпотентен: у каждой задачи уникальный ключ.
 */

function cronSync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    dbReset_();
    runSync_(new Date());
  } finally {
    lock.releaseLock();
  }
}

function ensureTask_(t, done) {
  var ex = find_('tasks', function (x) { return x.key === t.key; });
  if (!ex) {
    if (done) return;
    t.status = 'OPEN';
    t.createdAt = new Date();
    t.manual = !!t.manual;
    delete t.keepDue;
    insert_('tasks', t);
    return;
  }
  var patch = {};
  var changed = false;
  if (t.assigneeId !== undefined && (ex.assigneeId || '') !== (t.assigneeId || '')) { patch.assigneeId = t.assigneeId || ''; changed = true; }
  if (!t.keepDue && (!ex.dueAt || ex.dueAt.getTime() !== t.dueAt.getTime())) { patch.dueAt = t.dueAt; changed = true; }
  if (!ex.manual) {
    if (done && ex.status === 'OPEN') { patch.status = 'DONE'; patch.doneAt = new Date(); changed = true; }
    if (!done && ex.status === 'DONE') { patch.status = 'OPEN'; patch.doneAt = null; changed = true; }
  }
  if (changed) update_('tasks', ex.id, patch);
}

/** Кому рассылать «всем»: админы, менеджеры, кураторы (свои группы), руководство. */
function broadcastRecipients_(groupId) {
  var g = groupId ? byId_('groups', groupId) : null;
  return where_('users', function (u) {
    if (!u.active) return false;
    if (!(u.isFull || ['ADMIN', 'MANAGER', 'CURATOR', 'LEADERSHIP'].indexOf(u.department) >= 0)) return false;
    if (g && u.department === 'CURATOR' && !u.isHead && !u.isFull && u.id !== g.curatorId) return false;
    return true;
  }).map(function (u) { return u.id; });
}

function notify_(o) {
  var ids = {};
  (o.userIds || []).forEach(function (id) { if (id) ids[id] = true; });
  var n = insert_('notifications', {
    kind: o.kind, red: !!o.red, title: o.title, body: o.body || '', link: o.link || '',
    ackDueAt: o.ackHours ? new Date(Date.now() + o.ackHours * 3600000) : null,
    createdById: o.createdById || '', createdAt: new Date()
  })[0];
  insert_('recipients', Object.keys(ids).map(function (uid) { return { notificationId: n.id, userId: uid, ackAt: null }; }));
}

function createRisk_(studentId, source, reason, createdById) {
  var st = byId_('students', studentId);
  if (!st) return;
  var g = byId_('groups', st.groupId);
  insert_('risks', { studentId: studentId, source: source, reason: reason, open: true, createdById: createdById || '', createdAt: new Date() });
  notify_({
    kind: 'risk', red: true,
    title: 'Риск: ' + st.name + ' (' + (g ? g.name : '') + ')',
    body: reason, link: 'student/' + studentId,
    userIds: broadcastRecipients_(st.groupId), createdById: createdById
  });
}

function lessonsOf_(groupId) {
  return where_('lessons', function (l) { return l.groupId === groupId; }).sort(function (a, b) { return a.index - b.index; });
}

function runSync_(now, onlyGroupId) {
  var today = todayLocal_(now);
  var groups = where_('groups', function (g) {
    return ['RECRUITING', 'WAITING', 'ACTIVE'].indexOf(g.status) >= 0 && (!onlyGroupId || g.id === onlyGroupId);
  });

  groups.forEach(function (g) {
    var branch = byId_('branches', g.branchId) || { name: '', isOnline: false };
    var lessons = lessonsOf_(g.id);
    var students = where_('students', function (s) { return s.groupId === g.id && s.status === 'ACTIVE'; });
    var first = lessons[0], last = lessons[lessons.length - 1];
    var link = 'group/' + g.id;

    if (g.status === 'WAITING' && first && first.startsAt <= now) {
      update_('groups', g.id, { status: 'ACTIVE', startCount: g.startCount != null ? g.startCount : students.length });
    }
    if (g.status === 'ACTIVE' && last && last.endsAt <= now) {
      update_('groups', g.id, { status: 'FINISHED' });
      return;
    }

    // Набор закрыт → назначить преподавателей (админ) и куратора (руководство)
    if (g.recruitClosedAt) {
      var due = localDateTime_(addDays_(g.startDate, -1), 23, 59);
      ensureTask_({ key: 'assign-teachers:' + g.id, type: 'assign-teachers', title: 'Назначить преподавателей: ' + g.name,
        details: branch.name + '. Набор закрыт, нужно назначить преподавателя химии и биологии.', department: 'ADMIN',
        groupId: g.id, link: link, dueAt: due }, !!g.chemTeacherId && !!g.bioTeacherId);
      ensureTask_({ key: 'assign-curator:' + g.id, type: 'assign-curator', title: 'Назначить куратора: ' + g.name,
        details: branch.name + '. Набор закрыт.', department: 'LEADERSHIP', groupId: g.id, link: link, dueAt: due }, !!g.curatorId);
    }

    // За 3 дня до старта — задачи куратору
    if (g.curatorId && g.status !== 'ACTIVE') {
      [[1, -3, 'Открыть группу: создать чат, добавить учеников и сотрудников (руководителей), познакомиться'],
       [2, -2, 'Продолжить общение с группой, задать вопросы'],
       [3, -1, 'Написать в чат группы перед стартом']].forEach(function (s) {
        var day = addDays_(g.startDate, s[1]);
        // Куратора назначили поздно: пропущенные дни 2–3 не создаём, «открыть группу» — со сроком сегодня
        if (today > day && s[0] !== 1) return;
        if (today >= day && today < g.startDate) {
          var dueDay = today > day ? today : day;
          ensureTask_({ key: 'prestart:' + g.id + ':' + s[0], type: 'prestart', title: g.name + ': ' + s[2],
            details: 'День ' + s[0] + ' из 3 до старта (' + fmtDate_(g.startDate) + ').', assigneeId: g.curatorId,
            groupId: g.id, link: link, dueAt: localDateTime_(dueDay, 23, 59), manual: true, keepDue: true }, false);
        }
      });
    }

    if (byId_('groups', g.id).status !== 'ACTIVE') return;

    var horizon = new Date(now.getTime() - 35 * 86400000);
    var recent = lessons.filter(function (l) { return l.startsAt <= now && l.startsAt >= horizon; });
    if (!recent.length) return;
    var recentIds = {};
    recent.forEach(function (l) { recentIds[l.id] = true; });
    var att = where_('attendance', function (a) { return recentIds[a.lessonId]; });
    var hw = where_('homework', function (h) { return recentIds[h.lessonId]; });
    var touches = where_('touches', function (t) { return t.groupId === g.id; });
    var surveys = where_('surveys', function (s) { return s.groupId === g.id; });

    recent.forEach(function (l) {
      var pos = positionInMonth_(l.index);
      var expected = students.filter(function (s) { return s.joinedAt <= l.endsAt; });
      var subj = SUBJECT_LABEL[l.subject];

      // Посещаемость до конца занятия
      var marked = {};
      att.forEach(function (a) { if (a.lessonId === l.id) marked[a.studentId] = true; });
      ensureTask_({ key: 'att:' + l.id, type: 'attendance',
        title: 'Отметить посещаемость: ' + g.name + ', занятие ' + l.index + ' (' + subj + ')',
        details: branch.isOnline ? 'Онлайн: отметить посещаемость и обзвонить отсутствующих (примечание).' : 'Офлайн: посещаемость, причины отсутствия и быстрый тест.',
        department: branch.isOnline ? '' : 'ADMIN', assigneeId: g.curatorId || '', groupId: g.id, lessonId: l.id,
        link: link + '?tab=attendance&lesson=' + l.index, dueAt: l.endsAt },
        expected.every(function (s) { return marked[s.id]; }));

      // ДЗ — до начала следующего занятия
      if (l.endsAt <= now && g.curatorId) {
        var next = lessons.filter(function (x) { return x.index === l.index + 1; })[0];
        var hwFor = hw.filter(function (h) { return h.lessonId === l.id; });
        var complete = expected.every(function (s) {
          return ['EXPERIMENT', 'TEST'].every(function (t) {
            var r = hwFor.filter(function (h) { return h.studentId === s.id && h.type === t; })[0];
            return r && (r.done || String(r.reason).trim().length > 0);
          });
        });
        ensureTask_({ key: 'hw:' + l.id, type: 'homework', title: 'Отметить ДЗ: ' + g.name + ', занятие ' + l.index + ' (' + subj + ')',
          details: 'Опыты: сдано / не сдано. Тесты: балл. Не сдано — причина и дата сдачи.', assigneeId: g.curatorId,
          groupId: g.id, lessonId: l.id, link: link + '?tab=homework&lesson=' + l.index,
          dueAt: next ? next.startsAt : addDays_(l.endsAt, 2) }, complete);
      }

      // Касания после 6-го и 12-го занятия
      if ((pos === 6 || pos === 12) && l.endsAt <= now && g.curatorId) {
        var number = pos === 6 ? 1 : 2;
        var need = expected.filter(function (s) { return !s.parentsNotInvolved; });
        var doneSet = {};
        touches.forEach(function (t) { if (t.courseMonth === l.courseMonth && t.number === number) doneSet[t.studentId] = true; });
        ensureTask_({ key: 'touch:' + g.id + ':' + l.courseMonth + ':' + number, type: 'touch',
          title: 'Касание с родителями №' + number + ': ' + g.name + ', месяц ' + l.courseMonth,
          details: 'Отправить каждому родителю отчёт по ученику и зафиксировать ответ (дословно или «ожидается ответ»).',
          assigneeId: g.curatorId, groupId: g.id, link: link + '?tab=touches&month=' + l.courseMonth + '&n=' + number,
          dueAt: addDays_(l.endsAt, 1) }, need.every(function (s) { return doneSet[s.id]; }));
      }

      // Опросник: последняя неделя месяца (11-е или 12-е занятие), до вечера дня 12-го занятия
      if (pos === 11) {
        var l12 = lessons.filter(function (x) { return x.index === l.index + 1; })[0];
        var dueDay = todayLocal_(l12 ? l12.startsAt : l.endsAt);
        ensureTask_({ key: 'survey:' + g.id + ':' + l.courseMonth, type: 'survey',
          title: 'Провести опросник: ' + g.name + ', месяц ' + l.courseMonth,
          details: 'Внести % по преподавателю химии, биологии, куратору и админу.', department: 'ADMIN',
          groupId: g.id, link: link + '?tab=survey', dueAt: localDateTime_(dueDay, 23, 59) },
          surveys.some(function (s) { return s.courseMonth === l.courseMonth; }));
      }
    });

    // Автоматические риски
    var past = lessons.filter(function (l) { return l.endsAt <= now; });
    if (!past.length) return;
    var lessonById = {};
    past.forEach(function (l) { lessonById[l.id] = l; });
    var allAtt = where_('attendance', function (a) { return lessonById[a.lessonId]; });
    var allHw = where_('homework', function (h) { return lessonById[h.lessonId]; });
    students.forEach(function (s) {
      var autoRisks = where_('risks', function (r) { return r.studentId === s.id; });
      // 2 пропуска подряд без причины
      var a = allAtt.filter(function (x) { return x.studentId === s.id; })
        .sort(function (x, y) { return lessonById[x.lessonId].index - lessonById[y.lessonId].index; });
      var two = a.slice(-2);
      if (two.length === 2 && lessonById[two[1].lessonId].index - lessonById[two[0].lessonId].index === 1 &&
          two.every(function (x) { return x.status === 'ABSENT' && !String(x.reason).trim(); })) {
        var since = lessonById[two[1].lessonId].startsAt;
        if (!autoRisks.some(function (r) { return r.source === 'AUTO_ABSENCE' && r.createdAt >= since; })) {
          createRisk_(s.id, 'AUTO_ABSENCE', '2 пропуска подряд без причины (занятия ' + lessonById[two[0].lessonId].index + ' и ' + lessonById[two[1].lessonId].index + ')', '');
        }
      }
      // 3 несданных ДЗ подряд (занятие не сдано, если не сдан опыт или тест)
      var byLesson = {};
      allHw.forEach(function (h) {
        if (h.studentId !== s.id) return;
        var idx = lessonById[h.lessonId].index;
        if (!byLesson[idx]) byLesson[idx] = { startsAt: lessonById[h.lessonId].startsAt, notDone: false };
        if (!h.done) byLesson[idx].notDone = true;
      });
      var seq = Object.keys(byLesson).map(Number).sort(function (x, y) { return x - y; });
      var last3 = seq.slice(-3);
      if (last3.length === 3 && last3[2] - last3[0] === 2 && last3.every(function (i) { return byLesson[i].notDone; })) {
        var since3 = byLesson[last3[2]].startsAt;
        if (!autoRisks.some(function (r) { return r.source === 'AUTO_HOMEWORK' && r.createdAt >= since3; })) {
          createRisk_(s.id, 'AUTO_HOMEWORK', '3 несданных ДЗ подряд (занятия ' + last3.join(', ') + ')', '');
        }
      }
    });
  });

  // «Принять ДЗ» в ожидаемую дату сдачи
  where_('homework', function (h) { return !h.done && h.expectedDate && h.expectedDate <= today; }).forEach(function (h) {
    var st = byId_('students', h.studentId);
    if (!st || st.status !== 'ACTIVE') return;
    if (onlyGroupId && st.groupId !== onlyGroupId) return;
    var l = byId_('lessons', h.lessonId);
    var g = byId_('groups', st.groupId);
    ensureTask_({ key: 'hwpick:' + h.id, type: 'homework-pickup',
      title: 'Принять ДЗ у ' + st.name + ' (' + (h.type === 'TEST' ? 'тест' : 'опыт') + ', занятие ' + (l ? l.index : '?') + ')',
      details: 'Ожидаемая дата сдачи: ' + fmtDate_(h.expectedDate) + '. Причина: ' + (h.reason || '—'),
      assigneeId: g ? g.curatorId : '', groupId: st.groupId, studentId: st.id, link: 'student/' + st.id,
      dueAt: localDateTime_(h.expectedDate, 23, 59) }, false);
  });
  where_('tasks', function (t) { return t.type === 'homework-pickup' && t.status === 'OPEN'; }).forEach(function (t) {
    var h = byId_('homework', t.key.split(':')[1]);
    if (!h || h.done) update_('tasks', t.id, { status: 'DONE', doneAt: new Date() });
  });
}
