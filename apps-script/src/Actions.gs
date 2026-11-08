/** Действия пользователей (все изменения данных). f — поля формы. */

function str_(f, k) { var v = f[k]; if (Array.isArray(v)) v = v[0]; return v == null ? '' : String(v).trim(); }
function num_(f, k) { var v = str_(f, k).replace(',', '.'); if (v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }
function list_(f, k) { var v = f[k]; if (v == null) return []; return (Array.isArray(v) ? v : [v]).map(String); }
function on_(f, k) { var v = str_(f, k); return v === 'on' || v === 'true' || v === '1'; }

function currentMonth_(groupId) {
  var now = new Date();
  var started = lessonsOf_(groupId).filter(function (l) { return l.startsAt <= now; });
  return started.length ? started[started.length - 1].courseMonth : 1;
}

function activeCount_(groupId) {
  return where_('students', function (s) { return s.groupId === groupId && s.status === 'ACTIVE'; }).length;
}

function assertSlotFree_(roomId, days, slot, start, months, exceptGroupId) {
  var plan = lessonPlan_({ startDate: start, days: days, slot: slot, months: months });
  var from = plan[0].startsAt.getTime(), to = plan[plan.length - 1].startsAt.getTime();
  where_('groups', function (o) {
    return o.roomId === roomId && o.days === days && o.slot === slot && o.status !== 'FINISHED' && o.id !== exceptGroupId;
  }).forEach(function (o) {
    var ls = lessonsOf_(o.id);
    if (!ls.length) return;
    if (ls[0].startsAt.getTime() <= to && from <= ls[ls.length - 1].startsAt.getTime()) fail_('Кабинет занят группой «' + o.name + '» в это время');
  });
}

var ACTIONS = {};

// ───────────── Наборы и группы ─────────────

ACTIONS.openRecruitment = function (user, f) {
  requirePerm_(user, 'recruit.edit');
  var branch = byId_('branches', str_(f, 'branchId'));
  if (!branch) fail_('Филиал не найден');
  var roomId = str_(f, 'roomId');
  var days = str_(f, 'days'), slot = str_(f, 'slot');
  var startDate = parseDate_(str_(f, 'startDate'));
  if (!startDate) fail_('Укажите дату старта');
  var months = branch.isOnline ? 4 : 5;
  if (!matchesDays_(startDate, days)) fail_('Дата старта должна выпадать на ' + DAYS_LABEL[days]);
  if (!branch.isOnline && !roomId) fail_('Выберите кабинет');
  if (roomId) assertSlotFree_(roomId, days, slot, startDate, months, '');
  var name = defaultGroupName_(startDate, days, slot);
  var room = byId_('rooms', roomId);
  var g = insert_('groups', {
    name: name, description: branch.name + (room ? ', ' + room.name : '') + ', ' + DAYS_LABEL[days] + ', ' + SLOT_LABEL[slot],
    branchId: branch.id, roomId: roomId, days: days, slot: slot, startDate: startDate, months: months,
    price: DEFAULT_PRICE, status: 'RECRUITING', createdById: user.id, createdAt: new Date()
  })[0];
  insert_('lessons', lessonPlan_(g).map(function (p) {
    return { groupId: g.id, index: p.index, courseMonth: p.courseMonth, subject: p.subject, startsAt: p.startsAt, endsAt: p.endsAt, teacherId: '', roomId: roomId };
  }));
  audit_(user.id, 'open-recruitment', 'group', g.id, name);
  notify_({ kind: 'recruit', title: 'Открыт набор: ' + name, body: branch.name, link: 'group/' + g.id, userIds: broadcastRecipients_(), createdById: user.id });
  return { redirect: 'group/' + g.id };
};

ACTIONS.closeRecruitment = function (user, f) {
  requirePerm_(user, 'recruit.edit');
  var g = update_('groups', str_(f, 'groupId'), { status: 'WAITING', recruitClosedAt: new Date() });
  var b = byId_('branches', g.branchId);
  audit_(user.id, 'close-recruitment', 'group', g.id);
  notify_({ kind: 'recruit-closed', red: true, ackHours: 24, title: 'Набор закрыт: ' + g.name,
    body: b.name + ', учеников: ' + activeCount_(g.id) + '. Админам — назначить преподавателей, руководству — куратора.',
    link: 'group/' + g.id, userIds: broadcastRecipients_(), createdById: user.id });
  runSync_(new Date(), g.id);
  return { msg: 'Набор закрыт. Админам и руководству пришли задачи.' };
};

ACTIONS.reopenRecruitment = function (user, f) {
  requirePerm_(user, 'recruit.edit');
  var g = byId_('groups', str_(f, 'groupId'));
  if (g.status !== 'WAITING') fail_('Группа не в статусе «ждёт старта»');
  update_('groups', g.id, { status: 'RECRUITING', recruitClosedAt: null });
  audit_(user.id, 'reopen-recruitment', 'group', g.id);
  return {};
};

ACTIONS.updateGroupInfo = function (user, f) {
  if (!can_(user, 'roster.edit') && !can_(user, 'schedule.edit') && !can_(user, 'recruit.edit')) fail_('Нет доступа');
  var name = str_(f, 'name');
  if (!name) fail_('Название не может быть пустым');
  update_('groups', str_(f, 'groupId'), { name: name, description: str_(f, 'description') });
  audit_(user.id, 'rename-group', 'group', str_(f, 'groupId'), name);
  return { msg: 'Сохранено' };
};

ACTIONS.updatePrice = function (user, f) {
  requirePerm_(user, 'recruit.edit');
  var price = num_(f, 'price');
  if (!price || price < 0) fail_('Укажите сумму');
  update_('groups', str_(f, 'groupId'), { price: Math.round(price) });
  audit_(user.id, 'update-price', 'group', str_(f, 'groupId'), String(price));
  return { msg: 'Сумма сохранена' };
};

ACTIONS.updateGroupOrg = function (user, f) {
  requirePerm_(user, 'schedule.edit');
  var g = byId_('groups', str_(f, 'groupId'));
  var branch = byId_('branches', g.branchId);
  var roomId = branch.isOnline ? '' : (str_(f, 'roomId') || g.roomId);
  var chem = str_(f, 'chemTeacherId'), bio = str_(f, 'bioTeacherId');
  var days = str_(f, 'days') || g.days, slot = str_(f, 'slot') || g.slot;
  var startDate = str_(f, 'startDate') ? parseDate_(str_(f, 'startDate')) : g.startDate;
  if (!matchesDays_(startDate, days)) fail_('Дата старта должна выпадать на ' + DAYS_LABEL[days]);
  if (roomId) assertSlotFree_(roomId, days, slot, startDate, g.months, g.id);
  var scheduleChanged = days !== g.days || slot !== g.slot || startDate.getTime() !== g.startDate.getTime();
  if (scheduleChanged && g.status === 'ACTIVE') fail_('Группа уже идёт: переносите отдельные занятия во вкладке «Занятия»');
  update_('groups', g.id, { roomId: roomId, chemTeacherId: chem, bioTeacherId: bio, days: days, slot: slot, startDate: startDate });
  var now = new Date();
  var plan = lessonPlan_(g);
  var lessons = lessonsOf_(g.id);
  plan.forEach(function (p) {
    var ex = lessons.filter(function (l) { return l.index === p.index; })[0];
    var teacherId = p.subject === 'CHEM' ? chem : bio;
    if (!ex) {
      insert_('lessons', { groupId: g.id, index: p.index, courseMonth: p.courseMonth, subject: p.subject, startsAt: p.startsAt, endsAt: p.endsAt, teacherId: teacherId, roomId: roomId });
    } else if (ex.startsAt > now) {
      var patch = { roomId: roomId, teacherId: teacherId };
      if (scheduleChanged) { patch.startsAt = p.startsAt; patch.endsAt = p.endsAt; }
      update_('lessons', ex.id, patch);
    } else if (!ex.teacherId && teacherId) {
      // Прошедшие занятия без преподавателя (назначили после старта) — чтобы считались его показатели
      update_('lessons', ex.id, { teacherId: teacherId });
    }
  });
  audit_(user.id, 'update-group-org', 'group', g.id);
  notify_({ kind: 'group-change', title: 'Изменения в группе ' + g.name, body: 'Админ обновил кабинет / преподавателей / расписание.',
    link: 'group/' + g.id, ackHours: 24, userIds: broadcastRecipients_(g.id).concat([chem, bio]), createdById: user.id });
  runSync_(new Date(), g.id);
  return { msg: 'Сохранено' };
};

ACTIONS.assignCurator = function (user, f) {
  if (!user.isFull && !(user.isHead && user.department === 'CURATOR')) fail_('Назначать куратора может только руководство');
  var g = update_('groups', str_(f, 'groupId'), { curatorId: str_(f, 'curatorId') });
  audit_(user.id, 'assign-curator', 'group', g.id, g.curatorId);
  if (g.curatorId) {
    notify_({ kind: 'curator-assigned', red: true, ackHours: 24, title: 'Вы назначены куратором группы ' + g.name,
      link: 'group/' + g.id, userIds: [g.curatorId], createdById: user.id });
  }
  runSync_(new Date(), g.id);
  return { msg: 'Куратор назначен' };
};

ACTIONS.rescheduleLesson = function (user, f) {
  requirePerm_(user, 'schedule.edit');
  var date = parseDate_(str_(f, 'date'));
  var t = str_(f, 'time').split(':').map(Number);
  if (!date || isNaN(t[0])) fail_('Укажите дату и время');
  var startsAt = localDateTime_(date, t[0], t[1] || 0);
  var l = update_('lessons', str_(f, 'lessonId'), {
    startsAt: startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600000),
    teacherId: str_(f, 'teacherId'), roomId: str_(f, 'roomId') || byId_('lessons', str_(f, 'lessonId')).roomId
  });
  var g = byId_('groups', l.groupId);
  audit_(user.id, 'reschedule-lesson', 'lesson', l.id);
  notify_({ kind: 'lesson-change', title: 'Перенос/замена: ' + g.name + ', занятие ' + l.index + ' → ' + fmtDateTime_(startsAt),
    link: 'group/' + g.id + '?tab=schedule', ackHours: 24, userIds: broadcastRecipients_(g.id).concat([l.teacherId]), createdById: user.id });
  return { msg: 'Занятие изменено' };
};

