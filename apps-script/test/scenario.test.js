/** Сценарный тест серверной части: node test/scenario.test.js */
const assert = require('assert');
const { load } = require('./harness');

const G = load();
const call = (token, kind, name, payload) => JSON.parse(G.api(token, kind, name, payload));
let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); }
}
const ok = (r) => { if (r.error) throw new Error('API error: ' + r.error); return r.data; };

console.log('Настройка');
const msg = G.setup_('Жанетта', 'zhanetta', '1234');
check('setup создаёт листы и пользователя', () => {
  assert.ok(msg.includes('Создан вход'));
  assert.ok(G._ss.getSheetByName('Сотрудники'));
  assert.strictEqual(G._ss.getSheetByName('Лист1'), null);
  assert.strictEqual(G._triggers.length, 1);
});
check('повторный setup не дублирует', () => {
  G.setup_('Жанетта', 'zhanetta', '1234');
  G.dbReset_();
  assert.strictEqual(G.all_('rooms').length, 8);
  assert.strictEqual(G.all_('users').length, 1);
  assert.strictEqual(G._triggers.length, 1);
});

const login = (l, c) => ok(call('', 'login', '', { login: l, code: c })).token;
check('неверный код', () => assert.ok(call('', 'login', '', { login: 'zhanetta', code: 'x' }).error));
const Z = login('zhanetta', '1234');
check('неверный токен → auth:false', () => assert.strictEqual(call('bad', 'view', 'home', {}).auth, false));

console.log('Сотрудники');
const mk = (name, login, department, extra = {}) => ok(call(Z, 'act', 'createStaff', { name, login, department, code: '1111', ...extra }));
mk('Админ Айгерим', 'admin1', 'ADMIN');
mk('Куратор Асель', 'cur1', 'CURATOR');
mk('Рук. кураторов', 'curhead', 'CURATOR', { isHead: 'on' });
mk('Менеджер Бека', 'man1', 'MANAGER');
mk('Преп. химии Артём', 'chem1', 'TEACHER');
mk('Преп. биологии Нурхан', 'bio1', 'TEACHER');
const A = login('admin1', '1111'), C = login('cur1', '1111'), M = login('man1', '1111'), T = login('chem1', '1111'), H = login('curhead', '1111');
check('руководитель кураторов не может создать админа', () => assert.ok(call(H, 'act', 'createStaff', { name: 'x', login: 'xx1', department: 'ADMIN' }).error));
check('руководитель кураторов создаёт куратора', () => assert.ok(ok(call(H, 'act', 'createStaff', { name: 'Куратор 2', login: 'cur2', department: 'CURATOR' })).msg.includes('cur2')));
check('куратор не может открыть набор', () => assert.ok(call(C, 'act', 'openRecruitment', {}).error.includes('Нет доступа')));

