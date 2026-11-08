import type { Days, Group, Slot, Subject } from "@prisma/client";

// Бишкек: UTC+6 без перехода на летнее время.
export const TZ_OFFSET_H = 6;
export const LESSONS_PER_MONTH = 12;

export const DAYS_LABEL: Record<Days, string> = { MWF: "Пн-Ср-Пт", TTS: "Вт-Чт-Сб" };
export const DAYS_WEEKDAYS: Record<Days, number[]> = { MWF: [1, 3, 5], TTS: [2, 4, 6] };
export const SLOT_LABEL: Record<Slot, string> = { S15: "15:00–17:00", S17: "17:00–19:00", S19: "19:00–21:00" };
export const SLOT_SHORT: Record<Slot, string> = { S15: "15–17", S17: "17–19", S19: "19–21" };
export const SLOT_HOUR: Record<Slot, number> = { S15: 15, S17: 17, S19: 19 };
export const SUBJECT_LABEL: Record<Subject, string> = { CHEM: "Химия", BIO: "Биология" };
export const SLOTS: Slot[] = ["S15", "S17", "S19"];
export const DAYS: Days[] = ["MWF", "TTS"];

/** Локальная дата (Бишкек) из строки YYYY-MM-DD → Date в полночь UTC (для @db.Date). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Локальное время (Бишкек) → момент UTC. */
export function localDateTime(date: Date, hour: number, minute = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - TZ_OFFSET_H, minute));
}

/** Перевод момента в «локальные» компоненты Бишкека. */
export function toLocal(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_H * 3600_000);
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const l = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? d : toLocal(d);
  return `${String(l.getUTCDate()).padStart(2, "0")}.${String(l.getUTCMonth() + 1).padStart(2, "0")}.${l.getUTCFullYear()}`;
}

export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const l = toLocal(d);
  return `${String(l.getUTCDate()).padStart(2, "0")}.${String(l.getUTCMonth() + 1).padStart(2, "0")} ${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

export function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Сегодня по Бишкеку как Date (полночь UTC). */
export function todayLocal(now = new Date()): Date {
  const l = toLocal(now);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400_000);
}

export function subjectFor(index: number): Subject {
  const p = ((index - 1) % LESSONS_PER_MONTH) + 1;
  return p <= 3 || (p >= 7 && p <= 9) ? "CHEM" : "BIO";
}

export function monthFor(index: number): number {
  return Math.floor((index - 1) / LESSONS_PER_MONTH) + 1;
}

export function positionInMonth(index: number): number {
  return ((index - 1) % LESSONS_PER_MONTH) + 1;
}

export function matchesDays(date: Date, days: Days): boolean {
  return DAYS_WEEKDAYS[days].includes(date.getUTCDay());
}

/** Даты занятий группы: months*12 занятий начиная со startDate по дням недели группы. */
export function lessonPlan(g: Pick<Group, "startDate" | "days" | "slot" | "months">) {
  const out: { index: number; startsAt: Date; endsAt: Date; subject: Subject; courseMonth: number }[] = [];
  let d = new Date(g.startDate);
  const total = g.months * LESSONS_PER_MONTH;
  let guard = 0;
  while (out.length < total && guard++ < 1000) {
    if (matchesDays(d, g.days)) {
      const index = out.length + 1;
      const startsAt = localDateTime(d, SLOT_HOUR[g.slot]);
      out.push({
        index,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 3600_000),
        subject: subjectFor(index),
        courseMonth: monthFor(index),
      });
    }
    d = addDays(d, 1);
  }
  return out;
}

export function defaultGroupName(startDate: Date, days: Days, slot: Slot): string {
  const dd = String(startDate.getUTCDate()).padStart(2, "0");
  const mm = String(startDate.getUTCMonth() + 1).padStart(2, "0");
  return `Старт ${dd}.${mm} · ${DAYS_LABEL[days]} · ${SLOT_SHORT[slot]}`;
}

export function pct(num: number, den: number): string {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}