// ───────────── Ученики ─────────────

ACTIONS.addStudent = function (user, f) {
  if (!can_(user, 'roster.edit') && !can_(user, 'recruit.edit')) fail_('Нет доступа');
  var g = byId_('groups', str_(f, 'groupId'));
  var name = str_(f, 'name');
  if (!name) fail_('Укажите ФИО');
  var branch = byId_('branches', g.branchId);
  if (!branch.isOnline && activeCount_(g.id) >= ROOM_CAPACITY) fail_('В группе уже ' + ROOM_CAPACITY + ' учеников');
  var st = insert_('students', {
    name: name, phone: str_(f, 'phone'), parentName: str_(f, 'parentName'), parentPhone: str_(f, 'parentPhone'),
    groupId: g.id, status: 'ACTIVE', joinedAt: new Date(), joinedMonth: g.status === 'ACTIVE' ? currentMonth_(g.id) : 1, createdAt: new Date()
  })[0];
  audit_(user.id, 'add-student', 'student', st.id, name + ' → ' + g.name);
  if (g.status === 'ACTIVE') {
    notify_({ kind: 'student-added', title: 'Новый ученик в группе ' + g.name + ': ' + name, link: 'student/' + st.id,
      ackHours: 24, userIds: broadcastRecipients_(g.id), createdById: user.id });
  }
  return { msg: 'Ученик добавлен: ' + name, open: 'add-student' };
};

