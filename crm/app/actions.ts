"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Department, Days, MovementType, Slot, Tone, FeedbackStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { hashCode, signSession, verifyCode } from "@/lib/crypto";
import { SESSION_COOKIE, audit, requirePerm, requireUser } from "@/lib/auth";
import { can, canManageStaff, DEFAULT_PERMISSIONS, GRANTABLE, type Permission } from "@/lib/permissions";
import {
  defaultGroupName,
  lessonPlan,
  localDateTime,
  matchesDays,
  parseDate,
  DAYS_LABEL,
  SLOT_LABEL,
} from "@/lib/schedule";
import { fail } from "@/lib/errors";
import { broadcastRecipients, createRisk, notify, syncIfStale } from "@/lib/sync";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = s(f, k).replace(",", ".");
  return v === "" ? null : Number(v);
};


// ───────────── Вход ─────────────

export async function login(_: unknown, f: FormData) {
  const loginName = s(f, "login").toLowerCase();
  const code = s(f, "code");
  const user = await db.user.findUnique({ where: { login: loginName } });
  if (!user || !user.active || !verifyCode(code, user.codeHash)) {
    return { error: "Неверный логин или код" };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86400,
  });
  await audit(user.id, "login", "user", user.id);
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

// ───────────── Группы и наборы ─────────────

async function currentMonth(groupId: string): Promise<number> {
  const l = await db.lesson.findFirst({
    where: { groupId, startsAt: { lte: new Date() } },
    orderBy: { index: "desc" },
  });
  return l?.courseMonth ?? 1;
}

async function assertSlotFree(roomId: string, days: Days, slot: Slot, start: Date, months: number, exceptGroupId?: string) {
  const others = await db.group.findMany({
    where: { roomId, days, slot, status: { not: "FINISHED" }, id: exceptGroupId ? { not: exceptGroupId } : undefined },
    include: { lessons: { select: { startsAt: true }, orderBy: { index: "asc" } } },
  });
  const plan = lessonPlan({ startDate: start, days, slot, months });
  const from = plan[0].startsAt.getTime();
  const to = plan[plan.length - 1].startsAt.getTime();
  for (const o of others) {
    const a = o.lessons[0]?.startsAt.getTime() ?? 0;
    const b = o.lessons[o.lessons.length - 1]?.startsAt.getTime() ?? 0;
    if (a <= to && from <= b) return fail(`Кабинет занят группой «${o.name}» в это время`);
  }
}

export async function openRecruitment(f: FormData) {
  const user = await requirePerm("recruit.edit");
  const branchId = s(f, "branchId");
  const roomId = s(f, "roomId") || null;
  const days = s(f, "days") as Days;
  const slot = s(f, "slot") as Slot;
  const startDate = parseDate(s(f, "startDate"));
  const branch = await db.branch.findUniqueOrThrow({ where: { id: branchId } });
  const months = branch.isOnline ? 4 : 5;
  if (!matchesDays(startDate, days)) return fail(`Дата старта должна выпадать на ${DAYS_LABEL[days]}`);
  if (!branch.isOnline && !roomId) return fail("Выберите кабинет");
  if (roomId) await assertSlotFree(roomId, days, slot, startDate, months);

  const name = defaultGroupName(startDate, days, slot);
  const g = await db.group.create({
    data: {
      name,
      description: `${branch.name}${roomId ? "" : ""}, ${DAYS_LABEL[days]}, ${SLOT_LABEL[slot]}`,
      branchId,
      roomId,
      days,
      slot,
      startDate,
      months,
      createdById: user.id,
    },
  });
  await db.lesson.createMany({
    data: lessonPlan(g).map((p) => ({ ...p, groupId: g.id, roomId, teacherId: null })),
  });
  await audit(user.id, "open-recruitment", "group", g.id, name);
  await notify({
    kind: "recruit",
    title: `Открыт набор: ${name}`,
    body: branch.name,
    link: `/groups/${g.id}`,
    userIds: await broadcastRecipients(),
    createdById: user.id,
  });
  redirect(`/groups/${g.id}`);
}

