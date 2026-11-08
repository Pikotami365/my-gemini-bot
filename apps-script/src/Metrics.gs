/** Метрики: посещаемость, эффективность, ДЗ, удержание. Ratio = {num, den}. */

function ratio_(num, den) { return { num: num || 0, den: den || 0 }; }
function addR_(a, b) { return ratio_(a.num + b.num, a.den + b.den); }
function pctOf_(r) { return r.den ? Math.round(r.num / r.den * 100) : null; }

function idSet_(lessons, filter) {
  var s = {};
  lessons.forEach(function (l) { if (!filter || filter(l)) s[l.id] = true; });
  return s;
}

/** Посещаемость: присутствовали / отмеченные (отпросился считается пропуском). */
function attendanceRatio_(att, lessons, filter) {
  var ids = idSet_(lessons, filter);
  var rows = att.filter(function (a) { return ids[a.lessonId]; });
  return ratio_(rows.filter(function (a) { return a.status === 'PRESENT'; }).length, rows.length);
}

/** Эффективность: средний % быстрых тестов. */
function efficiency_(att, lessons, filter) {
  var ids = idSet_(lessons, filter);
  var vals = att.filter(function (a) { return ids[a.lessonId] && a.testScore != null && a.testMax; })
    .map(function (a) { return a.testScore / a.testMax * 100; });
  if (!vals.length) return null;
  return Math.round(vals.reduce(function (x, y) { return x + y; }, 0) / vals.length);
}

/** Выполнение ДЗ: сданные / отмеченные. */
function homeworkRatio_(hw, lessons, filter, type) {
  var ids = idSet_(lessons, filter);
  var rows = hw.filter(function (h) { return ids[h.lessonId] && (!type || h.type === type); });
  return ratio_(rows.filter(function (h) { return h.done; }).length, rows.length);
}

function bySubject_(s) { return function (l) { return l.subject === s; }; }
function byMonth_(m) { return function (l) { return l.courseMonth === m; }; }

/** Пришедшие после старта: studentId → месяц прихода. */
function lateJoins_(groupId, lessons) {
  var m = {};
  var first = lessons[0];
  if (!first) return m;
  where_('students', function (s) { return s.groupId === groupId; }).forEach(function (s) {
    if (s.joinedAt && s.joinedAt > first.startsAt) m[s.id] = s.joinedMonth;
  });
  return m;
}

/**
 * Удержание на конец месяца курса `month`.
 * База = ученики на старте + пришедшие после старта в месяцах < month.
 * Ушедшие = уходы/переводы из группы с отметкой оттока по показателю kind (business|curator|chem|bio).
 * Непроверенный уход считается оттоком; непроверенный перевод — нет.
 */
function retention_(g, lessons, month, kind) {
  var late = lateJoins_(g.id, lessons);
  var startCount = g.startCount != null ? g.startCount : where_('students', function (s) { return s.groupId === g.id && s.status === 'ACTIVE'; }).length;
  var base = startCount + Object.keys(late).filter(function (k) { return late[k] < month; }).length;
  var key = { business: 'churnBusiness', curator: 'churnCurator', chem: 'churnChem', bio: 'churnBio' }[kind];
  var out = where_('movements', function (m) {
    if (m.fromGroupId !== g.id || m.courseMonth > month) return false;
    if (m.type !== 'LEAVE' && m.type !== 'TRANSFER') return false;
    if (late[m.studentId] !== undefined && late[m.studentId] >= month) return false;
    var flag = m[key];
    if (flag === null || flag === undefined) return m.type === 'LEAVE';
    return flag;
  }).length;
  return ratio_(Math.max(base - out, 0), base);
}

function groupCurrentMonth_(lessons, now) {
  var started = lessons.filter(function (l) { return l.startsAt <= now; });
  return started.length ? started[started.length - 1].courseMonth : 1;
}