ACTIONS.updateStudent = function (user, f) {
  var id = str_(f, 'studentId');
  var patch = {};
  if (can_(user, 'roster.edit') || can_(user, 'recruit.edit')) {
    ['name', 'phone', 'parentName', 'parentPhone'].forEach(function (k) { if (f[k] !== undefined) patch[k] = str_(f, k); });
    if (patch.name === '') fail_('ФИО не может быть пустым');
  }
  if (can_(user, 'student.bio') && f.bio !== undefined) patch.bio = str_(f, 'bio');
  if (can_(user, 'touch.edit') && f.parentsFlag !== undefined) {
    patch.parentsNotInvolved = on_(f, 'parentsNotInvolved');
    patch.parentsNotInvolvedReason = str_(f, 'parentsNotInvolvedReason');
    if (patch.parentsNotInvolved && !patch.parentsNotInvolvedReason) fail_('Укажите причину, почему родители не участвуют');
  }
  if (!Object.keys(patch).length) fail_('Нет доступа');
  update_('students', id, patch);
  audit_(user.id, 'update-student', 'student', id, Object.keys(patch).join(','));
  return { msg: 'Сохранено' };
};

// ───────────── Посещаемость, ДЗ, касания ─────────────

ACTIONS.saveAttendance = function (user, f) {
  requirePerm_(user, 'attendance.edit');
  var l = byId_('lessons', str_(f, 'lessonId'));
  var g = byId_('groups', l.groupId);
  var online = byId_('branches', g.branchId).isOnline;
  var canTest = can_(user, 'quicktest.edit') && !online;
  var now = new Date();
  var rows = [];
  list_(f, 'studentId').forEach(function (sid) {
    var status = str_(f, 'status_' + sid);
    if (['PRESENT', 'ABSENT', 'EXCUSED'].indexOf(status) < 0) return;
    if (l.startsAt > now && status !== 'EXCUSED') return;
    var reason = str_(f, 'reason_' + sid);
    if (status === 'EXCUSED' && !reason) fail_('Для «отпросился» нужна причина');
    rows.push({ sid: sid, status: status, reason: reason });
  });
  rows.forEach(function (r) {
    var patch = { status: r.status, reason: r.reason, note: str_(f, 'note_' + r.sid), markedById: user.id, markedAt: now };
    if (canTest) { patch.testScore = num_(f, 'score_' + r.sid); patch.testMax = num_(f, 'max_' + r.sid); }
    upsert_('attendance', function (a) { return a.studentId === r.sid && a.lessonId === l.id; }, { studentId: r.sid, lessonId: l.id }, patch);
  });
  audit_(user.id, 'save-attendance', 'lesson', l.id);
  runSync_(now, g.id);
  return { msg: 'Посещаемость сохранена (' + rows.length + ')' };
};

