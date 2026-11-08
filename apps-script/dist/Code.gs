/**
 * UMED CRM — весь серверный код одним файлом (собран из apps-script/src командой node build.js).
 * Не редактируйте здесь — правки вносятся в src/.
 */

// ===== Config.gs =====
/**
 * UMED CRM — настройки и справочники.
 * Время: Бишкек (UTC+6, без перехода на летнее время).
 */
var TZ_OFFSET_H = 6;
var LESSONS_PER_MONTH = 12;
var ROOM_CAPACITY = 22;
var DEFAULT_PRICE = 9000;

var DEPARTMENTS = ['LEADERSHIP', 'ADMIN', 'CURATOR', 'MANAGER', 'TEACHER', 'FINANCE'];
var DEPARTMENT_LABEL = {
  LEADERSHIP: 'Руководство', ADMIN: 'Админы', CURATOR: 'Кураторы',
  MANAGER: 'Менеджеры', TEACHER: 'Преподаватели', FINANCE: 'Финменеджеры'
};

var PERMISSIONS = {
  'schedule.edit': 'Расписание: кабинет, преподаватели, переносы, замены',
  'recruit.edit': 'Наборы: открыть/закрыть набор, сумма оплаты',
  'roster.edit': 'Состав: добавить ученика, перевод, уход',
  'attendance.edit': 'Посещаемость и «отпросился»',
  'quicktest.edit': 'Быстрые тесты (эффективность)',
  'homework.edit': 'ДЗ: опыты и тесты',
  'touch.edit': 'Касания с родителями',
  'student.bio': 'Биография ученика',
  'risk.create': 'Ставить риск',
  'survey.edit': 'Опросник конца месяца',
  'finance.view': 'Финансы: просмотр оплат',
  'finance.edit': 'Финансы: отмечать оплаты',
  'reports.view': 'Отчёты и эффективность сотрудников'
};

var DEFAULT_PERMISSIONS = {
  LEADERSHIP: [],
  ADMIN: ['schedule.edit', 'roster.edit', 'attendance.edit', 'quicktest.edit', 'survey.edit'],
  CURATOR: ['roster.edit', 'attendance.edit', 'homework.edit', 'touch.edit', 'student.bio', 'risk.create'],
  MANAGER: ['recruit.edit', 'roster.edit'],
  TEACHER: [],
  FINANCE: ['finance.view', 'finance.edit']
};

var GRANTABLE = {
  LEADERSHIP: [],
  ADMIN: ['schedule.edit', 'roster.edit', 'attendance.edit', 'quicktest.edit', 'survey.edit', 'risk.create', 'reports.view'],
  CURATOR: ['roster.edit', 'attendance.edit', 'homework.edit', 'touch.edit', 'student.bio', 'risk.create', 'reports.view'],
  MANAGER: ['recruit.edit', 'roster.edit', 'finance.view', 'finance.edit', 'reports.view'],
  TEACHER: ['reports.view'],
  FINANCE: ['finance.view', 'finance.edit', 'reports.view']
};

var DAYS_LIST = ['MWF', 'TTS'];
var DAYS_LABEL = { MWF: 'Пн-Ср-Пт', TTS: 'Вт-Чт-Сб' };
var DAYS_WEEKDAYS = { MWF: [1, 3, 5], TTS: [2, 4, 6] };
var SLOTS = ['S15', 'S17', 'S19'];
var SLOT_LABEL = { S15: '15:00–17:00', S17: '17:00–19:00', S19: '19:00–21:00' };
var SLOT_SHORT = { S15: '15–17', S17: '17–19', S19: '19–21' };
var SLOT_HOUR = { S15: 15, S17: 17, S19: 19 };
var SUBJECT_LABEL = { CHEM: 'Химия', BIO: 'Биология' };

var LEAVE_REASONS = [
  'Финансы / дорого', 'Неудобное время / расписание', 'Не понравился преподаватель / урок',
  'Переезд', 'Нагрузка в школе', 'Другое'
];
var FEEDBACK_FROM = ['Родитель', 'Ученик', 'Сотрудник'];
var FEEDBACK_CHANNEL = ['Личное сообщение', 'Звонок', 'Лично', 'Чат группы', 'Опросник', 'Другое'];
var FEEDBACK_ABOUT = ['Преподаватель химии', 'Преподаватель биологии', 'Куратор', 'Админ', 'Менеджер', 'Организация / расписание', 'Оплата', 'Другое'];