console.log('Набор и старт группы');
G.dbReset_();
const med = G.all_('branches').find((b) => b.name === 'Медерова');
const room1 = G.all_('rooms').find((r) => r.branchId === med.id && r.name === 'Кабинет 1');
let start = G.addDays_(G.todayLocal_(), -16);
while (!G.matchesDays_(start, 'TTS')) start = G.addDays_(start, -1);
const opened = ok(call(M, 'act', 'openRecruitment', { branchId: med.id, roomId: room1.id, days: 'TTS', slot: 'S15', startDate: G.isoDate_(start) }));
const gid = opened.redirect.split('/')[1];
check('кабинет занят для второй группы', () => assert.ok(call(M, 'act', 'openRecruitment', { branchId: med.id, roomId: room1.id, days: 'TTS', slot: 'S15', startDate: G.isoDate_(G.addDays_(start, 7)) }).error.includes('занят')));
check('дата не на день группы', () => assert.ok(call(M, 'act', 'openRecruitment', { branchId: med.id, roomId: room1.id, days: 'MWF', slot: 'S15', startDate: G.isoDate_(G.addDays_(start, 0)) }).error));
['Айбек Т.', 'Бермет С.', 'Даниил Е.', 'Эльнура К.', 'Саадат А.'].forEach((n) => ok(call(M, 'act', 'addStudent', { groupId: gid, name: n, parentName: 'Родитель ' + n, parentPhone: '+996' })));
// Ученики пришли до старта
G.dbReset_();
G.all_('students').forEach((s) => G.update_('students', s.id, { joinedAt: G.addDays_(start, -2) }));
ok(call(M, 'act', 'closeRecruitment', { groupId: gid }));
G.dbReset_();
const chem = G.all_('users').find((u) => u.login === 'chem1'), bio = G.all_('users').find((u) => u.login === 'bio1'), cur = G.all_('users').find((u) => u.login === 'cur1');
check('после закрытия набора: задачи админу и руководству', () => {
  const tasks = G.all_('tasks');
  assert.ok(tasks.some((t) => t.type === 'assign-teachers' && t.department === 'ADMIN'));
  assert.ok(tasks.some((t) => t.type === 'assign-curator' && t.department === 'LEADERSHIP'));
});
ok(call(A, 'act', 'updateGroupOrg', { groupId: gid, roomId: room1.id, chemTeacherId: chem.id, bioTeacherId: bio.id }));
ok(call(Z, 'act', 'assignCurator', { groupId: gid, curatorId: cur.id }));
G.dbReset_();
G.runSync_(new Date());
G.dbReset_();
const g = G.byId_('groups', gid);
check('группа стала ACTIVE, база удержания = 5', () => { assert.strictEqual(g.status, 'ACTIVE'); assert.strictEqual(g.startCount, 5); });
check('задачи назначения закрылись автоматически', () => {
  assert.ok(G.all_('tasks').filter((t) => t.type.startsWith('assign')).every((t) => t.status === 'DONE'));
});
const lessons = G.lessonsOf_(gid);
check('60 занятий, чередование химия/биология по неделям', () => {
  assert.strictEqual(lessons.length, 60);
  assert.deepStrictEqual(lessons.slice(0, 12).map((l) => l.subject[0]).join(''), 'CCCBBBCCCBBB');
  assert.strictEqual(lessons[12].courseMonth, 2);
  assert.strictEqual(G.fmtStoreDT_(lessons[0].startsAt).slice(11), '15:00');
});
const past = lessons.filter((l) => l.endsAt <= new Date());

