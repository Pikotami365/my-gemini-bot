/** Даты, идентификаторы, хэши. */

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** 'YYYY-MM-DD' → Date (полночь UTC; «дата без времени»). */
function parseDate_(s) {
  if (!s) return null;
  var p = String(s).slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || isNaN(p[0])) return null;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}

/** Date (дата) → 'YYYY-MM-DD'. */
function isoDate_(d) {
  if (!d) return '';
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** Момент → «местное» Бишкекское время в полях UTC. */
function toLocal_(d) { return new Date(d.getTime() + TZ_OFFSET_H * 3600000); }

/** Местная дата + час → момент UTC. */
function localDateTime_(date, hour, minute) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - TZ_OFFSET_H, minute || 0));
}

/** Момент → 'YYYY-MM-DD HH:mm' по Бишкеку (так хранится в таблице). */
function fmtStoreDT_(d) {
  if (!d) return '';
  var l = toLocal_(d);
  return isoDate_(l) + ' ' + pad2_(l.getUTCHours()) + ':' + pad2_(l.getUTCMinutes());
}

/** 'YYYY-MM-DD HH:mm' (Бишкек) → момент. */
function parseStoreDT_(s) {
  if (!s) return null;
  var str = String(s);
  var d = parseDate_(str);
  if (!d) return null;
  var t = str.slice(11, 16).split(':').map(Number);
  return localDateTime_(d, t[0] || 0, t[1] || 0);
}

function todayLocal_(now) {
  var l = toLocal_(now || new Date());
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
}

function addDays_(d, n) { return new Date(d.getTime() + n * 86400000); }

function fmtDate_(d) {
  if (!d) return '—';
  var l = (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) ? d : toLocal_(d);
  return pad2_(l.getUTCDate()) + '.' + pad2_(l.getUTCMonth() + 1) + '.' + l.getUTCFullYear();
}

function fmtDateTime_(d) {
  if (!d) return '—';
  var l = toLocal_(d);
  return pad2_(l.getUTCDate()) + '.' + pad2_(l.getUTCMonth() + 1) + ' ' + pad2_(l.getUTCHours()) + ':' + pad2_(l.getUTCMinutes());
}

function subjectFor_(index) {
  var p = ((index - 1) % LESSONS_PER_MONTH) + 1;
  return (p <= 3 || (p >= 7 && p <= 9)) ? 'CHEM' : 'BIO';
}
function monthFor_(index) { return Math.floor((index - 1) / LESSONS_PER_MONTH) + 1; }
function positionInMonth_(index) { return ((index - 1) % LESSONS_PER_MONTH) + 1; }
function matchesDays_(date, days) { return DAYS_WEEKDAYS[days].indexOf(date.getUTCDay()) >= 0; }

/** План занятий группы: months*12 занятий со startDate по дням недели группы. */
function lessonPlan_(g) {
  var out = [];
  var d = new Date(g.startDate.getTime());
  var total = g.months * LESSONS_PER_MONTH;
  var guard = 0;
  while (out.length < total && guard++ < 1000) {
    if (matchesDays_(d, g.days)) {
      var index = out.length + 1;
      var startsAt = localDateTime_(d, SLOT_HOUR[g.slot], 0);
      out.push({
        index: index,
        startsAt: startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 3600000),
        subject: subjectFor_(index),
        courseMonth: monthFor_(index)
      });
    }
    d = addDays_(d, 1);
  }
  return out;
}

function defaultGroupName_(startDate, days, slot) {
  return 'Старт ' + pad2_(startDate.getUTCDate()) + '.' + pad2_(startDate.getUTCMonth() + 1) +
    ' · ' + DAYS_LABEL[days] + ' · ' + SLOT_SHORT[slot];
}

function newId_() {
  var chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  var s = '';
  for (var i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function sha256Hex_(s) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function hashCode_(code) {
  var salt = newId_() + newId_();
  return salt + ':' + sha256Hex_(salt + ':' + code);
}

function verifyCode_(code, stored) {
  var parts = String(stored || '').split(':');
  if (parts.length !== 2) return false;
  return sha256Hex_(parts[0] + ':' + code) === parts[1];
}

function genCode_() { return String(Math.floor(100000 + Math.random() * 900000)); }

/** Ошибка для пользователя: текст показывается на экране. */
function UserError(msg) { this.message = msg; this.userError = true; }
function fail_(msg) { throw new UserError(msg); }