ACTIONS.markExcused = function (user, f) {
  requirePerm_(user, 'attendance.edit');
  var sid = str_(f, 'studentId'), lid = str_(f, 'lessonId'), reason = str_(f, 'reason');
  if (!reason) fail_('Укажите причину');
  upsert_('attendance', function (a) { return a.studentId === sid && a.lessonId === lid; }, { studentId: sid, lessonId: lid },
    { status: 'EXCUSED', reason: reason, markedById: user.id, markedAt: new Date() });
  audit_(user.id, 'mark-excused', 'student', sid, reason);
  return { msg: 'Отмечено: отпросился' };
};

ACTIONS.saveHomework = function (user, f) {
  requirePerm_(user, 'homework.edit');
  var l = byId_('lessons', str_(f, 'lessonId'));
  var rows = [];
  list_(f, 'studentId').forEach(function (sid) {
    ['EXPERIMENT', 'TEST'].forEach(function (type) {
      var p = type + '_' + sid;
      var state = str_(f, p + '_state');
      if (!state) return;
      var done = state === 'done';
      var reason = str_(f, p + '_reason');
      if (!done && !reason) fail_('Для несданного ДЗ укажите причину');
      rows.push({ sid: sid, type: type, patch: {
        done: done, score: type === 'TEST' ? num_(f, p + '_score') : null, maxScore: type === 'TEST' ? num_(f, p + '_max') : null,
        reason: done ? '' : reason, expectedDate: !done && str_(f, p + '_expected') ? parseDate_(str_(f, p + '_expected')) : null,
        markedById: user.id, markedAt: new Date() } });
    });
  });
  rows.forEach(function (r) {
    upsert_('homework', function (h) { return h.studentId === r.sid && h.lessonId === l.id && h.type === r.type; },
      { studentId: r.sid, lessonId: l.id, type: r.type }, r.patch);
  });
  audit_(user.id, 'save-homework', 'lesson', l.id);
  runSync_(new Date(), l.groupId);
  return { msg: 'ДЗ сохранено' };
};