export async function closeRecruitment(f: FormData) {
  const user = await requirePerm("recruit.edit");
  const id = s(f, "groupId");
  const g = await db.group.update({
    where: { id },
    data: { status: "WAITING", recruitClosedAt: new Date() },
    include: { branch: true, students: { where: { status: "ACTIVE" } } },
  });
  await audit(user.id, "close-recruitment", "group", id);
  await notify({
    kind: "recruit-closed",
    red: true,
    ackHours: 24,
    title: `Набор закрыт: ${g.name}`,
    body: `${g.branch.name}, учеников: ${g.students.length}. Админам — назначить преподавателей, руководству — куратора.`,
    link: `/groups/${id}`,
    userIds: await broadcastRecipients(),
    createdById: user.id,
  });
  await syncIfStale(true);
  revalidatePath(`/groups/${id}`);
}

export async function reopenRecruitment(f: FormData) {
  const user = await requirePerm("recruit.edit");
  const id = s(f, "groupId");
  await db.group.update({ where: { id, status: "WAITING" }, data: { status: "RECRUITING", recruitClosedAt: null } });
  await audit(user.id, "reopen-recruitment", "group", id);
  revalidatePath(`/groups/${id}`);
}

export async function updateGroupInfo(f: FormData) {
  const user = await requireUser();
  if (!can(user, "roster.edit") && !can(user, "schedule.edit") && !can(user, "recruit.edit")) return fail("Нет доступа");
  const id = s(f, "groupId");
  const name = s(f, "name");
  if (!name) return fail("Название не может быть пустым");
  await db.group.update({ where: { id }, data: { name, description: s(f, "description") } });
  await audit(user.id, "rename-group", "group", id, name);
  revalidatePath(`/groups/${id}`);
}

export async function updatePrice(f: FormData) {
  const user = await requirePerm("recruit.edit");
  const id = s(f, "groupId");
  const price = num(f, "price");
  if (!price || price < 0) return fail("Укажите сумму");
  await db.group.update({ where: { id }, data: { price: Math.round(price) } });
  await audit(user.id, "update-price", "group", id, String(price));
  revalidatePath(`/groups/${id}`);
}

export async function updateGroupOrg(f: FormData) {
  const user = await requirePerm("schedule.edit");
  const id = s(f, "groupId");
  const g = await db.group.findUniqueOrThrow({ where: { id }, include: { branch: true } });
  const roomId = s(f, "roomId") || null;
  const chemTeacherId = s(f, "chemTeacherId") || null;
  const bioTeacherId = s(f, "bioTeacherId") || null;
  const days = (s(f, "days") || g.days) as Days;
  const slot = (s(f, "slot") || g.slot) as Slot;
  const startDate = s(f, "startDate") ? parseDate(s(f, "startDate")) : g.startDate;
  if (!matchesDays(startDate, days)) return fail(`Дата старта должна выпадать на ${DAYS_LABEL[days]}`);
  if (roomId) await assertSlotFree(roomId, days, slot, startDate, g.months, id);

  const scheduleChanged =
    days !== g.days || slot !== g.slot || startDate.getTime() !== new Date(g.startDate).getTime();
  if (scheduleChanged && g.status === "ACTIVE") return fail("Группа уже идёт: переносите отдельные занятия");

  await db.group.update({ where: { id }, data: { roomId, chemTeacherId, bioTeacherId, days, slot, startDate } });

  // Пересобираем будущие занятия (прошедшие не трогаем)
  const now = new Date();
  const plan = lessonPlan({ startDate, days, slot, months: g.months });
  const lessons = await db.lesson.findMany({ where: { groupId: id } });
  for (const p of plan) {
    const ex = lessons.find((l) => l.index === p.index);
    const teacherId = p.subject === "CHEM" ? chemTeacherId : bioTeacherId;
    if (!ex) {
      await db.lesson.create({ data: { ...p, groupId: id, roomId, teacherId } });
    } else if (ex.startsAt > now) {
      await db.lesson.update({
        where: { id: ex.id },
        data: scheduleChanged ? { startsAt: p.startsAt, endsAt: p.endsAt, roomId, teacherId } : { roomId, teacherId },
      });
    } else if (!ex.teacherId && teacherId) {
      // Прошедшие занятия без преподавателя (назначили после старта)
      await db.lesson.update({ where: { id: ex.id }, data: { teacherId } });
    }
  }
  await audit(user.id, "update-group-org", "group", id);
  await notify({
    kind: "group-change",
    title: `Изменения в группе ${g.name}`,
    body: "Админ обновил кабинет / преподавателей / расписание.",
    link: `/groups/${id}`,
    ackHours: 24,
    userIds: await broadcastRecipients(id),
    createdById: user.id,
  });
  revalidatePath(`/groups/${id}`);
}