console.log('Посещаемость, ДЗ, риски');
const students = G.all_('students').filter((s) => s.groupId === gid);
const sid = (n) => students.find((s) => s.name.startsWith(n)).id;
past.slice(0, -1).forEach((l, i, arr) => {
  const f = { lessonId: l.id, studentId: students.map((s) => s.id) };
  students.forEach((s) => {
    const absent = s.name.startsWith('Даниил') && i >= arr.length - 2;
    f['status_' + s.id] = absent ? 'ABSENT' : 'PRESENT';
    f['score_' + s.id] = absent ? '' : '8'; f['max_' + s.id] = absent ? '' : '10';
  });
  ok(call(A, 'act', 'saveAttendance', f));
  const h = { lessonId: l.id, studentId: students.map((s) => s.id) };
  students.forEach((s) => {
    const notDone = s.name.startsWith('Эльнура') && i >= arr.length - 3;
    ['EXPERIMENT', 'TEST'].forEach((t) => {
      h[t + '_' + s.id + '_state'] = notDone ? 'not' : 'done';
      h[t + '_' + s.id + '_reason'] = notDone ? 'болела' : '';
      if (t === 'TEST') { h[t + '_' + s.id + '_score'] = '12'; h[t + '_' + s.id + '_max'] = '15'; }
    });
  });
  ok(call(C, 'act', 'saveHomework', h));
});
check('ДЗ без причины → ошибка', () => {
  const l = past[0];
  const r = call(C, 'act', 'saveHomework', { lessonId: l.id, studentId: [sid('Айбек')], ['EXPERIMENT_' + sid('Айбек') + '_state']: 'not' });
  assert.ok(r.error.includes('причину'));
});
check('админ не может отмечать ДЗ', () => assert.ok(call(A, 'act', 'saveHomework', { lessonId: past[0].id }).error));
check('будущее занятие: только «отпросился»', () => {
  const fut = lessons.find((l) => l.startsAt > new Date());
  ok(call(C, 'act', 'saveAttendance', { lessonId: fut.id, studentId: [sid('Бермет')], ['status_' + sid('Бермет')]: 'PRESENT' }));
  G.dbReset_();
  assert.ok(!G.all_('attendance').some((a) => a.lessonId === fut.id));
  ok(call(C, 'act', 'markExcused', { studentId: sid('Бермет'), lessonId: fut.id, reason: 'олимпиада' }));
  G.dbReset_();
  assert.strictEqual(G.all_('attendance').find((a) => a.lessonId === fut.id).status, 'EXCUSED');
});
G.dbReset_();
G.runSync_(new Date());
G.dbReset_();
check('авто-риск: 2 пропуска подряд', () => assert.ok(G.all_('risks').some((r) => r.studentId === sid('Даниил') && r.source === 'AUTO_ABSENCE')));
check('авто-риск: 3 несданных ДЗ подряд', () => assert.ok(G.all_('risks').some((r) => r.studentId === sid('Эльнура') && r.source === 'AUTO_HOMEWORK')));
check('повторная синхронизация не дублирует риски', () => {
  const n = G.all_('risks').length;
  G.runSync_(new Date()); G.dbReset_();
  assert.strictEqual(G.all_('risks').length, n);
});
const last = past[past.length - 1];
check('последнее занятие без отметки — просрочено', () => {
  const t = G.all_('tasks').find((x) => x.key === 'att:' + last.id);
  assert.ok(t && t.status === 'OPEN');
  assert.ok(G.all_('tasks').filter((x) => x.type === 'attendance' && x.status === 'DONE').length >= past.length - 1);
});
check('касание после 6-го занятия создано куратору', () => {
  if (past.length < 6) return;
  const t = G.all_('tasks').find((x) => x.type === 'touch');
  assert.ok(t && t.assigneeId === cur.id);
});
check('«отпросился» без причины → ошибка', () => assert.ok(call(C, 'act', 'markExcused', { studentId: sid('Айбек'), lessonId: last.id, reason: '' }).error));

console.log('Главная и права видимости');
check('Жанетта видит красную зону', () => {
  const d = ok(call(Z, 'view', 'home', {}));
  assert.ok(d.overdue.some((t) => t.title.includes('посещаемость')));
  assert.strictEqual(d.risks.length, 2);
});
check('преподаватель видит только свои группы', () => {
  ok(call(M, 'act', 'openRecruitment', { branchId: med.id, roomId: room1.id, days: 'MWF', slot: 'S17', startDate: G.isoDate_((() => { let d = G.addDays_(G.todayLocal_(), 3); while (!G.matchesDays_(d, 'MWF')) d = G.addDays_(d, 1); return d; })()) }));
  assert.strictEqual(ok(call(T, 'view', 'groups', {})).groups.length, 1);
  assert.strictEqual(ok(call(Z, 'view', 'groups', {})).groups.length, 2);
});
check('куратор не видит чужую группу', () => {
  G.dbReset_();
  const other = G.all_('groups').find((x) => x.id !== gid);
  assert.ok(call(C, 'view', 'group', { id: other.id }).error);
});