// ===== Util.gs =====
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


// ===== Db.gs =====
/**
 * Хранилище в Google-таблице: один лист = одна таблица, первая строка — заголовки на русском.
 * Типы колонок: s — текст, n — число, b — да/нет, j — список, d — дата (ГГГГ-ММ-ДД), dt — дата и время (Бишкек).
 * Все колонки отформатированы как «обычный текст», чтобы Google не превращал значения в даты сам.
 */
var SCHEMA = {
  users: ['Сотрудники', [
    ['id', 'ID'], ['name', 'Имя'], ['login', 'Логин'], ['codeHash', 'Код (зашифрован)'], ['department', 'Отдел'],
    ['isHead', 'Руководитель отдела', 'b'], ['isFull', 'Полный доступ', 'b'], ['permissions', 'Права', 'j'],
    ['active', 'Активен', 'b'], ['createdAt', 'Создан', 'dt']]],
  branches: ['Филиалы', [['id', 'ID'], ['name', 'Название'], ['isOnline', 'Онлайн', 'b'], ['order', 'Порядок', 'n']]],
  rooms: ['Кабинеты', [['id', 'ID'], ['branchId', 'Филиал ID'], ['name', 'Название'], ['capacity', 'Мест', 'n'], ['order', 'Порядок', 'n']]],
  groups: ['Группы', [
    ['id', 'ID'], ['name', 'Название'], ['description', 'Описание'], ['branchId', 'Филиал ID'], ['roomId', 'Кабинет ID'],
    ['days', 'Дни'], ['slot', 'Время'], ['startDate', 'Старт', 'd'], ['months', 'Месяцев', 'n'], ['price', 'Оплата в месяц', 'n'],
    ['status', 'Статус'], ['chemTeacherId', 'Преподаватель химии ID'], ['bioTeacherId', 'Преподаватель биологии ID'],
    ['curatorId', 'Куратор ID'], ['startCount', 'Учеников на старте', 'n'], ['recruitClosedAt', 'Набор закрыт', 'dt'],
    ['createdById', 'Создал ID'], ['createdAt', 'Создана', 'dt']]],
  students: ['Ученики', [
    ['id', 'ID'], ['name', 'ФИО'], ['phone', 'Телефон'], ['parentName', 'Родитель'], ['parentPhone', 'Телефон родителя'],
    ['bio', 'Биография'], ['parentsNotInvolved', 'Родители не участвуют', 'b'], ['parentsNotInvolvedReason', 'Причина'],
    ['groupId', 'Группа ID'], ['status', 'Статус'], ['joinedAt', 'Пришёл', 'dt'], ['joinedMonth', 'Месяц прихода', 'n'],
    ['createdAt', 'Создан', 'dt']]],
  lessons: ['Занятия', [
    ['id', 'ID'], ['groupId', 'Группа ID'], ['index', '№', 'n'], ['courseMonth', 'Месяц курса', 'n'], ['subject', 'Предмет'],
    ['startsAt', 'Начало', 'dt'], ['endsAt', 'Конец', 'dt'], ['teacherId', 'Преподаватель ID'], ['roomId', 'Кабинет ID']]],
  attendance: ['Посещаемость', [
    ['id', 'ID'], ['studentId', 'Ученик ID'], ['lessonId', 'Занятие ID'], ['status', 'Отметка'], ['reason', 'Причина'],
    ['testScore', 'Быстрый тест: балл', 'n'], ['testMax', 'Быстрый тест: из', 'n'], ['note', 'Примечание'],
    ['markedById', 'Отметил ID'], ['markedAt', 'Когда', 'dt']]],
  homework: ['ДЗ', [
    ['id', 'ID'], ['studentId', 'Ученик ID'], ['lessonId', 'Занятие ID'], ['type', 'Тип'], ['done', 'Сдано', 'b'],
    ['score', 'Балл', 'n'], ['maxScore', 'Из', 'n'], ['reason', 'Причина'], ['expectedDate', 'Ожидается сдача', 'd'],
    ['markedById', 'Отметил ID'], ['markedAt', 'Когда', 'dt']]],
  touches: ['Касания', [
    ['id', 'ID'], ['studentId', 'Ученик ID'], ['groupId', 'Группа ID'], ['courseMonth', 'Месяц', 'n'], ['number', 'Касание №', 'n'],
    ['awaiting', 'Ожидается ответ', 'b'], ['response', 'Ответ родителя'], ['byId', 'Куратор ID'], ['doneAt', 'Когда', 'dt']]],
  movements: ['Движения', [
    ['id', 'ID'], ['studentId', 'Ученик ID'], ['type', 'Тип'], ['fromGroupId', 'Из группы ID'], ['toGroupId', 'В группу ID'],
    ['courseMonth', 'Месяц курса', 'n'], ['reasonCategory', 'Причина'], ['reasonVerbatim', 'Со слов ученика'],
    ['curatorAction', 'Что сделал куратор'], ['links', 'Скриншоты'], ['comment', 'Комментарий'],
    ['churnCurator', 'Отток для куратора', 'b?'], ['churnChem', 'Отток для преп. химии', 'b?'],
    ['churnBio', 'Отток для преп. биологии', 'b?'], ['churnBusiness', 'Отток для бизнеса', 'b?'],
    ['reviewedById', 'Проверил ID'], ['reviewedAt', 'Проверено', 'dt'], ['createdById', 'Зафиксировал ID'], ['createdAt', 'Когда', 'dt']]],
  risks: ['Риски', [
    ['id', 'ID'], ['studentId', 'Ученик ID'], ['source', 'Источник'], ['reason', 'Причина'], ['open', 'Открыт', 'b'],
    ['createdById', 'Поставил ID'], ['createdAt', 'Когда', 'dt'], ['closedAt', 'Снят', 'dt'], ['closedById', 'Снял ID'], ['closeNote', 'Комментарий']]],
  feedback: ['Отзывы', [
    ['id', 'ID'], ['date', 'Дата', 'd'], ['studentId', 'Ученик ID'], ['groupId', 'Группа ID'], ['anonymous', 'Анонимно', 'b'],
    ['fromType', 'От кого'], ['fromStaffId', 'От сотрудника ID'], ['channel', 'Канал'], ['about', 'О чём'],
    ['aboutStaffId', 'О сотруднике ID'], ['tone', 'Тон'], ['text', 'Отзыв (дословно)'], ['link', 'Скрин'],
    ['churnRisk', 'Риск ухода', 'b?'], ['action', 'Что сделано'], ['status', 'Статус'], ['decision', 'Решение руководителя'],
    ['checkDate', 'Срок проверки', 'd'], ['createdById', 'Записал ID'], ['createdAt', 'Когда', 'dt']]],
  surveys: ['Опросник', [
    ['id', 'ID'], ['groupId', 'Группа ID'], ['courseMonth', 'Месяц', 'n'], ['chemPct', 'Химия %', 'n'], ['bioPct', 'Биология %', 'n'],
    ['curatorPct', 'Куратор %', 'n'], ['adminPct', 'Админ %', 'n'], ['byId', 'Внёс ID'], ['createdAt', 'Когда', 'dt']]],
  tasks: ['Задачи', [
    ['id', 'ID'], ['key', 'Ключ'], ['type', 'Тип'], ['title', 'Задача'], ['details', 'Подробности'], ['department', 'Отдел'],
    ['assigneeId', 'Исполнитель ID'], ['groupId', 'Группа ID'], ['studentId', 'Ученик ID'], ['lessonId', 'Занятие ID'],
    ['link', 'Ссылка'], ['dueAt', 'Срок', 'dt'], ['status', 'Статус'], ['manual', 'Закрывается вручную', 'b'],
    ['doneAt', 'Выполнено', 'dt'], ['doneById', 'Выполнил ID'], ['createdAt', 'Создана', 'dt']]],
  notifications: ['Уведомления', [
    ['id', 'ID'], ['kind', 'Вид'], ['red', 'Красное', 'b'], ['title', 'Заголовок'], ['body', 'Текст'], ['link', 'Ссылка'],
    ['ackDueAt', 'Принять до', 'dt'], ['createdById', 'Автор ID'], ['createdAt', 'Когда', 'dt']]],
  recipients: ['Получатели', [
    ['id', 'ID'], ['notificationId', 'Уведомление ID'], ['userId', 'Сотрудник ID'], ['ackAt', 'Принято', 'dt']]],
  log: ['Журнал', [
    ['id', 'ID'], ['userId', 'Сотрудник ID'], ['action', 'Действие'], ['entity', 'Объект'], ['entityId', 'Объект ID'],
    ['details', 'Подробности'], ['createdAt', 'Когда', 'dt']]]
};