ACTIONS.saveTouches = function (user, f) {
  requirePerm_(user, 'touch.edit');
  var gid = str_(f, 'groupId'), month = Number(str_(f, 'courseMonth')), number = Number(str_(f, 'number'));
  var rows = [];
  list_(f, 'studentId').forEach(function (sid) {
    var state = str_(f, 'state_' + sid);
    if (!state) return;
    var response = str_(f, 'response_' + sid);
    if (state === 'answered' && !response) fail_('Запишите ответ родителя дословно');
    rows.push({ sid: sid, patch: { awaiting: state === 'awaiting', response: state === 'awaiting' ? '' : response, byId: user.id, doneAt: new Date() } });
  });
  rows.forEach(function (r) {
    upsert_('touches', function (t) { return t.studentId === r.sid && t.groupId === gid && t.courseMonth === month && t.number === number; },
      { studentId: r.sid, groupId: gid, courseMonth: month, number: number }, r.patch);
  });
  audit_(user.id, 'save-touches', 'group', gid, month + '/' + number);
  runSync_(new Date(), gid);
  return { msg: 'Касания сохранены' };
};

// ───────────── Движения ─────────────

ACTIONS.createMovement = function (user, f) {
  requirePerm_(user, 'roster.edit');
  var st = byId_('students', str_(f, 'studentId'));
  var from = byId_('groups', st.groupId);
  var type = str_(f, 'type');
  var toId = type === 'TRANSFER' ? str_(f, 'toGroupId') : '';
  var cat = str_(f, 'reasonCategory'), verb = str_(f, 'reasonVerbatim'), act = str_(f, 'curatorAction');
  if ((type === 'LEAVE' || type === 'TRANSFER') && (!cat || !verb)) fail_('Укажите причину и слова ученика дословно');
  if (type === 'LEAVE' && !act) fail_('Укажите, что сделал куратор');
  if (type === 'TRANSFER' && !toId) fail_('Выберите группу для перевода');
  if (toId === st.groupId) fail_('Ученик уже в этой группе');
  if (toId) {
    var toG = byId_('groups', toId);
    if (!toG) fail_('Группа не найдена');
    if (!byId_('branches', toG.branchId).isOnline && activeCount_(toId) >= ROOM_CAPACITY) fail_('В группе «' + toG.name + '» нет мест');
  }
  insert_('movements', {
    studentId: st.id, type: type, fromGroupId: st.groupId, toGroupId: toId, courseMonth: currentMonth_(st.groupId),
    reasonCategory: cat, reasonVerbatim: verb, curatorAction: act, links: str_(f, 'links'), comment: str_(f, 'comment'),
    churnBusiness: type === 'TRANSFER' ? false : null, createdById: user.id, createdAt: new Date()
  });
  var title;
  if (type === 'TRANSFER') {
    var to = byId_('groups', toId);
    var toBranch = byId_('branches', to.branchId);
    update_('students', st.id, { groupId: to.id, joinedAt: new Date(), joinedMonth: to.status === 'ACTIVE' ? currentMonth_(to.id) : 1 });
    title = 'Перевод: ' + st.name + ' — ' + from.name + ' → ' + to.name + ' (' + toBranch.name + ')';
  } else if (type === 'LEAVE') {
    update_('students', st.id, { status: 'LEFT' });
    title = 'Уход: ' + st.name + ' (' + from.name + ')';
  } else {
    title = 'Изменение состава: ' + st.name + ' (' + from.name + ')';
  }
  audit_(user.id, 'movement-' + type, 'student', st.id, title);
  var ids = broadcastRecipients_(from.id).concat(toId ? broadcastRecipients_(toId) : []).filter(function (id) { return id !== user.id; });
  notify_({ kind: 'movement', red: true, ackHours: 24, title: title,
    body: [cat, verb ? '«' + verb + '»' : '', act ? 'Куратор: ' + act : ''].filter(String).join(' · '),
    link: 'student/' + st.id, userIds: ids, createdById: user.id });
  return { msg: 'Сохранено. Все получили уведомление.' };
};

ACTIONS.reviewMovement = function (user, f) {
  if (!user.isFull) fail_('Атрибуцию ухода ставит только полный доступ');
  var v = function (k) { var s = str_(f, k); return s === 'yes' ? true : s === 'no' ? false : null; };
  update_('movements', str_(f, 'movementId'), {
    churnCurator: v('churnCurator'), churnChem: v('churnChem'), churnBio: v('churnBio'), churnBusiness: v('churnBusiness'),
    reviewedById: user.id, reviewedAt: new Date()
  });
  audit_(user.id, 'review-movement', 'movement', str_(f, 'movementId'));
  return { msg: 'Сохранено' };
};

// ───────────── Риски и отзывы ─────────────