console.log('Уход, перевод, отзывы, удержание');
check('уход без «что сделал куратор» → ошибка', () => assert.ok(call(C, 'act', 'createMovement', { studentId: sid('Саадат'), type: 'LEAVE', reasonCategory: 'Финансы / дорого', reasonVerbatim: 'дорого' }).error));
ok(call(C, 'act', 'createMovement', { studentId: sid('Саадат'), type: 'LEAVE', reasonCategory: 'Финансы / дорого', reasonVerbatim: 'родители не могут оплатить', curatorAction: 'звонила маме' }));
check('уход: красное уведомление всем, кроме автора, с «принять за 24 ч»', () => {
  G.dbReset_();
  const n = G.all_('notifications').find((x) => x.kind === 'movement');
  assert.ok(n.red && n.ackDueAt);
  const rec = G.all_('recipients').filter((r) => r.notificationId === n.id).map((r) => G.byId_('users', r.userId).login).sort();
  assert.ok(rec.includes('zhanetta') && rec.includes('admin1') && rec.includes('man1') && rec.includes('curhead'));
  assert.ok(!rec.includes('cur1') && !rec.includes('cur2') && !rec.includes('chem1'));
});
check('удержание бизнес: непроверенный уход = отток (4/5)', () => {
  G.dbReset_();
  const r = G.retention_(G.byId_('groups', gid), G.lessonsOf_(gid), 1, 'business');
  assert.deepStrictEqual([r.num, r.den], [4, 5]);
});
check('атрибуция: не отток для куратора, отток для бизнеса', () => {
  G.dbReset_();
  const mv = G.all_('movements')[0];
  assert.ok(call(C, 'act', 'reviewMovement', { movementId: mv.id }).error);
  ok(call(Z, 'act', 'reviewMovement', { movementId: mv.id, churnCurator: 'no', churnBusiness: 'yes' }));
  G.dbReset_();
  const gg = G.byId_('groups', gid), ls = G.lessonsOf_(gid);
  assert.strictEqual(G.retention_(gg, ls, 1, 'curator').num, 5);
  assert.strictEqual(G.retention_(gg, ls, 1, 'business').num, 4);
});
check('новый ученик посреди месяца не входит в базу этого месяца', () => {
  ok(call(C, 'act', 'addStudent', { groupId: gid, name: 'Новенький' }));
  G.dbReset_();
  const gg = G.byId_('groups', gid), ls = G.lessonsOf_(gid);
  assert.strictEqual(G.retention_(gg, ls, 1, 'business').den, 5);
  assert.strictEqual(G.retention_(gg, ls, 2, 'business').den, 6);
});
check('перевод в группу без мест запрещён / в свободную — ок', () => {
  G.dbReset_();
  const other = G.all_('groups').find((x) => x.id !== gid);
  ok(call(C, 'act', 'createMovement', { studentId: sid('Бермет'), type: 'TRANSFER', toGroupId: other.id, reasonCategory: 'Неудобное время / расписание', reasonVerbatim: 'школа' }));
  G.dbReset_();
  assert.strictEqual(G.byId_('students', sid('Бермет')).groupId, other.id);
  assert.strictEqual(G.all_('movements').find((m) => m.type === 'TRANSFER').churnBusiness, false);
});
check('негативный отзыв без ответа про риск → ошибка', () => assert.ok(call(C, 'act', 'createFeedback', { tone: 'NEGATIVE', text: 'плохо', about: 'Куратор', fromType: 'Ученик' }).error));
check('негатив с риском → риск у ученика', () => {
  ok(call(C, 'act', 'createFeedback', { tone: 'NEGATIVE', text: 'не понимаю химию', about: 'Преподаватель химии', fromType: 'Ученик', churnRisk: 'yes', studentId: sid('Айбек'), checkDate: '2020-01-01' }));
  G.dbReset_();
  assert.ok(G.all_('risks').some((r) => r.studentId === sid('Айбек') && r.source === 'FEEDBACK'));
  const d = ok(call(Z, 'view', 'feedback', { view: 'control' }));
  assert.strictEqual(d.control.length, 1);
  assert.ok(ok(call(Z, 'view', 'home', {})).fbOverdue.length === 1);
});
check('принять уведомление', () => {
  const d = ok(call(Z, 'view', 'home', {}));
  const n = d.redNotes.find((x) => x.title.startsWith('Уход'));
  ok(call(Z, 'act', 'ack', { recipientId: n.rid }));
  assert.ok(!ok(call(Z, 'view', 'home', {})).redNotes.some((x) => x.rid === n.rid));
});