var DB_CACHE_ = {};
var DB_SS_ = null;

function dbReset_() { DB_CACHE_ = {}; }

function ss_() {
  if (DB_SS_) return DB_SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  DB_SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!DB_SS_) throw new Error('Не найдена таблица-база. Запустите setup() из редактора скрипта.');
  return DB_SS_;
}

function sheet_(table) {
  var def = SCHEMA[table];
  var sh = ss_().getSheetByName(def[0]);
  if (!sh) throw new Error('Нет листа «' + def[0] + '». Запустите setup().');
  return sh;
}

function decode_(type, v) {
  if (v === '' || v === null || v === undefined) {
    if (type === 'b') return false;
    if (type === 'j') return [];
    if (type === 'n' || type === 'd' || type === 'dt' || type === 'b?') return null;
    return '';
  }
  switch (type) {
    case 'n': var x = Number(String(v).replace(',', '.')); return isNaN(x) ? null : x;
    case 'b': return v === true || v === 'да' || v === 'TRUE' || v === 'true';
    case 'b?': return (v === true || v === 'да' || v === 'TRUE' || v === 'true') ? true : (v === 'нет' || v === false || v === 'FALSE' || v === 'false') ? false : null;
    case 'j': try { return JSON.parse(v); } catch (e) { return String(v).split(',').filter(String); }
    case 'd': return parseDate_(v);
    case 'dt': return parseStoreDT_(v);
    default: return String(v);
  }
}

