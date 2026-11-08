/** Данные для страниц. Даты отдаются уже отформатированными строками. */

var VIEWS = {};

function nameOf_(table, id) { var o = byId_(table, id); return o ? o.name : ''; }

VIEWS.me = function (user) {
  var now = new Date();
  var unacked = where_('recipients', function (r) { return r.userId === user.id && !r.ackAt; }).length;
  var overdue = where_('tasks', function (t) { return t.status === 'OPEN' && t.dueAt < now && taskVisible_(user, t); }).length;
  return {
    user: publicUser_(user),
    deptLabel: user.isFull ? 'полный доступ' : DEPARTMENT_LABEL[user.department] + (user.isHead ? ' (руководитель)' : ''),
    badge: unacked + overdue,
    canReports: can_(user, 'reports.view'),
    showStaff: user.isFull || user.isHead
  };
};

VIEWS.home = function (user) {
  var now = new Date();
  var today = todayLocal_(now);
  var notifs = {};
  all_('notifications').forEach(function (n) { notifs[n.id] = n; });
  var mine = where_('recipients', function (r) { return r.userId === user.id && !r.ackAt; })
    .map(function (r) { var n = notifs[r.notificationId]; return n ? { rid: r.id, n: n } : null; })
    .filter(Boolean)
    .sort(function (a, b) { return b.n.createdAt - a.n.createdAt; });
  var noteOut = function (x) {
    return { rid: x.rid, kind: x.n.kind, title: x.n.title, body: x.n.body, link: x.n.link, created: fmtDateTime_(x.n.createdAt), ackDue: x.n.ackDueAt ? fmtDateTime_(x.n.ackDueAt) : '' };
  };
  var taskOut = function (t) { return { id: t.id, title: t.title, details: t.details, link: t.link, due: fmtDateTime_(t.dueAt), manual: t.manual }; };
  var tasks = all_('tasks').filter(function (t) { return t.status === 'OPEN'; });
  var overdue = tasks.filter(function (t) { return t.dueAt < now && (user.isFull || taskVisible_(user, t)); })
    .sort(function (a, b) { return a.dueAt - b.dueAt; }).map(taskOut);
  var open = tasks.filter(function (t) { return t.dueAt >= now && taskVisible_(user, t); })
    .sort(function (a, b) { return a.dueAt - b.dueAt; }).map(taskOut);

  var visGroups = {};
  visibleGroups_(user).forEach(function (g) { visGroups[g.id] = g; });
  var srcLabel = { MANUAL: 'риск (куратор)', FEEDBACK: 'риск (отзыв)', AUTO_ABSENCE: 'авто-риск', AUTO_HOMEWORK: 'авто-риск' };
  var risks = where_('risks', function (r) { return r.open; }).map(function (r) {
    var st = byId_('students', r.studentId);
    if (!st || st.status !== 'ACTIVE' || !visGroups[st.groupId]) return null;
    return { studentId: st.id, student: st.name, group: visGroups[st.groupId].name, reason: r.reason, source: srcLabel[r.source] };
  }).filter(Boolean);

  var lateAcks = [], unreviewed = [], fbOverdue = [];
  if (user.isFull) {
    var pending = {};
    where_('recipients', function (r) { return !r.ackAt; }).forEach(function (r) { (pending[r.notificationId] = pending[r.notificationId] || []).push(r.userId); });
    all_('notifications').forEach(function (n) {
      if (n.ackDueAt && n.ackDueAt < now && pending[n.id]) {
        lateAcks.push({ title: n.title, link: n.link, names: pending[n.id].map(function (id) { return nameOf_('users', id); }).join(', ') });
      }
    });
    unreviewed = where_('movements', function (m) { return (m.type === 'LEAVE' || m.type === 'TRANSFER') && !m.reviewedAt; })
      .map(function (m) { return { id: m.id, student: nameOf_('students', m.studentId), studentId: m.studentId }; });
  }
  if (user.isFull || user.isHead) {
    fbOverdue = where_('feedback', function (f) {
      return (f.status === 'OPEN' || f.status === 'IN_PROGRESS') && (f.tone === 'NEGATIVE' || f.churnRisk === true) && f.checkDate && f.checkDate < today;
    }).map(function (f) { return { student: f.studentId ? nameOf_('students', f.studentId) : 'анонимно', text: f.text.slice(0, 100), check: fmtDate_(f.checkDate) }; });
  }
  return {
    name: user.name,
    redNotes: mine.filter(function (x) { return x.n.red; }).map(noteOut),
    notes: mine.filter(function (x) { return !x.n.red; }).slice(0, 50).map(noteOut),
    overdue: overdue, open: open, risks: risks, lateAcks: lateAcks.slice(0, 30), unreviewed: unreviewed, fbOverdue: fbOverdue
  };
};

