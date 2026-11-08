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