ACTIONS.addRisk = function (user, f) {
  requirePerm_(user, 'risk.create');
  var reason = str_(f, 'reason');
  if (!reason) fail_('Укажите причину риска');
  createRisk_(str_(f, 'studentId'), 'MANUAL', reason, user.id);
  audit_(user.id, 'add-risk', 'student', str_(f, 'studentId'), reason);
  return { msg: 'Риск поставлен, все увидят' };
};

ACTIONS.closeRisk = function (user, f) {
  if (!can_(user, 'risk.create') && !user.isFull) fail_('Нет доступа');
  update_('risks', str_(f, 'riskId'), { open: false, closedAt: new Date(), closedById: user.id, closeNote: str_(f, 'closeNote') });
  audit_(user.id, 'close-risk', 'risk', str_(f, 'riskId'));
  return { msg: 'Риск снят' };
};

ACTIONS.createFeedback = function (user, f) {
  var tone = str_(f, 'tone'), text = str_(f, 'text'), risk = str_(f, 'churnRisk');
  var sid = str_(f, 'studentId');
  if (!text) fail_('Запишите отзыв дословно или реакцию');
  if (tone === 'NEGATIVE' && !risk) fail_('Для негативного отзыва укажите: есть риск ухода или нет');
  var st = sid ? byId_('students', sid) : null;
  var fb = insert_('feedback', {
    date: parseDate_(str_(f, 'date')) || todayLocal_(), studentId: sid, groupId: st ? st.groupId : '', anonymous: on_(f, 'anonymous'),
    fromType: str_(f, 'fromType'), fromStaffId: str_(f, 'fromStaffId'), channel: str_(f, 'channel'), about: str_(f, 'about'),
    aboutStaffId: str_(f, 'aboutStaffId'), tone: tone, text: text, link: str_(f, 'link'),
    churnRisk: risk === 'yes' ? true : risk === 'no' ? false : null, action: str_(f, 'action'), status: 'OPEN',
    checkDate: parseDate_(str_(f, 'checkDate')), createdById: user.id, createdAt: new Date()
  })[0];
  audit_(user.id, 'create-feedback', 'feedback', fb.id);
  if (risk === 'yes' && st) {
    createRisk_(st.id, 'FEEDBACK', 'Негативный отзыв: «' + text.slice(0, 120) + '»', user.id);
  } else if (tone === 'NEGATIVE') {
    notify_({ kind: 'feedback', red: true, title: 'Негативный отзыв', body: text.slice(0, 200), link: 'feedback?view=control',
      userIds: where_('users', function (u) { return u.isFull && u.active; }).map(function (u) { return u.id; }), createdById: user.id });
  }
  return { msg: 'Отзыв сохранён', redirect: st ? 'student/' + st.id : 'feedback' };
};

ACTIONS.updateFeedback = function (user, f) {
  var fb = byId_('feedback', str_(f, 'feedbackId'));
  if (!user.isFull && !user.isHead && fb.createdById !== user.id) fail_('Нет доступа');
  var patch = { status: str_(f, 'status') || fb.status, action: f.action !== undefined ? str_(f, 'action') : fb.action };
  if ((user.isFull || user.isHead) && f.decision !== undefined) patch.decision = str_(f, 'decision');
  if (str_(f, 'checkDate')) patch.checkDate = parseDate_(str_(f, 'checkDate'));
  update_('feedback', fb.id, patch);
  audit_(user.id, 'update-feedback', 'feedback', fb.id);
  return { msg: 'Сохранено' };
};

ACTIONS.saveSurvey = function (user, f) {
  requirePerm_(user, 'survey.edit');
  var gid = str_(f, 'groupId'), month = Number(str_(f, 'courseMonth'));
  upsert_('surveys', function (s) { return s.groupId === gid && s.courseMonth === month; }, { groupId: gid, courseMonth: month, createdAt: new Date() },
    { chemPct: num_(f, 'chemPct'), bioPct: num_(f, 'bioPct'), curatorPct: num_(f, 'curatorPct'), adminPct: num_(f, 'adminPct'), byId: user.id });
  audit_(user.id, 'save-survey', 'group', gid, String(month));
  runSync_(new Date(), gid);
  return { msg: 'Опросник сохранён' };
};

// ───────────── Задачи и уведомления ─────────────