function nextStartIso_(days) {
  var d = addDays_(todayLocal_(), 1);
  while (!matchesDays_(d, days)) d = addDays_(d, 1);
  return isoDate_(d);
}

VIEWS.schedule = function (user) {
  var branches = all_('branches').slice().sort(function (a, b) { return a.order - b.order; });
  var groups = where_('groups', function (g) { return g.status !== 'FINISHED'; });
  var staff = where_('users', function (u) { return u.active && (u.department === 'TEACHER' || u.department === 'CURATOR'); })
    .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return {
    canOpen: can_(user, 'recruit.edit'),
    nextStart: { MWF: nextStartIso_('MWF'), TTS: nextStartIso_('TTS') },
    branches: branches.map(function (b) {
      return {
        id: b.id, name: b.name, isOnline: b.isOnline,
        rooms: where_('rooms', function (r) { return r.branchId === b.id; }).sort(function (x, y) { return x.order - y.order; })
          .map(function (r) { return { id: r.id, name: r.name, capacity: r.capacity }; }),
        groups: groups.filter(function (g) { return g.branchId === b.id; }).sort(function (x, y) { return x.startDate - y.startDate; })
          .map(function (g) { return { id: g.id, name: g.name, status: g.status, days: g.days, slot: g.slot, roomId: g.roomId, count: activeCount_(g.id), start: fmtDate_(g.startDate) }; })
      };
    }),
    staff: staff.map(function (u) {
      var cells = {};
      groups.filter(function (g) { return g.curatorId === u.id || g.chemTeacherId === u.id || g.bioTeacherId === u.id; }).forEach(function (g) {
        (cells[g.days + '_' + g.slot] = cells[g.days + '_' + g.slot] || []).push({ id: g.id, name: g.name });
      });
      return { name: u.name, dept: u.department === 'TEACHER' ? 'преп.' : 'куратор', cells: cells };
    })
  };
};

VIEWS.groups = function (user, p) {
  var finished = p.status === 'finished';
  var branches = all_('branches').slice().sort(function (a, b) { return a.order - b.order; });
  var order = {};
  branches.forEach(function (b) { order[b.id] = b.order; });
  var list = visibleGroups_(user).filter(function (g) {
    return (finished ? g.status === 'FINISHED' : g.status !== 'FINISHED') && (!p.branch || g.branchId === p.branch);
  }).sort(function (a, b) { return (order[a.branchId] - order[b.branchId]) || (a.startDate - b.startDate); });
  return {
    finished: finished, branch: p.branch || '',
    branches: branches.map(function (b) { return { id: b.id, name: b.name }; }),
    groups: list.map(function (g) {
      var b = byId_('branches', g.branchId);
      var studs = where_('students', function (s) { return s.groupId === g.id && s.status === 'ACTIVE'; });
      var openRisk = {};
      where_('risks', function (r) { return r.open; }).forEach(function (r) { openRisk[r.studentId] = true; });
      return {
        id: g.id, name: g.name, branch: b.name + (g.roomId ? ', ' + nameOf_('rooms', g.roomId) : ''), schedule: DAYS_LABEL[g.days] + ', ' + SLOT_LABEL[g.slot],
        start: fmtDate_(g.startDate), count: studs.length, online: b.isOnline, chem: nameOf_('users', g.chemTeacherId),
        bio: nameOf_('users', g.bioTeacherId), curator: nameOf_('users', g.curatorId), status: g.status,
        risks: studs.filter(function (s) { return openRisk[s.id]; }).length
      };
    })
  };
};