check('куратора назначили за день до старта: только «открыть группу» со сроком сегодня', () => {
  G.dbReset_();
  const bt = G.all_('branches').find((b) => b.name === 'Байтик Баатыра');
  const r1 = G.all_('rooms').find((r) => r.branchId === bt.id);
  const tomorrow = G.addDays_(G.todayLocal_(), 1);
  const days = G.matchesDays_(tomorrow, 'MWF') ? 'MWF' : G.matchesDays_(tomorrow, 'TTS') ? 'TTS' : null;
  if (!days) return; // завтра воскресенье — проверка неприменима
  const id = ok(call(M, 'act', 'openRecruitment', { branchId: bt.id, roomId: r1.id, days, slot: 'S19', startDate: G.isoDate_(tomorrow) })).redirect.split('/')[1];
  ok(call(Z, 'act', 'assignCurator', { groupId: id, curatorId: cur.id }));
  G.dbReset_(); G.runSync_(new Date()); G.dbReset_();
  const ts = G.all_('tasks').filter((t) => t.type === 'prestart' && t.groupId === id);
  assert.strictEqual(JSON.stringify(ts.map((t) => t.key.split(':')[2]).sort()), '["1","3"]');
  assert.ok(ts.every((t) => t.dueAt > new Date()), 'ни одна задача не просрочена сразу');
});

console.log('Отчёты и прочие страницы');
['home', 'schedule', 'groups', 'feedback', 'feedbackNew', 'movements', 'staff', 'reports', 'me'].forEach((v) =>
  check('страница ' + v + ' открывается у Жанетты', () => ok(call(Z, 'view', v, {}))));
['attendance', 'homework', 'touches', 'survey', 'schedule', 'history', 'overview'].forEach((tab) =>
  check('вкладка группы ' + tab, () => ok(call(Z, 'view', 'group', { id: gid, tab }))));
check('карточка ученика', () => { const d = ok(call(C, 'view', 'student', { id: sid('Даниил') })); assert.ok(d.attendance.length > 0 && d.candidates.length >= 0); });
check('отчёт преподавателя: только своя строка', () => {
  const d = ok(call(T, 'view', 'reports', {}));
  assert.strictEqual(d.teachers.length, 1); assert.strictEqual(d.curators.length, 0); assert.strictEqual(d.business, null);
});
check('отчёт Жанетты: эффективность 80%, удержание бизнес', () => {
  const d = ok(call(Z, 'view', 'reports', {}));
  const t = d.teachers.find((x) => x.name.includes('химии'));
  assert.strictEqual(t.eff.p, 80);
  assert.ok(d.business.length >= 1);
});
check('руководитель кураторов видит отчёт кураторов', () => assert.ok(ok(call(H, 'view', 'reports', {})).curators.length >= 1));
check('опросник: сохранение', () => {
  ok(call(A, 'act', 'saveSurvey', { groupId: gid, courseMonth: '1', chemPct: '90', bioPct: '85', curatorPct: '95', adminPct: '88' }));
  G.dbReset_();
  assert.strictEqual(G.all_('surveys')[0].chemPct, 90);
});
check('сотрудник: отключение и вход запрещён', () => {
  G.dbReset_();
  const u = G.all_('users').find((x) => x.login === 'cur2');
  ok(call(H, 'act', 'updateStaff', { userId: u.id, name: u.name }));
  assert.ok(call('', 'login', '', { login: 'cur2', code: 'x' }).error);
});
check('значения в таблице читаемы (даты по Бишкеку, да/нет)', () => {
  const sh = G._ss.getSheetByName('Занятия');
  const row = sh.getRange(2, 1, 1, 9).getValues()[0];
  assert.ok(/^\d{4}-\d\d-\d\d 15:00$/.test(row[5]), row[5]);
  const us = G._ss.getSheetByName('Сотрудники').getRange(2, 1, 1, 10).getValues()[0];
  assert.strictEqual(us[6], 'да');
});
check('вставка за пределы 1000 строк расширяет лист', () => {
  G.dbReset_();
  const rows = [];
  for (let i = 0; i < 1200; i++) rows.push({ userId: '', action: 'x', entity: 'y', createdAt: new Date() });
  G.insert_('log', rows);
  G.dbReset_();
  assert.ok(G.all_('log').length > 1200);
});

console.log(failed ? `\n${failed} ПРОВАЛЕНО` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