function encode_(type, v) {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'b': return v ? 'да' : 'нет';
    case 'b?': return v === true ? 'да' : v === false ? 'нет' : '';
    case 'j': return JSON.stringify(v || []);
    case 'd': return v instanceof Date ? isoDate_(v) : String(v);
    case 'dt': return v instanceof Date ? fmtStoreDT_(v) : String(v);
    case 'n': return v === '' ? '' : String(v);
    default: return String(v);
  }
}

/** Все строки таблицы как объекты (кэш на время одного запроса). */
function all_(table) {
  if (DB_CACHE_[table]) return DB_CACHE_[table].rows;
  var cols = SCHEMA[table][1];
  var sh = sheet_(table);
  var last = sh.getLastRow();
  var rows = [];
  var rowNum = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (!r[0]) continue;
      var o = {};
      for (var c = 0; c < cols.length; c++) o[cols[c][0]] = decode_(cols[c][2], r[c]);
      rows.push(o);
      rowNum[o.id] = i + 2;
    }
  }
  DB_CACHE_[table] = { rows: rows, rowNum: rowNum, byId: null };
  return rows;
}

function byId_(table, id) {
  if (!id) return null;
  all_(table);
  var c = DB_CACHE_[table];
  if (!c.byId) { c.byId = {}; c.rows.forEach(function (r) { c.byId[r.id] = r; }); }
  return c.byId[id] || null;
}

function where_(table, fn) { return all_(table).filter(fn); }
function find_(table, fn) { var a = all_(table); for (var i = 0; i < a.length; i++) if (fn(a[i])) return a[i]; return null; }

function rowValues_(table, o) {
  return SCHEMA[table][1].map(function (c) { return encode_(c[2], o[c[0]]); });
}

/** Вставка одной или нескольких записей. Возвращает вставленные объекты. */
function insert_(table, objs) {
  var list = Array.isArray(objs) ? objs : [objs];
  if (!list.length) return [];
  all_(table);
  var cols = SCHEMA[table][1];
  var c = DB_CACHE_[table];
  var sh = sheet_(table);
  var start = sh.getLastRow() + 1;
  var values = list.map(function (o) {
    if (!o.id) o.id = newId_();
    cols.forEach(function (col) { if (o[col[0]] === undefined) o[col[0]] = decode_(col[2], ''); });
    return rowValues_(table, o);
  });
  var need = start + values.length - 1 - sh.getMaxRows();
  if (need > 0) {
    // Новые строки наследуют текстовый формат от строки выше
    sh.insertRowsAfter(sh.getMaxRows(), need + 500);
  }
  sh.getRange(start, 1, values.length, cols.length).setValues(values);
  list.forEach(function (o, i) {
    c.rows.push(o);
    c.rowNum[o.id] = start + i;
    if (c.byId) c.byId[o.id] = o;
  });
  return list;
}