ACTIONS.completeTask = function (user, f) {
  var t = byId_('tasks', str_(f, 'taskId'));
  if (!t || !(taskVisible_(user, t) || user.isFull)) fail_('Это не ваша задача');
  update_('tasks', t.id, { status: 'DONE', doneAt: new Date(), doneById: user.id });
  audit_(user.id, 'complete-task', 'task', t.id);
  return {};
};

ACTIONS.ack = function (user, f) {
  var r = byId_('recipients', str_(f, 'recipientId'));
  if (r && r.userId === user.id) update_('recipients', r.id, { ackAt: new Date() });
  return {};
};

ACTIONS.ackAll = function (user) {
  var red = {};
  all_('notifications').forEach(function (n) { if (n.red) red[n.id] = true; });
  where_('recipients', function (r) { return r.userId === user.id && !r.ackAt && !red[r.notificationId]; })
    .forEach(function (r) { update_('recipients', r.id, { ackAt: new Date() }); });
  return {};
};

// ───────────── Сотрудники ─────────────

ACTIONS.createStaff = function (user, f) {
  var dept = str_(f, 'department');
  if (!canManageStaff_(user, dept)) fail_('Вы можете добавлять сотрудников только своего отдела');
  var login = str_(f, 'login').toLowerCase(), name = str_(f, 'name');
  if (!login || !name) fail_('Укажите имя и логин');
  if (!/^[a-z0-9._-]{3,32}$/.test(login)) fail_('Логин: латиница, цифры, . _ - (3–32 символа)');
  if (find_('users', function (u) { return u.login === login; })) fail_('Такой логин уже есть');
  var code = str_(f, 'code') || genCode_();
  var isFull = user.isFull && (on_(f, 'isFull') || dept === 'LEADERSHIP');
  var u = insert_('users', {
    name: name, login: login, codeHash: hashCode_(code), department: dept, isHead: user.isFull && on_(f, 'isHead'),
    isFull: isFull, permissions: DEFAULT_PERMISSIONS[dept] || [], active: true, createdAt: new Date()
  })[0];
  audit_(user.id, 'create-staff', 'user', u.id, name + ' (' + dept + ')');
  return { msg: 'Сотрудник создан. Логин: ' + login + ', код: ' + code + ' — передайте лично.', keep: true };
};

ACTIONS.updateStaff = function (user, f) {
  var target = byId_('users', str_(f, 'userId'));
  if (!canManageStaff_(user, target.department) || (target.isFull && !user.isFull)) fail_('Нет доступа');
  var allowed = user.isFull ? DEPARTMENTS.reduce(function (a, d) { return a.concat(GRANTABLE[d]); }, []) : GRANTABLE[target.department];
  var requested = list_(f, 'perm').filter(function (p) { return allowed.indexOf(p) >= 0; });
  var kept = (target.permissions || []).filter(function (p) { return allowed.indexOf(p) < 0; });
  var perms = kept.concat(requested).filter(function (p, i, a) { return a.indexOf(p) === i; });
  var patch = { name: str_(f, 'name') || target.name, permissions: perms, active: on_(f, 'active') };
  if (user.isFull) {
    patch.isHead = on_(f, 'isHead');
    patch.isFull = target.id === user.id ? true : on_(f, 'isFull');
    if (target.id === user.id) patch.active = true;
  }
  update_('users', target.id, patch);
  audit_(user.id, 'update-staff', 'user', target.id, perms.join(','));
  return { msg: 'Сохранено' };
};

ACTIONS.resetCode = function (user, f) {
  var target = byId_('users', str_(f, 'userId'));
  if (!canManageStaff_(user, target.department) || (target.isFull && !user.isFull)) fail_('Нет доступа');
  var code = genCode_();
  update_('users', target.id, { codeHash: hashCode_(code) });
  audit_(user.id, 'reset-code', 'user', target.id);
  return { msg: 'Новый код для ' + target.login + ': ' + code, keep: true };
};

ACTIONS.changeOwnCode = function (user, f) {
  if (!verifyCode_(str_(f, 'oldCode'), user.codeHash)) fail_('Текущий код неверный');
  if (str_(f, 'newCode').length < 4) fail_('Новый код — минимум 4 символа');
  update_('users', user.id, { codeHash: hashCode_(str_(f, 'newCode')) });
  audit_(user.id, 'change-code', 'user', user.id);
  return { msg: 'Код изменён', keep: true };
};