VIEWS.group = function (user, p) {
  var g = byId_('groups', p.id);
  if (!g || !groupVisible_(user, g)) fail_('Группа не найдена или нет доступа');
  var now = new Date();
  var branch = byId_('branches', g.branchId);
  var lessons = lessonsOf_(g.id);
  var lessonIds = idSet_(lessons);
  var allStudents = where_('students', function (s) { return s.groupId === g.id; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  var active = allStudents.filter(function (s) { return s.status === 'ACTIVE'; });
  var att = where_('attendance', function (a) { return lessonIds[a.lessonId]; });
  var hw = where_('homework', function (h) { return lessonIds[h.lessonId]; });
  var past = lessons.filter(function (l) { return l.startsAt <= now; });
  var cm = groupCurrentMonth_(lessons, now);
  var late = lateJoins_(g.id, lessons);
  var openRisk = {};
  where_('risks', function (r) { return r.open; }).forEach(function (r) { openRisk[r.studentId] = true; });
  var tab = p.tab || 'overview';

  var sel = lessons.filter(function (l) { return l.index === Number(p.lesson); })[0];
  if (!sel) {
    if (tab === 'homework') { var ended = past.filter(function (l) { return l.endsAt <= now; }); sel = ended[ended.length - 1]; }
    else sel = past[past.length - 1];
  }
  if (!sel) sel = lessons[0];

  var lessonOut = function (l) {
    var loc = toLocal_(l.startsAt);
    return {
      id: l.id, index: l.index, month: l.courseMonth, pos: positionInMonth_(l.index), subject: SUBJECT_LABEL[l.subject],
      when: fmtDateTime_(l.startsAt), date: fmtDate_(l.startsAt), past: l.startsAt <= now, ended: l.endsAt <= now,
      teacher: nameOf_('users', l.teacherId), teacherId: l.teacherId, room: nameOf_('rooms', l.roomId), roomId: l.roomId,
      localDate: isoDate_(loc), localTime: pad2_(loc.getUTCHours()) + ':' + pad2_(loc.getUTCMinutes())
    };
  };
  var studentOut = function (s) {
    var a = attendanceRatio_(att.filter(function (x) { return x.studentId === s.id; }), lessons);
    var h = homeworkRatio_(hw.filter(function (x) { return x.studentId === s.id; }), lessons);
    return { id: s.id, name: s.name, phone: s.phone, parentName: s.parentName, parentPhone: s.parentPhone, att: pctOf_(a), hw: pctOf_(h),
      risk: !!openRisk[s.id], lateMonth: late[s.id] || null, parentsNotInvolved: s.parentsNotInvolved, parentsReason: s.parentsNotInvolvedReason,
      joinedBeforeSelEnd: sel ? s.joinedAt <= sel.endsAt : true };
  };

  var kpis = [
    { label: 'Посещаемость: химия', r: attendanceRatio_(att, lessons, bySubject_('CHEM')) },
    { label: 'Посещаемость: биология', r: attendanceRatio_(att, lessons, bySubject_('BIO')) }
  ];
  if (!branch.isOnline) {
    kpis.push({ label: 'Эффективность: химия', p: efficiency_(att, lessons, bySubject_('CHEM')) });
    kpis.push({ label: 'Эффективность: биология', p: efficiency_(att, lessons, bySubject_('BIO')) });
  }
  kpis.push({ label: 'ДЗ: опыты', r: homeworkRatio_(hw, lessons, null, 'EXPERIMENT') });
  kpis.push({ label: 'ДЗ: тесты', r: homeworkRatio_(hw, lessons, null, 'TEST') });
  if (g.status === 'ACTIVE' || g.status === 'FINISHED') kpis.push({ label: 'Удержание (бизнес), мес. ' + cm, r: retention_(g, lessons, cm, 'business') });

  var month = Number(p.month) || cm, number = Number(p.n) || 1;
  var touches = where_('touches', function (t) { return t.groupId === g.id && t.courseMonth === month && t.number === number; });
  var movements = where_('movements', function (m) { return m.fromGroupId === g.id || m.toGroupId === g.id; })
    .sort(function (a, b) { return b.createdAt - a.createdAt; });
  var users = where_('users', function (u) { return u.active; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  return {
    id: g.id, name: g.name, description: g.description, status: g.status, branch: branch.name, online: branch.isOnline,
    room: nameOf_('rooms', g.roomId), roomId: g.roomId, days: g.days, slot: g.slot, daysLabel: DAYS_LABEL[g.days], slotLabel: SLOT_LABEL[g.slot],
    start: fmtDate_(g.startDate), startIso: isoDate_(g.startDate), months: g.months, price: g.price, startCount: g.startCount,
    chem: nameOf_('users', g.chemTeacherId), chemId: g.chemTeacherId, bio: nameOf_('users', g.bioTeacherId), bioId: g.bioTeacherId,
    curator: nameOf_('users', g.curatorId), curatorId: g.curatorId, currentMonth: cm, tab: tab,
    can: {
      org: can_(user, 'schedule.edit'), recruit: can_(user, 'recruit.edit'), roster: can_(user, 'roster.edit') || can_(user, 'recruit.edit'),
      curator: user.isFull || (user.isHead && user.department === 'CURATOR'), attendance: can_(user, 'attendance.edit'),
      quicktest: can_(user, 'quicktest.edit'), homework: can_(user, 'homework.edit'), touch: can_(user, 'touch.edit'), survey: can_(user, 'survey.edit')
    },
    kpis: kpis.map(function (k) { return { label: k.label, p: k.r ? pctOf_(k.r) : k.p, num: k.r ? k.r.num : null, den: k.r ? k.r.den : null }; }),
    activeCount: active.length,
    students: active.map(studentOut),
    left: allStudents.filter(function (s) { return s.status === 'LEFT'; }).map(function (s) { return s.name; }),
    lessons: lessons.map(lessonOut),
    sel: sel ? lessonOut(sel) : null,
    selAtt: sel ? att.filter(function (a) { return a.lessonId === sel.id; }).map(function (a) {
      return { studentId: a.studentId, status: a.status, reason: a.reason, testScore: a.testScore, testMax: a.testMax, note: a.note };
    }) : [],
    selHw: sel ? hw.filter(function (h) { return h.lessonId === sel.id; }).map(function (h) {
      return { studentId: h.studentId, type: h.type, done: h.done, score: h.score, maxScore: h.maxScore, reason: h.reason, expected: isoDate_(h.expectedDate) };
    }) : [],
    touchMonth: month, touchNumber: number,
    touches: touches.map(function (t) { return { studentId: t.studentId, awaiting: t.awaiting, response: t.response }; }),
    surveys: where_('surveys', function (s) { return s.groupId === g.id; }).map(function (s) {
      return { month: s.courseMonth, chemPct: s.chemPct, bioPct: s.bioPct, curatorPct: s.curatorPct, adminPct: s.adminPct };
    }),
    monthsList: lessons.map(function (l) { return l.courseMonth; }).filter(function (m, i, a) { return a.indexOf(m) === i; }),
    teachers: users.filter(function (u) { return u.department === 'TEACHER'; }).map(function (u) { return { id: u.id, name: u.name }; }),
    curators: users.filter(function (u) { return u.department === 'CURATOR'; }).map(function (u) { return { id: u.id, name: u.name }; }),
    rooms: where_('rooms', function (r) { return r.branchId === g.branchId; }).sort(function (a, b) { return a.order - b.order; }).map(function (r) { return { id: r.id, name: r.name }; }),
    movements: movements.map(function (m) {
      return { date: fmtDate_(m.createdAt), studentId: m.studentId, student: nameOf_('students', m.studentId), type: m.type,
        incoming: m.toGroupId === g.id, reason: m.reasonCategory, verbatim: m.reasonVerbatim, action: m.curatorAction };
    }),
    newcomers: allStudents.filter(function (s) {
      return late[s.id] && !movements.some(function (m) { return m.studentId === s.id && m.toGroupId === g.id; });
    }).map(function (s) { return { id: s.id, name: s.name, date: fmtDate_(s.joinedAt), month: s.joinedMonth }; })
  };
};

VIEWS.student = function (user, p) {
  var st = byId_('students', p.id);
  var g = st ? byId_('groups', st.groupId) : null;
  if (!st || !groupVisible_(user, g)) fail_('Ученик не найден или нет доступа');
  var now = new Date();
  var lessons = lessonsOf_(g.id);
  var att = where_('attendance', function (a) { return a.studentId === st.id; });
  var hw = where_('homework', function (h) { return h.studentId === st.id; });
  var past = lessons.filter(function (l) { return l.startsAt <= now; });
  var months = lessons.map(function (l) { return l.courseMonth; }).filter(function (m, i, a) { return a.indexOf(m) === i; });
  var show = function (r) { return r.den ? pctOf_(r) + '% (' + r.num + '/' + r.den + ')' : '—'; };
  var prev = null;
  var progress = months.map(function (m) {
    var f = byMonth_(m);
    var hwm = pctOf_(homeworkRatio_(hw, lessons, f));
    var trend = (hwm != null && prev != null) ? (hwm > prev ? 'up' : hwm < prev ? 'down' : 'same') : '';
    prev = hwm;
    return {
      month: m,
      chem: show(attendanceRatio_(att, lessons, function (l) { return f(l) && l.subject === 'CHEM'; })),
      bio: show(attendanceRatio_(att, lessons, function (l) { return f(l) && l.subject === 'BIO'; })),
      exp: show(homeworkRatio_(hw, lessons, f, 'EXPERIMENT')), test: show(homeworkRatio_(hw, lessons, f, 'TEST')), trend: trend
    };
  });
  var candidates = [];
  if (can_(user, 'roster.edit')) {
    candidates = where_('groups', function (x) {
      return x.id !== g.id && x.status !== 'FINISHED' && (!p.days || x.days === p.days) && (!p.slot || x.slot === p.slot);
    }).map(function (x) {
      var b = byId_('branches', x.branchId);
      var c = activeCount_(x.id);
      return { id: x.id, label: b.name + ' · ' + x.name + ' · ' + DAYS_LABEL[x.days] + ' ' + SLOT_LABEL[x.slot] + ' · ' + (b.isOnline ? 'без лимита' : (ROOM_CAPACITY - c) + ' мест'),
        full: !b.isOnline && c >= ROOM_CAPACITY };
    });
  }
  var lessonById = {};
  lessons.forEach(function (l) { lessonById[l.id] = l; });
  var srcLabel = { MANUAL: 'куратор', AUTO_ABSENCE: 'авто: пропуски', AUTO_HOMEWORK: 'авто: ДЗ', FEEDBACK: 'отзыв' };
  return {
    id: st.id, name: st.name, status: st.status, phone: st.phone, parentName: st.parentName, parentPhone: st.parentPhone, bio: st.bio,
    parentsNotInvolved: st.parentsNotInvolved, parentsReason: st.parentsNotInvolvedReason,
    groupId: g.id, group: g.name, branch: nameOf_('branches', g.branchId), curator: nameOf_('users', g.curatorId),
    done: past.length, left: lessons.length - past.length,
    att: attendanceRatio_(att, lessons), hw: homeworkRatio_(hw, lessons), progress: progress,
    can: { roster: can_(user, 'roster.edit') || can_(user, 'recruit.edit'), move: can_(user, 'roster.edit'), bio: can_(user, 'student.bio'),
      touch: can_(user, 'touch.edit'), risk: can_(user, 'risk.create'), closeRisk: can_(user, 'risk.create') || user.isFull, attendance: can_(user, 'attendance.edit') },
    risks: where_('risks', function (r) { return r.studentId === st.id; }).sort(function (a, b) { return b.createdAt - a.createdAt; })
      .map(function (r) { return { id: r.id, open: r.open, source: srcLabel[r.source], date: fmtDate_(r.createdAt), reason: r.reason, closeNote: r.closeNote }; }),
    upcoming: lessons.filter(function (l) { return l.startsAt > now; }).slice(0, 6)
      .map(function (l) { return { id: l.id, label: 'Занятие ' + l.index + ' · ' + SUBJECT_LABEL[l.subject] + ' · ' + fmtDateTime_(l.startsAt) }; }),
    days: p.days || '', slot: p.slot || '', candidates: candidates, reasons: LEAVE_REASONS,
    attendance: past.map(function (l) {
      var a = att.filter(function (x) { return x.lessonId === l.id; })[0];
      return { index: l.index, date: fmtDate_(l.startsAt), subject: SUBJECT_LABEL[l.subject], status: a ? a.status : '',
        info: a ? [a.reason, a.testScore != null ? 'тест ' + a.testScore + '/' + (a.testMax || '?') : '', a.note].filter(String).join(' ') : '' };
    }),
    homework: past.filter(function (l) { return l.endsAt <= now; }).map(function (l) {
      var cell = function (type) {
        var h = hw.filter(function (x) { return x.lessonId === l.id && x.type === type; })[0];
        if (!h) return null;
        return { done: h.done, score: h.score, max: h.maxScore, reason: h.reason, expected: h.expectedDate ? fmtDate_(h.expectedDate) : '' };
      };
      return { index: l.index, exp: cell('EXPERIMENT'), test: cell('TEST') };
    }),
    touches: where_('touches', function (t) { return t.studentId === st.id; }).sort(function (a, b) { return a.courseMonth - b.courseMonth || a.number - b.number; })
      .map(function (t) { return { month: t.courseMonth, number: t.number, date: fmtDate_(t.doneAt), awaiting: t.awaiting, response: t.response }; }),
    feedback: where_('feedback', function (f) { return f.studentId === st.id; }).sort(function (a, b) { return b.date - a.date; })
      .map(function (f) { return { tone: f.tone, date: fmtDate_(f.date), from: f.fromType, about: f.about, text: f.text }; }),
    movements: where_('movements', function (m) { return m.studentId === st.id; }).sort(function (a, b) { return b.createdAt - a.createdAt; })
      .map(function (m) { return { date: fmtDate_(m.createdAt), type: m.type, from: nameOf_('groups', m.fromGroupId), to: nameOf_('groups', m.toGroupId),
        reason: m.reasonCategory, verbatim: m.reasonVerbatim, action: m.curatorAction, links: m.links }; })
  };
};

VIEWS.feedbackNew = function (user, p) {
  var vis = {};
  visibleGroups_(user).forEach(function (g) { vis[g.id] = g.name; });
  return {
    student: p.student || '', today: isoDate_(todayLocal_()), check: isoDate_(addDays_(todayLocal_(), 3)),
    students: where_('students', function (s) { return s.status === 'ACTIVE' && vis[s.groupId]; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (s) { return { id: s.id, label: s.name + ' (' + vis[s.groupId] + ')' }; }),
    staff: where_('users', function (u) { return u.active; }).map(function (u) { return { id: u.id, name: u.name }; }),
    from: FEEDBACK_FROM, channels: FEEDBACK_CHANNEL, about: FEEDBACK_ABOUT
  };
};

VIEWS.feedback = function (user, p) {
  var own = null;
  if (seesOnlyOwnGroups_(user)) { own = {}; visibleGroups_(user).forEach(function (g) { own[g.id] = true; }); }
  var items = where_('feedback', function (f) {
    return !own || f.createdById === user.id || own[f.groupId] || f.aboutStaffId === user.id;
  }).sort(function (a, b) { return b.date - a.date; });
  var today = todayLocal_();
  var out = function (f) {
    return { id: f.id, date: fmtDate_(f.date), group: nameOf_('groups', f.groupId) || '—', student: f.anonymous ? 'анонимно' : (nameOf_('students', f.studentId) || '—'),
      studentId: f.anonymous ? '' : f.studentId, from: f.fromType + (f.fromStaffId ? ': ' + nameOf_('users', f.fromStaffId) : ''), channel: f.channel,
      about: f.about + (f.aboutStaffId ? ': ' + nameOf_('users', f.aboutStaffId) : ''), tone: f.tone, risk: f.churnRisk, text: f.text, link: f.link,
      status: f.status, action: f.action, decision: f.decision, check: f.checkDate ? fmtDate_(f.checkDate) : '', checkIso: isoDate_(f.checkDate),
      overdue: !!(f.checkDate && f.checkDate < today), daysOpen: Math.floor((Date.now() - f.createdAt.getTime()) / 86400000) };
  };
  var summarize = function (list) {
    var neg = list.filter(function (f) { return f.tone === 'NEGATIVE'; }).length;
    return { total: list.length, pos: list.filter(function (f) { return f.tone === 'POSITIVE'; }).length,
      neu: list.filter(function (f) { return f.tone === 'NEUTRAL'; }).length, neg: neg, negPct: list.length ? Math.round(neg / list.length * 100) : 0,
      risk: list.filter(function (f) { return f.churnRisk === true; }).length,
      open: list.filter(function (f) { return f.status === 'OPEN' || f.status === 'IN_PROGRESS'; }).length };
  };
  var groupBy = function (keyFn) {
    var m = {};
    items.forEach(function (f) { var k = keyFn(f); (m[k] = m[k] || []).push(f); });
    return Object.keys(m).map(function (k) { var s = summarize(m[k]); s.key = k; return s; });
  };
  return {
    view: p.view || 'list', canDecide: user.isFull || user.isHead,
    items: items.slice(0, 500).map(out),
    summary: summarize(items),
    byAbout: groupBy(function (f) { return f.about; }),
    byGroup: groupBy(function (f) { return nameOf_('groups', f.groupId) || 'Без группы'; }),
    control: items.filter(function (f) { return (f.tone === 'NEGATIVE' || f.churnRisk === true) && (f.status === 'OPEN' || f.status === 'IN_PROGRESS'); }).map(out)
  };
};

VIEWS.movements = function (user) {
  var own = null;
  if (seesOnlyOwnGroups_(user)) { own = {}; visibleGroups_(user).forEach(function (g) { own[g.id] = true; }); }
  return {
    isFull: user.isFull,
    items: where_('movements', function (m) { return !own || own[m.fromGroupId] || own[m.toGroupId]; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 500).map(function (m) {
        return { id: m.id, type: m.type, studentId: m.studentId, student: nameOf_('students', m.studentId), date: fmtDate_(m.createdAt),
          from: nameOf_('groups', m.fromGroupId), to: nameOf_('groups', m.toGroupId), month: m.courseMonth, by: nameOf_('users', m.createdById),
          reason: m.reasonCategory, verbatim: m.reasonVerbatim, action: m.curatorAction, links: m.links,
          churnCurator: m.churnCurator, churnChem: m.churnChem, churnBio: m.churnBio, churnBusiness: m.churnBusiness,
          reviewed: m.reviewedAt ? fmtDate_(m.reviewedAt) : '' };
      })
  };
};

VIEWS.staff = function (user) {
  if (!user.isFull && !user.isHead) fail_('Нет доступа');
  var depts = user.isFull ? DEPARTMENTS : [user.department];
  var allGrant = DEPARTMENTS.reduce(function (a, d) { return a.concat(GRANTABLE[d]); }, []).filter(function (p, i, a) { return a.indexOf(p) === i; });
  return {
    isFull: user.isFull, meId: user.id,
    depts: depts.map(function (d) {
      return {
        code: d, label: DEPARTMENT_LABEL[d],
        grantable: (user.isFull ? allGrant : GRANTABLE[d]).map(function (p) { return { key: p, label: PERMISSIONS[p] }; }),
        users: where_('users', function (u) { return u.department === d; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(publicUser_)
      };
    })
  };
};

VIEWS.reports = function (user, p) {
  var period = p.period === '7' || p.period === '28' ? Number(p.period) : null;
  var now = new Date();
  var from = period ? new Date(now.getTime() - period * 86400000) : new Date(0);
  var full = user.isFull || can_(user, 'reports.view');
  var groups = where_('groups', function (g) { return g.status === 'ACTIVE' || g.status === 'FINISHED'; });
  var lessonsBy = {};
  groups.forEach(function (g) { lessonsBy[g.id] = lessonsOf_(g.id); });
  var periodLessons = [];
  groups.forEach(function (g) { lessonsBy[g.id].forEach(function (l) { if (l.startsAt >= from && l.startsAt <= now) periodLessons.push(l); }); });
  var ids = idSet_(periodLessons);
  var att = where_('attendance', function (a) { return ids[a.lessonId]; });
  var hw = where_('homework', function (h) { return ids[h.lessonId]; });
  var avg = function (xs) { var v = xs.filter(function (x) { return typeof x === 'number'; }); return v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length) : null; };
  var R = function (r) { return { p: pctOf_(r), num: r.num, den: r.den }; };
  var P = function (x) { return { p: x, num: null, den: null }; };
  var surveysOf = function (g) { return where_('surveys', function (s) { return s.groupId === g.id; }); };
  var staff = where_('users', function (u) { return u.active && (u.department === 'TEACHER' || u.department === 'CURATOR'); })
    .sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  var showTeachers = user.isFull || (full && user.department !== 'CURATOR') || user.department === 'TEACHER';
  var showCurators = user.isFull || (full && user.department !== 'TEACHER') || user.department === 'CURATOR';

  var teachers = !showTeachers ? [] : staff.filter(function (u) { return u.department === 'TEACHER' && (full || u.id === user.id); }).map(function (t) {
    var mine = periodLessons.filter(function (l) { return l.teacherId === t.id; });
    var gs = groups.filter(function (g) { return g.chemTeacherId === t.id || g.bioTeacherId === t.id; });
    var r = ratio_(0, 0), sv = [];
    gs.forEach(function (g) {
      var cm = groupCurrentMonth_(lessonsBy[g.id], now);
      if (g.chemTeacherId === t.id) { r = addR_(r, retention_(g, lessonsBy[g.id], cm, 'chem')); surveysOf(g).forEach(function (s) { sv.push(s.chemPct); }); }
      if (g.bioTeacherId === t.id) { r = addR_(r, retention_(g, lessonsBy[g.id], cm, 'bio')); surveysOf(g).forEach(function (s) { sv.push(s.bioPct); }); }
    });
    return { name: t.name, groups: gs.map(function (g) { return { id: g.id, name: g.name + (g.chemTeacherId === t.id ? ' (хим.)' : ' (биол.)') }; }),
      att: R(attendanceRatio_(att, mine)), eff: P(efficiency_(att, mine)), ret: R(r), survey: P(avg(sv)) };
  });

  var curators = !showCurators ? [] : staff.filter(function (u) { return u.department === 'CURATOR' && (full || u.id === user.id); }).map(function (c) {
    var gs = groups.filter(function (g) { return g.curatorId === c.id; });
    var gIds = {};
    gs.forEach(function (g) { gIds[g.id] = true; });
    var ls = periodLessons.filter(function (l) { return gIds[l.groupId]; });
    var r = ratio_(0, 0), touch = ratio_(0, 0), sv = [];
    gs.forEach(function (g) {
      var lessons = lessonsBy[g.id];
      r = addR_(r, retention_(g, lessons, groupCurrentMonth_(lessons, now), 'curator'));
      surveysOf(g).forEach(function (s) { sv.push(s.curatorPct); });
      var studs = where_('students', function (s) { return s.groupId === g.id && s.status === 'ACTIVE' && !s.parentsNotInvolved; });
      var tch = where_('touches', function (t) { return t.groupId === g.id; });
      lessons.filter(function (l) { return l.endsAt <= now && l.startsAt >= from; }).forEach(function (l) {
        var pos = positionInMonth_(l.index);
        if (pos !== 6 && pos !== 12) return;
        var n = pos === 6 ? 1 : 2;
        var need = studs.filter(function (s) { return s.joinedAt <= l.endsAt; });
        var done = need.filter(function (s) { return tch.some(function (t) { return t.studentId === s.id && t.courseMonth === l.courseMonth && t.number === n; }); });
        touch = addR_(touch, ratio_(done.length, need.length));
      });
    });
    return { name: c.name, groups: gs.map(function (g) { return { id: g.id, name: g.name }; }),
      exp: R(homeworkRatio_(hw, ls, null, 'EXPERIMENT')), test: R(homeworkRatio_(hw, ls, null, 'TEST')), total: R(homeworkRatio_(hw, ls)),
      ret: R(r), touch: R(touch), survey: P(avg(sv)) };
  });

  var business = !user.isFull ? null : groups.map(function (g) {
    var lessons = lessonsBy[g.id];
    var cm = groupCurrentMonth_(lessons, now);
    var late = lateJoins_(g.id, lessons);
    var months = [];
    for (var m = 1; m <= 5; m++) months.push(m <= Math.min(cm, g.months) ? R(retention_(g, lessons, m, 'business')) : null);
    return { id: g.id, name: g.name, branch: nameOf_('branches', g.branchId), curator: nameOf_('users', g.curatorId), start: g.startCount,
      joined: Object.keys(late).length, left: where_('movements', function (x) { return x.fromGroupId === g.id && (x.type === 'LEAVE' || x.type === 'TRANSFER'); }).length,
      now: activeCount_(g.id), months: months };
  });

  return { period: period, teachers: teachers, curators: curators, business: business, showTeachers: showTeachers, showCurators: showCurators };
};