export async function assignCurator(f: FormData) {
  const user = await requireUser();
  if (!user.isFull && !(user.isHead && user.department === "CURATOR")) return fail("Назначать куратора может только руководство");
  const id = s(f, "groupId");
  const curatorId = s(f, "curatorId") || null;
  await db.group.update({ where: { id }, data: { curatorId } });
  await audit(user.id, "assign-curator", "group", id, curatorId ?? "");
  if (curatorId) {
    const g = await db.group.findUniqueOrThrow({ where: { id } });
    await notify({
      kind: "curator-assigned",
      red: true,
      ackHours: 24,
      title: `Вы назначены куратором группы ${g.name}`,
      link: `/groups/${id}`,
      userIds: [curatorId],
      createdById: user.id,
    });
  }
  await syncIfStale(true);
  revalidatePath(`/groups/${id}`);
}

export async function rescheduleLesson(f: FormData) {
  const user = await requirePerm("schedule.edit");
  const lessonId = s(f, "lessonId");
  const date = parseDate(s(f, "date"));
  const [hh, mm] = s(f, "time").split(":").map(Number);
  const startsAt = localDateTime(date, hh, mm || 0);
  const l = await db.lesson.update({
    where: { id: lessonId },
    data: {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 3600_000),
      teacherId: s(f, "teacherId") || null,
      roomId: s(f, "roomId") || null,
    },
    include: { group: true },
  });
  await audit(user.id, "reschedule-lesson", "lesson", lessonId);
  await notify({
    kind: "lesson-change",
    title: `Перенос/замена: ${l.group.name}, занятие ${l.index}`,
    link: `/groups/${l.groupId}?tab=schedule`,
    ackHours: 24,
    userIds: [...(await broadcastRecipients(l.groupId)), ...(l.teacherId ? [l.teacherId] : [])],
    createdById: user.id,
  });
  revalidatePath(`/groups/${l.groupId}`);
}

// ───────────── Ученики ─────────────

export async function addStudent(f: FormData) {
  const user = await requireUser();
  if (!can(user, "roster.edit") && !can(user, "recruit.edit")) return fail("Нет доступа");
  const groupId = s(f, "groupId");
  const name = s(f, "name");
  if (!name) return fail("Укажите ФИО");
  const g = await db.group.findUniqueOrThrow({ where: { id: groupId }, include: { branch: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } } });
  if (!g.branch.isOnline && g._count.students >= 22) return fail("В группе уже 22 ученика");
  const joinedMonth = g.status === "ACTIVE" ? await currentMonth(groupId) : 1;
  const st = await db.student.create({
    data: {
      name,
      phone: s(f, "phone"),
      parentName: s(f, "parentName"),
      parentPhone: s(f, "parentPhone"),
      groupId,
      joinedMonth,
    },
  });
  await audit(user.id, "add-student", "student", st.id, `${name} → ${g.name}`);
  if (g.status === "ACTIVE") {
    await notify({
      kind: "student-added",
      title: `Новый ученик в группе ${g.name}: ${name}`,
      link: `/students/${st.id}`,
      ackHours: 24,
      userIds: await broadcastRecipients(groupId),
      createdById: user.id,
    });
  }
  revalidatePath(`/groups/${groupId}`);
}

export async function updateStudent(f: FormData) {
  const user = await requireUser();
  const id = s(f, "studentId");
  const data: Record<string, unknown> = {};
  if (can(user, "roster.edit") || can(user, "recruit.edit")) {
    for (const k of ["name", "phone", "parentName", "parentPhone"]) if (f.has(k)) data[k] = s(f, k);
  }
  if (can(user, "student.bio") && f.has("bio")) data.bio = s(f, "bio");
  if (can(user, "touch.edit") && f.has("parentsFlag")) {
    data.parentsNotInvolved = f.get("parentsNotInvolved") === "on";
    data.parentsNotInvolvedReason = s(f, "parentsNotInvolvedReason");
    if (data.parentsNotInvolved && !data.parentsNotInvolvedReason) return fail("Укажите причину, почему родители не участвуют");
  }
  if (!Object.keys(data).length) return fail("Нет доступа");
  await db.student.update({ where: { id }, data });
  await audit(user.id, "update-student", "student", id, Object.keys(data).join(","));
  revalidatePath(`/students/${id}`);
}

