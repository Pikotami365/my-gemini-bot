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