/** Обновление записи по id (patch — только изменённые поля). */
function update_(table, id, patch) {
  var o = byId_(table, id);
  if (!o) throw new Error('Запись не найдена: ' + table + ' ' + id);
  for (var k in patch) if (patch.hasOwnProperty(k)) o[k] = patch[k];
  var row = DB_CACHE_[table].rowNum[id];
  var cols = SCHEMA[table][1];
  sheet_(table).getRange(row, 1, 1, cols.length).setValues([rowValues_(table, o)]);
  return o;
}

/** Вставка или обновление по условию уникальности. */
function upsert_(table, matchFn, createObj, patch) {
  var ex = find_(table, matchFn);
  if (ex) return update_(table, ex.id, patch);
  var o = {};
  for (var k in createObj) o[k] = createObj[k];
  for (var p in patch) o[p] = patch[p];
  return insert_(table, o)[0];
}

function audit_(userId, action, entity, entityId, details) {
  insert_('log', { userId: userId || '', action: action, entity: entity, entityId: entityId || '', details: details || '', createdAt: new Date() });
}

/** Создаёт недостающие листы с заголовками (без удаления данных). */
function ensureSheets_() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (t) {
    var name = SCHEMA[t][0];
    var cols = SCHEMA[t][1];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
}


// ===== Auth.gs =====
/** Вход по логину и коду, сессии и права. */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_SECRET');
  if (!s) { s = newId_() + newId_() + newId_(); props.setProperty('SESSION_SECRET', s); }
  return s;
}

function sign_(payload) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(payload, secret_()));
}

function makeToken_(userId) {
  var exp = Date.now() + 30 * 86400000;
  var payload = userId + '.' + exp;
  return payload + '.' + sign_(payload);
}

function userFromToken_(token) {
  if (!token) return null;
  var p = String(token).split('.');
  if (p.length !== 3) return null;
  if (sign_(p[0] + '.' + p[1]) !== p[2]) return null;
  if (Number(p[1]) < Date.now()) return null;
  var u = byId_('users', p[0]);
  return u && u.active ? u : null;
}

function doLogin_(login, code) {
  var u = find_('users', function (x) { return x.login === String(login || '').trim().toLowerCase(); });
  if (!u || !u.active || !verifyCode_(String(code || '').trim(), u.codeHash)) fail_('Неверный логин или код');
  audit_(u.id, 'login', 'user', u.id);
  return { token: makeToken_(u.id) };
}

function can_(user, perm) {
  if (user.isFull) return true;
  if (perm === 'reports.view' && user.isHead) return true;
  return (user.permissions || []).indexOf(perm) >= 0;
}

function requirePerm_(user, perm) {
  if (!can_(user, perm)) fail_('Нет доступа к этому действию');
}

function canManageStaff_(manager, dept) {
  if (manager.isFull) return true;
  return manager.isHead && manager.department === dept && dept !== 'LEADERSHIP';
}

function seesOnlyOwnGroups_(user) {
  if (user.isFull || user.isHead) return false;
  return user.department === 'CURATOR' || user.department === 'TEACHER';
}

function groupVisible_(user, g) {
  if (!seesOnlyOwnGroups_(user)) return true;
  if (user.department === 'CURATOR') return g.curatorId === user.id;
  return g.chemTeacherId === user.id || g.bioTeacherId === user.id;
}

function visibleGroups_(user) {
  return where_('groups', function (g) { return groupVisible_(user, g); });
}

function taskVisible_(user, t) {
  if (t.assigneeId === user.id) return true;
  if (t.department && t.department === user.department && user.department !== 'CURATOR' && user.department !== 'TEACHER') return true;
  if (user.isFull && t.department === 'LEADERSHIP') return true;
  return false;
}

function publicUser_(u) {
  return {
    id: u.id, name: u.name, login: u.login, department: u.department, isHead: u.isHead, isFull: u.isFull,
    permissions: u.permissions, active: u.active
  };
}


// ===== Metrics.gs =====
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


// ===== Sync.gs =====
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


// ===== Actions.gs =====
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


// ===== Views.gs =====
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