// ───────────── Посещаемость ─────────────

export async function saveAttendance(f: FormData) {
  const user = await requirePerm("attendance.edit");
  const lessonId = s(f, "lessonId");
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { group: { include: { branch: true } } } });
  const ids = f.getAll("studentId").map(String);
  const canTest = can(user, "quicktest.edit") && !lesson.group.branch.isOnline;
  for (const sid of ids) {
    const status = s(f, `status_${sid}`);
    if (!status) continue;
    if (!["PRESENT", "ABSENT", "EXCUSED"].includes(status)) continue;
    if (lesson.startsAt > new Date() && status !== "EXCUSED") continue; // будущие — только «отпросился»
    const reason = s(f, `reason_${sid}`);
    if (status === "EXCUSED" && !reason) return fail("Для «отпросился» нужна причина");
    const data = {
      status: status as "PRESENT" | "ABSENT" | "EXCUSED",
      reason,
      note: s(f, `note_${sid}`),
      markedById: user.id,
      markedAt: new Date(),
      ...(canTest ? { testScore: num(f, `score_${sid}`), testMax: num(f, `max_${sid}`) } : {}),
    };
    await db.attendance.upsert({
      where: { studentId_lessonId: { studentId: sid, lessonId } },
      create: { studentId: sid, lessonId, ...data },
      update: data,
    });
  }
  await audit(user.id, "save-attendance", "lesson", lessonId);
  await syncIfStale(true);
  revalidatePath(`/groups/${lesson.groupId}`);
}

export async function markExcused(f: FormData) {
  const user = await requirePerm("attendance.edit");
  const studentId = s(f, "studentId");
  const lessonId = s(f, "lessonId");
  const reason = s(f, "reason");
  if (!reason) return fail("Укажите причину");
  await db.attendance.upsert({
    where: { studentId_lessonId: { studentId, lessonId } },
    create: { studentId, lessonId, status: "EXCUSED", reason, markedById: user.id },
    update: { status: "EXCUSED", reason, markedById: user.id, markedAt: new Date() },
  });
  await audit(user.id, "mark-excused", "student", studentId, reason);
  revalidatePath(`/students/${studentId}`);
}

// ───────────── ДЗ ─────────────

export async function saveHomework(f: FormData) {
  const user = await requirePerm("homework.edit");
  const lessonId = s(f, "lessonId");
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId } });
  for (const sid of f.getAll("studentId").map(String)) {
    for (const type of ["EXPERIMENT", "TEST"] as const) {
      const p = `${type}_${sid}`;
      const state = s(f, `${p}_state`); // done | not | ""
      if (!state) continue;
      const done = state === "done";
      const reason = s(f, `${p}_reason`);
      const expected = s(f, `${p}_expected`);
      if (!done && !reason) return fail("Для несданного ДЗ укажите причину");
      const data = {
        done,
        score: type === "TEST" ? num(f, `${p}_score`) : null,
        maxScore: type === "TEST" ? num(f, `${p}_max`) : null,
        reason: done ? "" : reason,
        expectedDate: !done && expected ? parseDate(expected) : null,
        markedById: user.id,
        markedAt: new Date(),
      };
      await db.homework.upsert({
        where: { studentId_lessonId_type: { studentId: sid, lessonId, type } },
        create: { studentId: sid, lessonId, type, ...data },
        update: data,
      });
    }
  }
  await audit(user.id, "save-homework", "lesson", lessonId);
  await syncIfStale(true);
  revalidatePath(`/groups/${lesson.groupId}`);
}

// ───────────── Касания ─────────────

export async function saveTouches(f: FormData) {
  const user = await requirePerm("touch.edit");
  const groupId = s(f, "groupId");
  const courseMonth = Number(s(f, "courseMonth"));
  const number = Number(s(f, "number"));
  for (const sid of f.getAll("studentId").map(String)) {
    const state = s(f, `state_${sid}`); // answered | awaiting | ""
    if (!state) continue;
    const response = s(f, `response_${sid}`);
    if (state === "answered" && !response) return fail("Запишите ответ родителя дословно");
    const data = { awaiting: state === "awaiting", response: state === "awaiting" ? "" : response, byId: user.id };
    await db.touch.upsert({
      where: { studentId_groupId_courseMonth_number: { studentId: sid, groupId, courseMonth, number } },
      create: { studentId: sid, groupId, courseMonth, number, ...data },
      update: data,
    });
  }
  await audit(user.id, "save-touches", "group", groupId, `${courseMonth}/${number}`);
  await syncIfStale(true);
  revalidatePath(`/groups/${groupId}`);
}

