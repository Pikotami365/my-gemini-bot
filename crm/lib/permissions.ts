import type { Department, User } from "@prisma/client";

export const PERMISSIONS = {
  "schedule.edit": "Расписание: кабинет, преподаватели, переносы, замены",
  "recruit.edit": "Наборы: открыть/закрыть набор, сумма оплаты",
  "roster.edit": "Состав: добавить ученика, перевод, уход",
  "attendance.edit": "Посещаемость и «отпросился»",
  "quicktest.edit": "Быстрые тесты (эффективность)",
  "homework.edit": "ДЗ: опыты и тесты",
  "touch.edit": "Касания с родителями",
  "student.bio": "Биография ученика",
  "risk.create": "Ставить риск",
  "survey.edit": "Опросник конца месяца",
  "finance.view": "Финансы: просмотр оплат",
  "finance.edit": "Финансы: отмечать оплаты",
  "reports.view": "Отчёты и эффективность сотрудников",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const DEPARTMENT_LABEL: Record<Department, string> = {
  LEADERSHIP: "Руководство",
  ADMIN: "Админы",
  CURATOR: "Кураторы",
  MANAGER: "Менеджеры",
  TEACHER: "Преподаватели",
  FINANCE: "Финменеджеры",
};

// Права, которые выдаются новому сотруднику отдела по умолчанию.
export const DEFAULT_PERMISSIONS: Record<Department, Permission[]> = {
  LEADERSHIP: [],
  ADMIN: ["schedule.edit", "roster.edit", "attendance.edit", "quicktest.edit", "survey.edit"],
  CURATOR: ["roster.edit", "attendance.edit", "homework.edit", "touch.edit", "student.bio", "risk.create"],
  MANAGER: ["recruit.edit", "roster.edit"],
  TEACHER: [],
  FINANCE: ["finance.view", "finance.edit"],
};

// Какие права руководитель отдела может включать своим сотрудникам.
export const GRANTABLE: Record<Department, Permission[]> = {
  LEADERSHIP: [],
  ADMIN: ["schedule.edit", "roster.edit", "attendance.edit", "quicktest.edit", "survey.edit", "risk.create", "reports.view"],
  CURATOR: ["roster.edit", "attendance.edit", "homework.edit", "touch.edit", "student.bio", "risk.create", "reports.view"],
  MANAGER: ["recruit.edit", "roster.edit", "finance.view", "finance.edit", "reports.view"],
  TEACHER: ["reports.view"],
  FINANCE: ["finance.view", "finance.edit", "reports.view"],
};

export function can(user: Pick<User, "isFull" | "isHead" | "permissions">, perm: Permission): boolean {
  if (user.isFull) return true;
  if (perm === "reports.view" && user.isHead) return true;
  return user.permissions.includes(perm);
}

/** Может ли manager создавать/редактировать сотрудника target-отдела. */
export function canManageStaff(manager: Pick<User, "isFull" | "isHead" | "department">, dept: Department): boolean {
  if (manager.isFull) return true;
  return manager.isHead && manager.department === dept && dept !== "LEADERSHIP";
}

/** Сотрудник видит только свои группы (кураторы и преподаватели без отчётов). */
export function seesOnlyOwnGroups(user: Pick<User, "isFull" | "isHead" | "department">): boolean {
  if (user.isFull || user.isHead) return false;
  return user.department === "CURATOR" || user.department === "TEACHER";
}
