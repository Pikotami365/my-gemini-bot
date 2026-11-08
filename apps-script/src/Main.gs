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