// ───────────── Движения: перевод, уход ─────────────

export async function createMovement(f: FormData) {
  const user = await requirePerm("roster.edit");
  const studentId = s(f, "studentId");
  const type = s(f, "type") as MovementType;
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { group: true } });
  const toGroupId = type === "TRANSFER" ? s(f, "toGroupId") : null;
  const reasonCategory = s(f, "reasonCategory");
  const reasonVerbatim = s(f, "reasonVerbatim");
  const curatorAction = s(f, "curatorAction");
  if ((type === "LEAVE" || type === "TRANSFER") && (!reasonCategory || !reasonVerbatim)) return fail("Укажите причину и слова ученика дословно");
  if (type === "LEAVE" && !curatorAction) return fail("Укажите, что сделал куратор");
  if (type === "TRANSFER" && !toGroupId) return fail("Выберите группу для перевода");
  if (toGroupId === st.groupId) return fail("Ученик уже в этой группе");

  const courseMonth = await currentMonth(st.groupId);
  const mv = await db.movement.create({
    data: {
      studentId,
      type,
      fromGroupId: st.groupId,
      toGroupId,
      courseMonth,
      reasonCategory,
      reasonVerbatim,
      curatorAction,
      links: s(f, "links"),
      comment: s(f, "comment"),
      churnBusiness: type === "TRANSFER" ? false : null,
      createdById: user.id,
    },
  });

  let title = "";
  let toName = "";
  if (type === "TRANSFER" && toGroupId) {
    const to = await db.group.findUniqueOrThrow({ where: { id: toGroupId }, include: { branch: true } });
    toName = `${to.name} (${to.branch.name})`;
    const joinedMonth = to.status === "ACTIVE" ? await currentMonth(toGroupId) : 1;
    await db.student.update({ where: { id: studentId }, data: { groupId: toGroupId, joinedAt: new Date(), joinedMonth } });
    title = `Перевод: ${st.name} — ${st.group.name} → ${toName}`;
  } else if (type === "LEAVE") {
    await db.student.update({ where: { id: studentId }, data: { status: "LEFT" } });
    title = `Уход: ${st.name} (${st.group.name})`;
  } else {
    title = `Изменение состава: ${st.name} (${st.group.name})`;
  }
  await audit(user.id, `movement-${type}`, "student", studentId, title);

  const recipients = new Set([...(await broadcastRecipients(st.groupId)), ...(toGroupId ? await broadcastRecipients(toGroupId) : [])]);
  recipients.delete(user.id);
  await notify({
    kind: "movement",
    red: true,
    ackHours: 24,
    title,
    body: [reasonCategory, reasonVerbatim && `«${reasonVerbatim}»`, curatorAction && `Куратор: ${curatorAction}`].filter(Boolean).join(" · "),
    link: `/students/${studentId}`,
    userIds: Array.from(recipients),
    createdById: user.id,
  });
  void mv;
  redirect(`/students/${studentId}`);
}

