import type { Department, Prisma } from "@prisma/client";
import { db } from "./db";
import { addDays, localDateTime, positionInMonth, todayLocal, fmtDate, SUBJECT_LABEL } from "./schedule";

/**
 * Движок автоматических задач и рисков.
 * Вызывается при открытии страниц (не чаще раза в 30 секунд на процесс), идемпотентен:
 * каждая задача имеет уникальный key, повторный запуск ничего не дублирует.
 */
let lastRun = 0;

export async function syncIfStale(force = false) {
  const now = Date.now();
  if (!force && now - lastRun < 30_000) return;
  lastRun = now;
  await runSync(new Date(now));
}

type TaskInput = {
  key: string;
  type: string;
  title: string;
  details?: string;
  department?: Department | null;
  assigneeId?: string | null;
  groupId?: string | null;
  studentId?: string | null;
  lessonId?: string | null;
  link?: string;
  dueAt: Date;
  manual?: boolean;
};

async function ensureTask(t: TaskInput, done: boolean) {
  const existing = await db.task.findUnique({ where: { key: t.key } });
  if (!existing) {
    if (done) return; // нечего создавать — уже выполнено
    await db.task.create({ data: { ...t, details: t.details ?? "", link: t.link ?? "", manual: t.manual ?? false } });
    return;
  }
  // Переназначение (например, сменили куратора) и автозакрытие
  const patch: Prisma.TaskUpdateInput = {};
  if (t.assigneeId !== undefined && existing.assigneeId !== t.assigneeId) patch.assigneeId = t.assigneeId;
  if (existing.dueAt.getTime() !== t.dueAt.getTime()) patch.dueAt = t.dueAt;
  if (!existing.manual) {
    if (done && existing.status === "OPEN") Object.assign(patch, { status: "DONE", doneAt: new Date() });
    if (!done && existing.status === "DONE") Object.assign(patch, { status: "OPEN", doneAt: null });
  }
  if (Object.keys(patch).length) await db.task.update({ where: { id: existing.id }, data: patch });
}

export async function broadcastRecipients(groupId?: string | null) {
  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [{ isFull: true }, { department: { in: ["ADMIN", "MANAGER", "CURATOR", "LEADERSHIP"] } }],
    },
    select: { id: true, department: true, isFull: true, isHead: true },
  });
  let list = users;
  if (groupId) {
    // Кураторы получают только по своим группам (руководитель кураторов — по всем)
    const g = await db.group.findUnique({ where: { id: groupId }, select: { curatorId: true } });
    list = users.filter((u) => u.department !== "CURATOR" || u.isHead || u.isFull || u.id === g?.curatorId);
  }
  return list.map((u) => u.id);
}

export async function notify(opts: {
  kind: string;
  title: string;
  body?: string;
  link?: string;
  red?: boolean;
  ackHours?: number;
  userIds: string[];
  createdById?: string | null;
}) {
  const ids = Array.from(new Set(opts.userIds));
  await db.notification.create({
    data: {
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? "",
      link: opts.link ?? "",
      red: opts.red ?? false,
      ackDueAt: opts.ackHours ? new Date(Date.now() + opts.ackHours * 3600_000) : null,
      createdById: opts.createdById ?? null,
      recipients: { create: ids.map((userId) => ({ userId })) },
    },
  });
}

