import type { Attendance, Homework, Lesson, Movement, Student, Subject } from "@prisma/client";

type Att = Pick<Attendance, "status" | "testScore" | "testMax" | "studentId" | "lessonId">;
type Hw = Pick<Homework, "done" | "type" | "studentId" | "lessonId" | "score" | "maxScore">;
type L = Pick<Lesson, "id" | "subject" | "courseMonth" | "index" | "teacherId" | "startsAt">;

export type Ratio = { num: number; den: number };
export const ratio = (num = 0, den = 0): Ratio => ({ num, den });
export const pctOf = (r: Ratio) => (r.den ? Math.round((r.num / r.den) * 100) : null);

/** Посещаемость: присутствовали / отмеченные (отпросился считается пропуском). */
export function attendanceRatio(att: Att[], lessons: L[], filter?: (l: L) => boolean): Ratio {
  const ids = new Set(lessons.filter((l) => !filter || filter(l)).map((l) => l.id));
  const rows = att.filter((a) => ids.has(a.lessonId));
  return ratio(rows.filter((a) => a.status === "PRESENT").length, rows.length);
}

/** Эффективность: средний % быстрых тестов. */
export function efficiency(att: Att[], lessons: L[], filter?: (l: L) => boolean): number | null {
  const ids = new Set(lessons.filter((l) => !filter || filter(l)).map((l) => l.id));
  const vals = att
    .filter((a) => ids.has(a.lessonId) && a.testScore != null && a.testMax)
    .map((a) => (a.testScore! / a.testMax!) * 100);
  if (!vals.length) return null;
  return Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
}

/** Выполнение ДЗ: сданные / отмеченные. */
export function homeworkRatio(hw: Hw[], lessons: L[], filter?: (l: L) => boolean, type?: "EXPERIMENT" | "TEST"): Ratio {
  const ids = new Set(lessons.filter((l) => !filter || filter(l)).map((l) => l.id));
  const rows = hw.filter((h) => ids.has(h.lessonId) && (!type || h.type === type));
  return ratio(rows.filter((h) => h.done).length, rows.length);
}

export const bySubject = (s: Subject) => (l: L) => l.subject === s;
export const byMonth = (m: number) => (l: L) => l.courseMonth === m;

/**
 * Удержание на конец месяца курса `month`.
 * База = ученики на старте курса + пришедшие после старта в месяцах < month
 *        (в месяц прихода ученик в удержании не считается).
 * Ушедшие = уходы/переводы из группы до конца month с отметкой оттока по показателю.
 * Непроверенный уход считается оттоком; непроверенный перевод — нет.
 */
export function retention(opts: {
  startCount: number;
  lateJoins: Map<string, number>; // studentId → месяц прихода (только пришедшие после старта)
  movements: Pick<Movement, "studentId" | "fromGroupId" | "type" | "courseMonth" | "churnBusiness" | "churnCurator" | "churnChem" | "churnBio">[];
  groupId: string;
  month: number;
  kind: "business" | "curator" | "chem" | "bio";
}): Ratio {
  const { startCount, lateJoins, movements, groupId, month, kind } = opts;
  const base = startCount + Array.from(lateJoins.values()).filter((jm) => jm < month).length;
  const out = movements.filter((m) => {
    if (m.fromGroupId !== groupId || m.courseMonth > month) return false;
    if (m.type !== "LEAVE" && m.type !== "TRANSFER") return false;
    const jm = lateJoins.get(m.studentId);
    if (jm !== undefined && jm >= month) return false; // ещё не входил в базу
    const flag =
      kind === "business" ? m.churnBusiness : kind === "curator" ? m.churnCurator : kind === "chem" ? m.churnChem : m.churnBio;
    if (flag === null || flag === undefined) return m.type === "LEAVE";
    return flag;
  }).length;
  return ratio(Math.max(base - out, 0), base);
}

/** Пришедшие после старта: studentId → месяц прихода. */
export function lateJoinsFor(
  students: Pick<Student, "id" | "joinedAt" | "joinedMonth">[],
  firstLessonStart: Date | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!firstLessonStart) return m;
  for (const s of students) if (s.joinedAt > firstLessonStart) m.set(s.id, s.joinedMonth);
  return m;
}

export function barClass(p: number | null, good = 85, bad = 70) {
  if (p == null) return "";
  return p >= good ? "good" : p < bad ? "bad" : "mid";
}