export async function reviewMovement(f: FormData) {
  const user = await requireUser();
  if (!user.isFull) return fail("Атрибуцию ухода ставит только полный доступ");
  const id = s(f, "movementId");
  const v = (k: string) => (s(f, k) === "yes" ? true : s(f, k) === "no" ? false : null);
  await db.movement.update({
    where: { id },
    data: {
      churnCurator: v("churnCurator"),
      churnChem: v("churnChem"),
      churnBio: v("churnBio"),
      churnBusiness: v("churnBusiness"),
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });
  await audit(user.id, "review-movement", "movement", id);
  revalidatePath("/movements");
}

// ───────────── Риски ─────────────

export async function addRisk(f: FormData) {
  const user = await requirePerm("risk.create");
  const studentId = s(f, "studentId");
  const reason = s(f, "reason");
  if (!reason) return fail("Укажите причину риска");
  const st = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  await createRisk(studentId, st.groupId, "MANUAL", reason, user.id);
  await audit(user.id, "add-risk", "student", studentId, reason);
  revalidatePath(`/students/${studentId}`);
}

export async function closeRisk(f: FormData) {
  const user = await requireUser();
  if (!can(user, "risk.create") && !user.isFull) return fail("Нет доступа");
  const id = s(f, "riskId");
  const r = await db.risk.update({
    where: { id },
    data: { open: false, closedAt: new Date(), closedById: user.id, closeNote: s(f, "closeNote") },
  });
  await audit(user.id, "close-risk", "risk", id);
  revalidatePath(`/students/${r.studentId}`);
}

// ───────────── Отзывы ─────────────

export async function createFeedback(f: FormData) {
  const user = await requireUser();
  const tone = s(f, "tone") as Tone;
  const studentId = s(f, "studentId") || null;
  const text = s(f, "text");
  if (!text) return fail("Запишите отзыв дословно или реакцию");
  const risk = s(f, "churnRisk");
  if (tone === "NEGATIVE" && !risk) return fail("Для негативного отзыва укажите: есть риск ухода или нет");
  let groupId = s(f, "groupId") || null;
  if (studentId && !groupId) groupId = (await db.student.findUnique({ where: { id: studentId } }))?.groupId ?? null;
  const fb = await db.feedback.create({
    data: {
      date: s(f, "date") ? parseDate(s(f, "date")) : new Date(),
      studentId,
      groupId,
      anonymous: f.get("anonymous") === "on",
      fromType: s(f, "fromType"),
      fromStaffId: s(f, "fromStaffId") || null,
      channel: s(f, "channel"),
      about: s(f, "about"),
      aboutStaffId: s(f, "aboutStaffId") || null,
      tone,
      text,
      link: s(f, "link"),
      churnRisk: risk === "yes" ? true : risk === "no" ? false : null,
      action: s(f, "action"),
      checkDate: s(f, "checkDate") ? parseDate(s(f, "checkDate")) : null,
      createdById: user.id,
    },
  });
  await audit(user.id, "create-feedback", "feedback", fb.id);
  if (risk === "yes" && studentId && groupId) {
    await createRisk(studentId, groupId, "FEEDBACK", `Негативный отзыв: «${text.slice(0, 120)}»`, user.id);
  } else if (tone === "NEGATIVE") {
    await notify({
      kind: "feedback",
      red: true,
      title: "Негативный отзыв",
      body: text.slice(0, 200),
      link: "/feedback",
      userIds: (await db.user.findMany({ where: { isFull: true, active: true }, select: { id: true } })).map((u) => u.id),
      createdById: user.id,
    });
  }
  redirect(studentId ? `/students/${studentId}` : "/feedback");
}

export async function updateFeedback(f: FormData) {
  const user = await requireUser();
  const id = s(f, "feedbackId");
  const fb = await db.feedback.findUniqueOrThrow({ where: { id } });
  if (!user.isFull && !user.isHead && fb.createdById !== user.id) return fail("Нет доступа");
  await db.feedback.update({
    where: { id },
    data: {
      status: (s(f, "status") || fb.status) as FeedbackStatus,
      action: f.has("action") ? s(f, "action") : fb.action,
      decision: (user.isFull || user.isHead) && f.has("decision") ? s(f, "decision") : fb.decision,
      checkDate: s(f, "checkDate") ? parseDate(s(f, "checkDate")) : fb.checkDate,
    },
  });
  await audit(user.id, "update-feedback", "feedback", id);
  revalidatePath("/feedback");
}

// ───────────── Опросник ─────────────

export async function saveSurvey(f: FormData) {
  const user = await requirePerm("survey.edit");
  const groupId = s(f, "groupId");
  const courseMonth = Number(s(f, "courseMonth"));
  const data = {
    chemPct: num(f, "chemPct"),
    bioPct: num(f, "bioPct"),
    curatorPct: num(f, "curatorPct"),
    adminPct: num(f, "adminPct"),
    byId: user.id,
  };
  await db.survey.upsert({
    where: { groupId_courseMonth: { groupId, courseMonth } },
    create: { groupId, courseMonth, ...data },
    update: data,
  });
  await audit(user.id, "save-survey", "group", groupId, String(courseMonth));
  await syncIfStale(true);
  revalidatePath(`/groups/${groupId}`);
}

// ───────────── Задачи и уведомления ─────────────

export async function completeTask(f: FormData) {
  const user = await requireUser();
  const id = s(f, "taskId");
  const t = await db.task.findUniqueOrThrow({ where: { id } });
  const mine = t.assigneeId === user.id || t.department === user.department || user.isFull;
  if (!mine) return fail("Это не ваша задача");
  await db.task.update({ where: { id }, data: { status: "DONE", doneAt: new Date(), doneById: user.id } });
  await audit(user.id, "complete-task", "task", id);
  revalidatePath("/");
}

export async function ackNotification(f: FormData) {
  const user = await requireUser();
  const id = s(f, "recipientId");
  await db.notificationRecipient.updateMany({ where: { id, userId: user.id }, data: { ackAt: new Date() } });
  revalidatePath("/");
}

export async function ackAll() {
  const user = await requireUser();
  await db.notificationRecipient.updateMany({
    where: { userId: user.id, ackAt: null, notification: { red: false } },
    data: { ackAt: new Date() },
  });
  revalidatePath("/");
}

// ───────────── Сотрудники и доступы ─────────────

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createStaff(_: unknown, f: FormData) {
  const user = await requireUser();
  const department = s(f, "department") as Department;
  if (!canManageStaff(user, department)) return { error: "Вы можете добавлять сотрудников только своего отдела" };
  const login = s(f, "login").toLowerCase();
  const name = s(f, "name");
  if (!login || !name) return { error: "Укажите имя и логин" };
  if (!/^[a-z0-9._-]{3,32}$/.test(login)) return { error: "Логин: латиница, цифры, . _ - (3–32 символа)" };
  if (await db.user.findUnique({ where: { login } })) return { error: "Такой логин уже есть" };
  const code = s(f, "code") || genCode();
  const isHead = user.isFull && f.get("isHead") === "on";
  const isFull = user.isFull && f.get("isFull") === "on";
  const u = await db.user.create({
    data: {
      name,
      login,
      codeHash: hashCode(code),
      department,
      isHead,
      isFull: isFull || department === "LEADERSHIP",
      permissions: DEFAULT_PERMISSIONS[department],
    },
  });
  await audit(user.id, "create-staff", "user", u.id, `${name} (${department})`);
  revalidatePath("/staff");
  return { ok: `Сотрудник создан. Логин: ${login}, код: ${code} — передайте лично.` };
}

export async function updateStaff(f: FormData) {
  const user = await requireUser();
  const id = s(f, "userId");
  const target = await db.user.findUniqueOrThrow({ where: { id } });
  if (!canManageStaff(user, target.department)) return fail("Нет доступа");
  if (target.isFull && !user.isFull) return fail("Нет доступа");
  const allowed = user.isFull ? (Object.keys(GRANTABLE) as Department[]).flatMap((d) => GRANTABLE[d]) : GRANTABLE[target.department];
  const requested = f.getAll("perm").map(String) as Permission[];
  // Права вне зоны руководителя сохраняются как были
  const kept = target.permissions.filter((p) => !allowed.includes(p as Permission));
  const permissions = Array.from(new Set([...kept, ...requested.filter((p) => allowed.includes(p))]));
  await db.user.update({
    where: { id },
    data: {
      name: s(f, "name") || target.name,
      permissions,
      active: f.get("active") === "on",
      ...(user.isFull ? { isHead: f.get("isHead") === "on", isFull: f.get("isFull") === "on" } : {}),
    },
  });
  await audit(user.id, "update-staff", "user", id, permissions.join(","));
  revalidatePath("/staff");
}

export async function resetCode(_: unknown, f: FormData) {
  const user = await requireUser();
  const id = s(f, "userId");
  const target = await db.user.findUniqueOrThrow({ where: { id } });
  if (!canManageStaff(user, target.department) || (target.isFull && !user.isFull)) return { error: "Нет доступа" };
  const code = genCode();
  await db.user.update({ where: { id }, data: { codeHash: hashCode(code) } });
  await audit(user.id, "reset-code", "user", id);
  return { ok: `Новый код для ${target.login}: ${code}` };
}

export async function changeOwnCode(_: unknown, f: FormData) {
  const user = await requireUser();
  const oldCode = s(f, "oldCode");
  const newCode = s(f, "newCode");
  if (!verifyCode(oldCode, user.codeHash)) return { error: "Текущий код неверный" };
  if (newCode.length < 4) return { error: "Новый код — минимум 4 символа" };
  await db.user.update({ where: { id: user.id }, data: { codeHash: hashCode(newCode) } });
  await audit(user.id, "change-code", "user", user.id);
  return { ok: "Код изменён" };
}