// ===== Main.gs =====
/**
 * Точка входа веб-приложения и первоначальная настройка.
 * Установка: см. README.md (таблица → Расширения → Apps Script → вставить файлы → меню «UMED CRM → Настроить систему»).
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('UMED CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Единая точка вызова с клиента. Возвращает JSON-строку. */
function api(token, kind, name, payload) {
  dbReset_();
  var lock = null;
  try {
    if (kind === 'login') {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
      return JSON.stringify({ ok: true, data: doLogin_(payload.login, payload.code) });
    }
    var user = userFromToken_(token);
    if (!user) return JSON.stringify({ auth: false });
    if (kind === 'view') {
      if (!VIEWS[name]) throw new Error('Нет страницы ' + name);
      var data = VIEWS[name](user, payload || {});
      return JSON.stringify({ ok: true, data: data, me: VIEWS.me(user) });
    }
    if (kind === 'act') {
      if (!ACTIONS[name]) throw new Error('Нет действия ' + name);
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
      dbReset_(); // перечитать данные после ожидания очереди
      user = userFromToken_(token);
      var res = ACTIONS[name](user, payload || {}) || {};
      return JSON.stringify({ ok: true, data: res });
    }
    throw new Error('Неизвестный запрос');
  } catch (e) {
    if (e && e.userError) return JSON.stringify({ error: e.message });
    console.error(e && e.stack ? e.stack : e);
    return JSON.stringify({ error: 'Ошибка сервера: ' + (e && e.message ? e.message : e) });
  } finally {
    if (lock) try { lock.releaseLock(); } catch (x) {}
  }
}

// ───────────── Настройка ─────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('UMED CRM')
    .addItem('Настроить систему', 'setupFromMenu')
    .addItem('Проверить задачи сейчас', 'cronSync')
    .addToUi();
}

/** Из меню таблицы: спрашивает логин и код первого руководителя. */
function setupFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var name = ui.prompt('UMED CRM', 'Ваше имя (руководитель с полным доступом):', ui.ButtonSet.OK_CANCEL);
  if (name.getSelectedButton() !== ui.Button.OK) return;
  var login = ui.prompt('UMED CRM', 'Логин для входа (латиница, например zhanetta):', ui.ButtonSet.OK_CANCEL);
  if (login.getSelectedButton() !== ui.Button.OK) return;
  var code = ui.prompt('UMED CRM', 'Код для входа (минимум 4 символа, запомните его):', ui.ButtonSet.OK_CANCEL);
  if (code.getSelectedButton() !== ui.Button.OK) return;
  var msg = setup_(name.getResponseText(), login.getResponseText(), code.getResponseText());
  ui.alert('UMED CRM', msg, ui.ButtonSet.OK);
}

/** Запуск из редактора: впишите свои данные и нажмите «Выполнить». */
function setup() {
  var NAME = 'Жанетта';
  var LOGIN = 'zhanetta';
  var CODE = 'смените-этот-код';
  Logger.log(setup_(NAME, LOGIN, CODE));
}

function setup_(name, login, code) {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID')) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active) throw new Error('Откройте скрипт из Google-таблицы (Расширения → Apps Script)');
    props.setProperty('SPREADSHEET_ID', active.getId());
  }
  secret_();
  dbReset_();
  ensureSheets_();

  // Филиалы и кабинеты
  [['Медерова', false, 1], ['Байтик Баатыра', false, 2], ['Онлайн', true, 3]].forEach(function (b) {
    var br = find_('branches', function (x) { return x.name === b[0]; }) || insert_('branches', { name: b[0], isOnline: b[1], order: b[2] })[0];
    if (!b[1]) {
      for (var i = 1; i <= 4; i++) {
        var rn = 'Кабинет ' + i;
        if (!find_('rooms', function (r) { return r.branchId === br.id && r.name === rn; })) {
          insert_('rooms', { branchId: br.id, name: rn, capacity: ROOM_CAPACITY, order: i });
        }
      }
    }
  });

  // Первый пользователь с полным доступом
  var msg = '';
  login = String(login || '').trim().toLowerCase();
  if (login && String(code || '').trim().length >= 4) {
    if (find_('users', function (u) { return u.login === login; })) {
      msg = 'Пользователь ' + login + ' уже есть. ';
    } else {
      insert_('users', { name: String(name || 'Руководитель').trim(), login: login, codeHash: hashCode_(String(code).trim()),
        department: 'LEADERSHIP', isHead: true, isFull: true, permissions: [], active: true, createdAt: new Date() });
      msg = 'Создан вход: ' + login + '. ';
    }
  } else {
    msg = 'Логин/код не заданы — пользователь не создан. ';
  }

  installTriggers_();
  var ss = ss_();
  ['Лист1', 'Sheet1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  return msg + 'Листы созданы, автопроверка задач включена (каждые 10 минут). Теперь: Развернуть → Новое развёртывание → Веб-приложение.';
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cronSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cronSync').timeBased().everyMinutes(10).create();
}