async function runSync(now: Date) {
  const today = todayLocal(now);

  // 1. Статусы групп
  const groups = await db.group.findMany({
    where: { status: { in: ["RECRUITING", "WAITING", "ACTIVE"] } },
    include: {
      lessons: { orderBy: { index: "asc" } },
      students: { where: { status: "ACTIVE" } },
      branch: true,
    },
  });

  for (const g of groups) {
    const first = g.lessons[0];
    const last = g.lessons[g.lessons.length - 1];
    if (g.status === "WAITING" && first && first.startsAt <= now) {
      await db.group.update({
        where: { id: g.id },
        data: { status: "ACTIVE", startCount: g.startCount ?? g.students.length },
      });
      g.status = "ACTIVE";
    }
    if (g.status === "ACTIVE" && last && last.endsAt <= now) {
      await db.group.update({ where: { id: g.id }, data: { status: "FINISHED" } });
      continue;
    }

    const startDay = new Date(g.startDate);
    const groupLink = `/groups/${g.id}`;

    // 2. Набор закрыт → назначить преподавателей (админ) и куратора (полный доступ)
    if (g.recruitClosedAt) {
      const due = localDateTime(addDays(startDay, -1), 23, 59);
      await ensureTask(
        {
          key: `assign-teachers:${g.id}`,
          type: "assign-teachers",
          title: `Назначить преподавателей: ${g.name}`,
          details: `${g.branch.name}. Набор закрыт, нужно назначить преподавателя химии и биологии.`,
          department: "ADMIN",
          groupId: g.id,
          link: groupLink,
          dueAt: due,
        },
        !!g.chemTeacherId && !!g.bioTeacherId,
      );
      await ensureTask(
        {
          key: `assign-curator:${g.id}`,
          type: "assign-curator",
          title: `Назначить куратора: ${g.name}`,
          details: `${g.branch.name}. Набор закрыт.`,
          department: "LEADERSHIP",
          groupId: g.id,
          link: groupLink,
          dueAt: due,
        },
        !!g.curatorId,
      );
    }

    // 3. За 3 дня до старта — задачи куратору
    if (g.curatorId && g.status !== "ACTIVE") {
      const steps = [
        { n: 1, off: -3, title: "Открыть группу: создать чат, добавить учеников и сотрудников (руководителей), познакомиться" },
        { n: 2, off: -2, title: "Продолжить общение с группой, задать вопросы" },
        { n: 3, off: -1, title: "Написать в чат группы перед стартом" },
      ];
      for (const s of steps) {
        const day = addDays(startDay, s.off);
        if (today >= day) {
          await ensureTask(
            {
              key: `prestart:${g.id}:${s.n}`,
              type: "prestart",
              title: `${g.name}: ${s.title}`,
              details: `День ${s.n} из 3 до старта (${fmtDate(startDay)}).`,
              assigneeId: g.curatorId,
              groupId: g.id,
              link: groupLink,
              dueAt: localDateTime(day, 23, 59),
              manual: true,
            },
            false,
          );
        }
      }
    }

    if (g.status !== "ACTIVE") continue;

    // Данные по занятиям за последние 35 дней
    const horizon = new Date(now.getTime() - 35 * 86400_000);
    const recent = g.lessons.filter((l) => l.startsAt <= now && l.startsAt >= horizon);
    if (!recent.length) continue;
    const lessonIds = recent.map((l) => l.id);
    const [att, hw, touches, surveys] = await Promise.all([
      db.attendance.findMany({ where: { lessonId: { in: lessonIds } } }),
      db.homework.findMany({ where: { lessonId: { in: lessonIds } } }),
      db.touch.findMany({ where: { groupId: g.id } }),
      db.survey.findMany({ where: { groupId: g.id } }),
    ]);

    for (const l of recent) {
      const pos = positionInMonth(l.index);
      const expected = g.students.filter((s) => s.joinedAt <= l.endsAt);
      const subj = SUBJECT_LABEL[l.subject];

      // 4. Посещаемость до конца занятия
      const marked = new Set(att.filter((a) => a.lessonId === l.id).map((a) => a.studentId));
      await ensureTask(
        {
          key: `att:${l.id}`,
          type: "attendance",
          title: `Отметить посещаемость: ${g.name}, занятие ${l.index} (${subj})`,
          details: g.branch.isOnline
            ? "Онлайн: отметить посещаемость и обзвонить отсутствующих (примечание)."
            : "Офлайн: посещаемость, причины отсутствия и быстрый тест.",
          department: g.branch.isOnline ? null : "ADMIN",
          assigneeId: g.curatorId,
          groupId: g.id,
          lessonId: l.id,
          link: `${groupLink}?tab=attendance&lesson=${l.index}`,
          dueAt: l.endsAt,
        },
        expected.every((s) => marked.has(s.id)),
      );

      // 5. ДЗ — до начала следующего занятия
      if (l.endsAt <= now && g.curatorId) {
        const next = g.lessons.find((x) => x.index === l.index + 1);
        const hwFor = hw.filter((h) => h.lessonId === l.id);
        const complete = expected.every((s) =>
          (["EXPERIMENT", "TEST"] as const).every((t) => {
            const r = hwFor.find((h) => h.studentId === s.id && h.type === t);
            return r && (r.done || r.reason.trim().length > 0);
          }),
        );
        await ensureTask(
          {
            key: `hw:${l.id}`,
            type: "homework",
            title: `Отметить ДЗ: ${g.name}, занятие ${l.index} (${subj})`,
            details: "Опыты: сдано / не сдано. Тесты: балл. Не сдано — причина и дата сдачи.",
            assigneeId: g.curatorId,
            groupId: g.id,
            lessonId: l.id,
            link: `${groupLink}?tab=homework&lesson=${l.index}`,
            dueAt: next ? next.startsAt : addDays(l.endsAt, 2),
          },
          complete,
        );
      }

      // 6. Касания после 6-го и 12-го занятия
      if ((pos === 6 || pos === 12) && l.endsAt <= now && g.curatorId) {
        const number = pos === 6 ? 1 : 2;
        const need = expected.filter((s) => !s.parentsNotInvolved);
        const doneSet = new Set(
          touches.filter((t) => t.courseMonth === l.courseMonth && t.number === number).map((t) => t.studentId),
        );
        await ensureTask(
          {
            key: `touch:${g.id}:${l.courseMonth}:${number}`,
            type: "touch",
            title: `Касание с родителями №${number}: ${g.name}, месяц ${l.courseMonth}`,
            details: "Отправить каждому родителю отчёт по ученику и зафиксировать ответ (дословно или «ожидается ответ»).",
            assigneeId: g.curatorId,
            groupId: g.id,
            link: `${groupLink}?tab=touches&month=${l.courseMonth}`,
            dueAt: addDays(l.endsAt, 1),
          },
          need.every((s) => doneSet.has(s.id)),
        );
      }

      // 7. Опросник на последней неделе месяца (11-е или 12-е занятие)
      if (pos === 11) {
        const l12 = g.lessons.find((x) => x.index === l.index + 1);
        const dueDay = l12 ? l12.startsAt : l.endsAt;
        const localDue = new Date(dueDay.getTime() + 6 * 3600_000);
        await ensureTask(
          {
            key: `survey:${g.id}:${l.courseMonth}`,
            type: "survey",
            title: `Провести опросник: ${g.name}, месяц ${l.courseMonth}`,
            details: "Внести % по преподавателю химии, биологии, куратору и админу.",
            department: "ADMIN",
            groupId: g.id,
            link: `${groupLink}?tab=survey`,
            dueAt: localDateTime(
              new Date(Date.UTC(localDue.getUTCFullYear(), localDue.getUTCMonth(), localDue.getUTCDate())),
              23,
              59,
            ),
          },
          surveys.some((s) => s.courseMonth === l.courseMonth),
        );
      }
    }

    // 8. Автоматические риски
    const pastLessons = g.lessons.filter((l) => l.endsAt <= now);
    if (pastLessons.length) {
      const allAtt = await db.attendance.findMany({
        where: { lessonId: { in: pastLessons.map((l) => l.id) } },
        include: { lesson: { select: { index: true, startsAt: true } } },
      });
      const allHw = await db.homework.findMany({
        where: { lessonId: { in: pastLessons.map((l) => l.id) } },
        include: { lesson: { select: { index: true, startsAt: true } } },
      });
      const autoRisks = await db.risk.findMany({
        where: { studentId: { in: g.students.map((s) => s.id) }, source: { in: ["AUTO_ABSENCE", "AUTO_HOMEWORK"] } },
      });
      for (const s of g.students) {
        // 2 пропуска подряд без причины
        const a = allAtt.filter((x) => x.studentId === s.id).sort((x, y) => x.lesson.index - y.lesson.index);
        const lastTwo = a.slice(-2);
        if (
          lastTwo.length === 2 &&
          lastTwo[1].lesson.index - lastTwo[0].lesson.index === 1 &&
          lastTwo.every((x) => x.status === "ABSENT" && !x.reason.trim())
        ) {
          const since = lastTwo[1].lesson.startsAt;
          if (!autoRisks.some((r) => r.studentId === s.id && r.source === "AUTO_ABSENCE" && r.createdAt >= since)) {
            await createRisk(s.id, g.id, "AUTO_ABSENCE", `2 пропуска подряд без причины (занятия ${lastTwo[0].lesson.index} и ${lastTwo[1].lesson.index})`, null);
          }
        }
        // 3 несданных ДЗ подряд (по занятиям: занятие считается несданным, если не сдан опыт или тест)
        const byLesson = new Map<number, { startsAt: Date; notDone: boolean }>();
        for (const h of allHw.filter((x) => x.studentId === s.id)) {
          const cur = byLesson.get(h.lesson.index) ?? { startsAt: h.lesson.startsAt, notDone: false };
          if (!h.done) cur.notDone = true;
          byLesson.set(h.lesson.index, cur);
        }
        const seq = Array.from(byLesson.entries()).sort((x, y) => x[0] - y[0]);
        const last3 = seq.slice(-3);
        if (
          last3.length === 3 &&
          last3[2][0] - last3[0][0] === 2 &&
          last3.every(([, v]) => v.notDone)
        ) {
          const since = last3[2][1].startsAt;
          if (!autoRisks.some((r) => r.studentId === s.id && r.source === "AUTO_HOMEWORK" && r.createdAt >= since)) {
            await createRisk(s.id, g.id, "AUTO_HOMEWORK", `3 несданных ДЗ подряд (занятия ${last3.map((x) => x[0]).join(", ")})`, null);
          }
        }
      }
    }
  }

  // 9. «Принять ДЗ» в ожидаемую дату сдачи
  const pending = await db.homework.findMany({
    where: { done: false, expectedDate: { lte: today } },
    include: { student: { include: { group: true } }, lesson: true },
  });
  for (const h of pending) {
    if (h.student.status !== "ACTIVE") continue;
    await ensureTask(
      {
        key: `hwpick:${h.id}`,
        type: "homework-pickup",
        title: `Принять ДЗ у ${h.student.name} (${h.type === "TEST" ? "тест" : "опыт"}, занятие ${h.lesson.index})`,
        details: `Ожидаемая дата сдачи: ${fmtDate(h.expectedDate)}. Причина: ${h.reason || "—"}`,
        assigneeId: h.student.group.curatorId,
        groupId: h.student.groupId,
        studentId: h.studentId,
        link: `/students/${h.studentId}`,
        dueAt: localDateTime(h.expectedDate!, 23, 59),
      },
      false,
    );
  }
  // Закрываем «принять ДЗ», когда ДЗ сдано
  const openPick = await db.task.findMany({ where: { type: "homework-pickup", status: "OPEN" } });
  for (const t of openPick) {
    const id = t.key.split(":")[1];
    const h = await db.homework.findUnique({ where: { id } });
    if (!h || h.done) await db.task.update({ where: { id: t.id }, data: { status: "DONE", doneAt: new Date() } });
  }
}

export async function createRisk(
  studentId: string,
  groupId: string,
  source: "MANUAL" | "AUTO_ABSENCE" | "AUTO_HOMEWORK" | "FEEDBACK",
  reason: string,
  createdById: string | null,
) {
  const student = await db.student.findUnique({ where: { id: studentId }, include: { group: true } });
  if (!student) return;
  await db.risk.create({ data: { studentId, source, reason, createdById } });
  await notify({
    kind: "risk",
    red: true,
    title: `Риск: ${student.name} (${student.group.name})`,
    body: reason,
    link: `/students/${studentId}`,
    userIds: await broadcastRecipients(groupId),
    createdById,
  });
}
