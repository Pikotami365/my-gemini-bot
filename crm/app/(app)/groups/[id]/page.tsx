import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { groupWhere } from "@/lib/access";
import { can } from "@/lib/permissions";
import {
  DAYS,
  DAYS_LABEL,
  SLOTS,
  SLOT_LABEL,
  SUBJECT_LABEL,
  fmtDate,
  fmtDateTime,
  isoDate,
  positionInMonth,
  toLocal,
} from "@/lib/schedule";
import { attendanceRatio, barClass, bySubject, efficiency, homeworkRatio, lateJoinsFor, pctOf, retention, type Ratio } from "@/lib/metrics";
import {
  addStudent,
  assignCurator,
  closeRecruitment,
  reopenRecruitment,
  rescheduleLesson,
  saveAttendance,
  saveHomework,
  saveSurvey,
  saveTouches,
  updateGroupInfo,
  updateGroupOrg,
  updatePrice,
} from "@/app/actions";

const STATUS_LABEL = { RECRUITING: "Идёт набор", WAITING: "Набор закрыт, ждёт старта", ACTIVE: "Группа идёт", FINISHED: "Завершена" };

function Pct({ r, label }: { r: Ratio | number | null; label?: string }) {
  const p = typeof r === "number" || r === null ? r : pctOf(r);
  return (
    <div>
      {label && <div className="small muted">{label}</div>}
      <div className="row">
        <b>{p == null ? "—" : `${p}%`}</b>
        {typeof r === "object" && r && <span className="small muted">{r.num}/{r.den}</span>}
      </div>
      <div className={`bar ${barClass(p)}`}><span style={{ width: `${p ?? 0}%` }} /></div>
    </div>
  );
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; lesson?: string; month?: string; n?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";

  const g = await db.group.findFirst({
    where: { id, ...groupWhere(user) },
    include: {
      branch: { include: { rooms: { orderBy: { order: "asc" } } } },
      room: true,
      chemTeacher: true,
      bioTeacher: true,
      curator: true,
      lessons: { orderBy: { index: "asc" }, include: { teacher: true, room: true } },
      students: { orderBy: { name: "asc" }, include: { risks: { where: { open: true } } } },
      surveys: true,
      touches: true,
    },
  });
  if (!g) notFound();

  const now = new Date();
  const active = g.students.filter((s) => s.status === "ACTIVE");
  const lessonIds = g.lessons.map((l) => l.id);
  const [att, hw, movements, teachers, curators] = await Promise.all([
    db.attendance.findMany({ where: { lessonId: { in: lessonIds } } }),
    db.homework.findMany({ where: { lessonId: { in: lessonIds } } }),
    db.movement.findMany({
      where: { OR: [{ fromGroupId: id }, { toGroupId: id }] },
      include: { student: true },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({ where: { department: "TEACHER", active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { department: "CURATOR", active: true }, orderBy: { name: "asc" } }),
  ]);

  const past = g.lessons.filter((l) => l.startsAt <= now);
  const currentLesson = past[past.length - 1];
  const currentMonth = currentLesson?.courseMonth ?? 1;
  const tabs: [string, string][] = [
    ["overview", "Состав"],
    ["attendance", "Посещаемость"],
    ["homework", "ДЗ"],
    ["touches", "Касания"],
    ["survey", "Опросник"],
    ["schedule", "Занятия"],
    ["history", "Движения"],
  ];

  const canOrg = can(user, "schedule.edit");
  const canRecruit = can(user, "recruit.edit");
  const canRoster = can(user, "roster.edit") || canRecruit;
  const canCurator = user.isFull || (user.isHead && user.department === "CURATOR");

  const lessonParam = Number(sp.lesson);
  const selLesson =
    g.lessons.find((l) => l.index === lessonParam) ??
    (tab === "homework" ? [...past].reverse().find((l) => l.endsAt <= now) : currentLesson) ??
    g.lessons[0];

  const LessonPicker = ({ tabName, onlyPast }: { tabName: string; onlyPast?: boolean }) => (
    <div className="row" style={{ marginBottom: 10 }}>
      {Array.from(new Set(g.lessons.map((l) => l.courseMonth))).map((m) => (
        <span key={m} className="row" style={{ gap: 4 }}>
          <span className="small muted">Мес. {m}:</span>
          {g.lessons
            .filter((l) => l.courseMonth === m && (!onlyPast || l.startsAt <= now || tabName === "attendance"))
            .map((l) => (
              <Link
                key={l.id}
                href={`/groups/${id}?tab=${tabName}&lesson=${l.index}`}
                className={`pill ${l.id === selLesson?.id ? "blue" : l.startsAt > now ? "" : "green"}`}
                title={`${fmtDateTime(l.startsAt)} · ${SUBJECT_LABEL[l.subject]}`}
              >
                {positionInMonth(l.index)}
              </Link>
            ))}
        </span>
      ))}
    </div>
  );

  const startCount = g.startCount ?? active.length;
  const lateJoins = lateJoinsFor(g.students, g.lessons[0]?.startsAt);

  return (
    <>
      <div className="row">
        <h1 style={{ marginBottom: 4 }}>{g.name}</h1>
        <span className="pill blue">{STATUS_LABEL[g.status]}</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {g.branch.name}{g.room ? `, ${g.room.name}` : ""} · {DAYS_LABEL[g.days]} · {SLOT_LABEL[g.slot]} · старт {fmtDate(g.startDate)} ·{" "}
        {g.months} мес. · {g.price.toLocaleString("ru-RU")} сом/мес
        {g.description && <><br />{g.description}</>}
      </p>

      <div className="tabs">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/groups/${id}?tab=${k}`} className={tab === k ? "active" : ""}>{label}</Link>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="kpis" style={{ marginBottom: 14 }}>
            <div className="card"><div className="small muted">Учеников сейчас</div><div className="stat">{active.length}{g.branch.isOnline ? "" : "/22"}</div></div>
            <div className="card"><div className="small muted">На старте</div><div className="stat">{g.startCount ?? "—"}</div></div>
            <div className="card"><Pct label="Посещаемость: химия" r={attendanceRatio(att, g.lessons, bySubject("CHEM"))} /></div>
            <div className="card"><Pct label="Посещаемость: биология" r={attendanceRatio(att, g.lessons, bySubject("BIO"))} /></div>
            {!g.branch.isOnline && <div className="card"><Pct label="Эффективность: химия" r={efficiency(att, g.lessons, bySubject("CHEM"))} /></div>}
            {!g.branch.isOnline && <div className="card"><Pct label="Эффективность: биология" r={efficiency(att, g.lessons, bySubject("BIO"))} /></div>}
            <div className="card"><Pct label="ДЗ: опыты" r={homeworkRatio(hw, g.lessons, undefined, "EXPERIMENT")} /></div>
            <div className="card"><Pct label="ДЗ: тесты" r={homeworkRatio(hw, g.lessons, undefined, "TEST")} /></div>
            {g.status !== "RECRUITING" && g.status !== "WAITING" && (
              <div className="card"><Pct label={`Удержание (бизнес), мес. ${currentMonth}`} r={retention({ startCount, lateJoins, movements, groupId: id, month: currentMonth, kind: "business" })} /></div>
            )}
          </div>

          <div className="grid two">
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Команда группы</h2>
              <p>
                Химия: <b>{g.chemTeacher?.name ?? "не назначен"}</b><br />
                Биология: <b>{g.bioTeacher?.name ?? "не назначен"}</b><br />
                Куратор: <b>{g.curator?.name ?? "не назначен"}</b>
              </p>
              {canCurator && (
                <form action={assignCurator} className="row">
                  <input type="hidden" name="groupId" value={id} />
                  <select name="curatorId" defaultValue={g.curatorId ?? ""}>
                    <option value="">— куратор —</option>
                    {curators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="small" type="submit">Назначить куратора</button>
                </form>
              )}
              {canOrg && (
                <details>
                  <summary>Кабинет, преподаватели, расписание (админ)</summary>
                  <form action={updateGroupOrg}>
                    <input type="hidden" name="groupId" value={id} />
                    <div className="grid two">
                      {!g.branch.isOnline && (
                        <div className="field">
                          <label>Кабинет</label>
                          <select name="roomId" defaultValue={g.roomId ?? ""}>
                            {g.branch.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="field">
                        <label>Преподаватель химии</label>
                        <select name="chemTeacherId" defaultValue={g.chemTeacherId ?? ""}>
                          <option value="">—</option>
                          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Преподаватель биологии</label>
                        <select name="bioTeacherId" defaultValue={g.bioTeacherId ?? ""}>
                          <option value="">—</option>
                          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      {g.status !== "ACTIVE" && (
                        <>
                          <div className="field">
                            <label>Дни</label>
                            <select name="days" defaultValue={g.days}>
                              {DAYS.map((d) => <option key={d} value={d}>{DAYS_LABEL[d]}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Время</label>
                            <select name="slot" defaultValue={g.slot}>
                              {SLOTS.map((x) => <option key={x} value={x}>{SLOT_LABEL[x]}</option>)}
                            </select>
                          </div>
                          <div className="field">
                            <label>Дата старта</label>
                            <input type="date" name="startDate" defaultValue={isoDate(g.startDate)} />
                          </div>
                        </>
                      )}
                    </div>
                    <p className="small muted">Замена преподавателя применяется ко всем будущим занятиям. Перенос отдельного занятия — во вкладке «Занятия».</p>
                    <button type="submit">Сохранить</button>
                  </form>
                </details>
              )}
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>Название и описание</h2>
              {canRoster || canOrg ? (
                <form action={updateGroupInfo}>
                  <input type="hidden" name="groupId" value={id} />
                  <div className="field"><label>Название</label><input name="name" defaultValue={g.name} required /></div>
                  <div className="field"><label>Описание (расписание группы и т.п.)</label><textarea name="description" defaultValue={g.description} /></div>
                  <button className="secondary" type="submit">Сохранить</button>
                </form>
              ) : (
                <p>{g.description || "—"}</p>
              )}
              {canRecruit && (
                <>
                  <h3>Набор и оплата</h3>
                  <div className="row">
                    {g.status === "RECRUITING" && (
                      <form action={closeRecruitment}>
                        <input type="hidden" name="groupId" value={id} />
                        <button type="submit">Набор закончен</button>
                      </form>
                    )}
                    {g.status === "WAITING" && (
                      <form action={reopenRecruitment}>
                        <input type="hidden" name="groupId" value={id} />
                        <button className="secondary" type="submit">Вернуть в набор</button>
                      </form>
                    )}
                    <form action={updatePrice} className="row">
                      <input type="hidden" name="groupId" value={id} />
                      <input name="price" className="num" style={{ width: 90 }} defaultValue={g.price} />
                      <span className="small muted">сом/мес</span>
                      <button className="small secondary" type="submit">Сохранить сумму</button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Ученики ({active.length})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>ФИО</th><th>Телефон</th><th>Родитель</th><th>Тел. родителя</th><th>Посещ.</th><th>ДЗ</th><th></th></tr>
                </thead>
                <tbody>
                  {active.map((s) => {
                    const a = attendanceRatio(att.filter((x) => x.studentId === s.id), g.lessons);
                    const h = homeworkRatio(hw.filter((x) => x.studentId === s.id), g.lessons);
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/students/${s.id}`}>{s.name}</Link>
                          {s.risks.length > 0 && <> <span className="pill red">риск</span></>}
                          {lateJoins.has(s.id) && <> <span className="pill">с мес. {s.joinedMonth}</span></>}
                        </td>
                        <td>{s.phone}</td>
                        <td>{s.parentName}</td>
                        <td>{s.parentPhone}</td>
                        <td>{pctOf(a) == null ? "—" : `${pctOf(a)}%`}</td>
                        <td>{pctOf(h) == null ? "—" : `${pctOf(h)}%`}</td>
                        <td><Link href={`/students/${s.id}#actions`} className="small">перевод / уход</Link></td>
                      </tr>
                    );
                  })}
                  {active.length === 0 && <tr><td colSpan={7} className="muted">Учеников пока нет.</td></tr>}
                </tbody>
              </table>
            </div>
            {canRoster && (
              <details open={active.length === 0}>
                <summary>Добавить ученика</summary>
                <form action={addStudent}>
                  <input type="hidden" name="groupId" value={id} />
                  <div className="grid three">
                    <div className="field"><label>ФИО ученика *</label><input name="name" required /></div>
                    <div className="field"><label>Телефон ученика</label><input name="phone" inputMode="tel" /></div>
                    <div className="field"><label>Имя родителя</label><input name="parentName" /></div>
                    <div className="field"><label>Телефон родителя</label><input name="parentPhone" inputMode="tel" /></div>
                  </div>
                  <button type="submit">Добавить</button>
                </form>
              </details>
            )}
            {g.students.some((s) => s.status === "LEFT") && (
              <p className="small muted">Ушли: {g.students.filter((s) => s.status === "LEFT").map((s) => s.name).join(", ")}</p>
            )}
          </div>
        </>
      )}

      {tab === "attendance" && selLesson && (
        <div className="card">
          <LessonPicker tabName="attendance" />
          <h2 style={{ marginTop: 0 }}>
            Занятие {selLesson.index} · {SUBJECT_LABEL[selLesson.subject]} · {fmtDateTime(selLesson.startsAt)}
            {selLesson.teacher && <span className="muted small"> · {selLesson.teacher.name}</span>}
          </h2>
          {selLesson.startsAt > now && (
            <p className="alert ok">Занятие ещё не прошло — можно отметить только «отпросился» с причиной.</p>
          )}
          {selLesson.endsAt < now && !active.every((s) => att.some((a) => a.lessonId === selLesson.id && a.studentId === s.id)) && (
            <p className="alert error">Посещаемость отмечена не у всех — это красная зона.</p>
          )}
          {can(user, "attendance.edit") ? (
            <form action={saveAttendance}>
              <input type="hidden" name="lessonId" value={selLesson.id} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ученик</th><th>Отметка</th><th>Причина отсутствия</th>
                      {!g.branch.isOnline && <th>Быстрый тест (балл / из)</th>}
                      {g.branch.isOnline && <th>Примечание (обзвон)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {active.filter((s) => s.joinedAt <= selLesson.endsAt || selLesson.startsAt > now).map((s) => {
                      const a = att.find((x) => x.lessonId === selLesson.id && x.studentId === s.id);
                      return (
                        <tr key={s.id}>
                          <td>
                            <input type="hidden" name="studentId" value={s.id} />
                            <Link href={`/students/${s.id}`}>{s.name}</Link>
                          </td>
                          <td>
                            <select name={`status_${s.id}`} defaultValue={a?.status ?? ""}>
                              <option value="">—</option>
                              {selLesson.startsAt <= now && <option value="PRESENT">был</option>}
                              {selLesson.startsAt <= now && <option value="ABSENT">не был</option>}
                              <option value="EXCUSED">отпросился</option>
                            </select>
                          </td>
                          <td><input name={`reason_${s.id}`} defaultValue={a?.reason ?? ""} placeholder="причина" /></td>
                          {!g.branch.isOnline && (
                            <td className="row">
                              <input className="num" name={`score_${s.id}`} defaultValue={a?.testScore ?? ""} disabled={!can(user, "quicktest.edit")} />
                              /
                              <input className="num" name={`max_${s.id}`} defaultValue={a?.testMax ?? ""} disabled={!can(user, "quicktest.edit")} />
                            </td>
                          )}
                          {g.branch.isOnline && <td><input name={`note_${s.id}`} defaultValue={a?.note ?? ""} /></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p><button type="submit">Сохранить посещаемость</button></p>
            </form>
          ) : (
            <ReadOnlyAttendance students={active} att={att.filter((a) => a.lessonId === selLesson.id)} online={g.branch.isOnline} />
          )}
        </div>
      )}

      {tab === "homework" && (
        <div className="card">
          <LessonPicker tabName="homework" onlyPast />
          {!selLesson || selLesson.endsAt > now ? (
            <p className="muted">ДЗ отмечается после занятия.</p>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>
                ДЗ к занятию {selLesson.index} · {SUBJECT_LABEL[selLesson.subject]} · {fmtDate(selLesson.startsAt)}
              </h2>
              <p className="small muted">
                Срок — до начала следующего занятия. Исправлять можно весь месяц. Не сдано — причина и дата, когда ожидается сдача
                (в этот день появится задача «принять ДЗ»).
              </p>
              <form action={saveHomework}>
                <input type="hidden" name="lessonId" value={selLesson.id} />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Ученик</th><th>Опыт</th><th>Тест</th></tr>
                    </thead>
                    <tbody>
                      {active.filter((s) => s.joinedAt <= selLesson.endsAt).map((s) => (
                        <tr key={s.id}>
                          <td>
                            <input type="hidden" name="studentId" value={s.id} />
                            <Link href={`/students/${s.id}`}>{s.name}</Link>
                          </td>
                          {(["EXPERIMENT", "TEST"] as const).map((t) => {
                            const r = hw.find((x) => x.lessonId === selLesson.id && x.studentId === s.id && x.type === t);
                            const p = `${t}_${s.id}`;
                            const ro = !can(user, "homework.edit");
                            return (
                              <td key={t}>
                                <div className="row">
                                  <select name={`${p}_state`} defaultValue={r ? (r.done ? "done" : "not") : ""} disabled={ro}>
                                    <option value="">—</option>
                                    <option value="done">сдано</option>
                                    <option value="not">не сдано</option>
                                  </select>
                                  {t === "TEST" && (
                                    <>
                                      <input className="num" name={`${p}_score`} placeholder="балл" defaultValue={r?.score ?? ""} disabled={ro} />
                                      из
                                      <input className="num" name={`${p}_max`} placeholder="макс" defaultValue={r?.maxScore ?? ""} disabled={ro} />
                                    </>
                                  )}
                                </div>
                                <div className="row" style={{ marginTop: 4 }}>
                                  <input name={`${p}_reason`} placeholder="причина, если не сдано" defaultValue={r?.reason ?? ""} disabled={ro} />
                                  <input type="date" name={`${p}_expected`} defaultValue={isoDate(r?.expectedDate)} disabled={ro} title="Когда ожидается сдача" />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {can(user, "homework.edit") && <p><button type="submit">Сохранить ДЗ</button></p>}
              </form>
            </>
          )}
        </div>
      )}

      {tab === "touches" && (() => {
        const months = Array.from(new Set(g.lessons.map((l) => l.courseMonth)));
        const month = Number(sp.month) || currentMonth;
        const number = Number(sp.n) || 1;
        const need = active.filter((s) => !s.parentsNotInvolved);
        return (
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              {months.map((m) =>
                [1, 2].map((n) => (
                  <Link key={`${m}-${n}`} href={`/groups/${id}?tab=touches&month=${m}&n=${n}`} className={`pill ${m === month && n === number ? "blue" : ""}`}>
                    Мес. {m} · касание {n}
                  </Link>
                )),
              )}
            </div>
            <h2 style={{ marginTop: 0 }}>Касание №{number}, месяц {month} — после {number === 1 ? "6-го" : "12-го"} занятия</h2>
            <p className="small muted">Куратор отправляет родителю отчёт по ученику и фиксирует ответ дословно или «ожидается ответ». Цель — 100%.</p>
            <form action={saveTouches}>
              <input type="hidden" name="groupId" value={id} />
              <input type="hidden" name="courseMonth" value={month} />
              <input type="hidden" name="number" value={number} />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Ученик</th><th>Родитель</th><th>Статус</th><th>Ответ родителя (дословно)</th></tr></thead>
                  <tbody>
                    {active.map((s) => {
                      const t = g.touches.find((x) => x.studentId === s.id && x.courseMonth === month && x.number === number);
                      return (
                        <tr key={s.id}>
                          <td><Link href={`/students/${s.id}`}>{s.name}</Link></td>
                          <td>{s.parentName} {s.parentPhone}</td>
                          {s.parentsNotInvolved ? (
                            <td colSpan={2}><span className="pill">родители не участвуют</span> <span className="small muted">{s.parentsNotInvolvedReason}</span></td>
                          ) : (
                            <>
                              <td>
                                <input type="hidden" name="studentId" value={s.id} />
                                <select name={`state_${s.id}`} defaultValue={t ? (t.awaiting ? "awaiting" : "answered") : ""} disabled={!can(user, "touch.edit")}>
                                  <option value="">не выполнено</option>
                                  <option value="awaiting">выполнено, ожидается ответ</option>
                                  <option value="answered">выполнено, есть ответ</option>
                                </select>
                              </td>
                              <td><textarea name={`response_${s.id}`} defaultValue={t?.response ?? ""} style={{ minHeight: 38 }} disabled={!can(user, "touch.edit")} /></td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small muted">
                Выполнено: {g.touches.filter((t) => t.courseMonth === month && t.number === number && need.some((s) => s.id === t.studentId)).length} из {need.length}
              </p>
              {can(user, "touch.edit") && <button type="submit">Сохранить касания</button>}
            </form>
          </div>
        );
      })()}

      {tab === "survey" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Опросник конца месяца</h2>
          <p className="small muted">Проводится на последней неделе месяца (11-е или 12-е занятие). Админ вносит готовые проценты.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Месяц</th><th>Химия, %</th><th>Биология, %</th><th>Куратор, %</th><th>Админ, %</th><th></th></tr></thead>
              <tbody>
                {Array.from(new Set(g.lessons.map((l) => l.courseMonth))).map((m) => {
                  const sv = g.surveys.find((x) => x.courseMonth === m);
                  const ro = !can(user, "survey.edit");
                  return (
                    <tr key={m}>
                      <td>Месяц {m}</td>
                      <td colSpan={5}>
                        <form action={saveSurvey} className="row">
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="courseMonth" value={m} />
                          <input className="num" name="chemPct" defaultValue={sv?.chemPct ?? ""} disabled={ro} placeholder={g.chemTeacher?.name ?? "химия"} />
                          <input className="num" name="bioPct" defaultValue={sv?.bioPct ?? ""} disabled={ro} placeholder={g.bioTeacher?.name ?? "биол."} />
                          <input className="num" name="curatorPct" defaultValue={sv?.curatorPct ?? ""} disabled={ro} placeholder="кур." />
                          <input className="num" name="adminPct" defaultValue={sv?.adminPct ?? ""} disabled={ro} placeholder="адм." />
                          {!ro && <button className="small secondary" type="submit">Сохранить</button>}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Занятия</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>№</th><th>Мес.</th><th>Предмет</th><th>Дата и время</th><th>Преподаватель</th><th>Кабинет</th>{canOrg && <th>Перенос / замена</th>}</tr></thead>
              <tbody>
                {g.lessons.map((l) => {
                  const loc = toLocal(l.startsAt);
                  return (
                    <tr key={l.id} style={{ opacity: l.endsAt < now ? 0.6 : 1 }}>
                      <td>{l.index}</td>
                      <td>{l.courseMonth}</td>
                      <td>{SUBJECT_LABEL[l.subject]}</td>
                      <td>{fmtDateTime(l.startsAt)}</td>
                      <td>{l.teacher?.name ?? "—"}</td>
                      <td>{l.room?.name ?? (g.branch.isOnline ? "онлайн" : "—")}</td>
                      {canOrg && (
                        <td>
                          {l.startsAt > now && (
                            <details>
                              <summary className="small">изменить</summary>
                              <form action={rescheduleLesson} className="row">
                                <input type="hidden" name="lessonId" value={l.id} />
                                <input type="date" name="date" defaultValue={loc.toISOString().slice(0, 10)} />
                                <input type="time" name="time" defaultValue={loc.toISOString().slice(11, 16)} />
                                <select name="teacherId" defaultValue={l.teacherId ?? ""}>
                                  <option value="">—</option>
                                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                {!g.branch.isOnline && (
                                  <select name="roomId" defaultValue={l.roomId ?? ""}>
                                    {g.branch.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                  </select>
                                )}
                                <button className="small" type="submit">OK</button>
                              </form>
                            </details>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Кто пришёл и кто ушёл</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Дата</th><th>Ученик</th><th>Тип</th><th>Причина</th><th>Со слов ученика</th><th>Что сделал куратор</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.createdAt)}</td>
                    <td><Link href={`/students/${m.studentId}`}>{m.student.name}</Link></td>
                    <td>
                      {m.type === "TRANSFER" ? (m.toGroupId === id ? <span className="pill green">пришёл переводом</span> : <span className="pill amber">перевёлся</span>) : m.type === "LEAVE" ? <span className="pill red">ушёл</span> : <span className="pill">изменение</span>}
                    </td>
                    <td>{m.reasonCategory}</td>
                    <td>{m.reasonVerbatim}</td>
                    <td>{m.curatorAction}</td>
                  </tr>
                ))}
                {g.students.filter((s) => lateJoins.has(s.id) && !movements.some((m) => m.studentId === s.id && m.toGroupId === id)).map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.joinedAt)}</td>
                    <td><Link href={`/students/${s.id}`}>{s.name}</Link></td>
                    <td><span className="pill green">новый, мес. {s.joinedMonth}</span></td>
                    <td colSpan={3}></td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={6} className="muted">Движений не было.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ReadOnlyAttendance({
  students,
  att,
  online,
}: {
  students: { id: string; name: string }[];
  att: { studentId: string; status: string; reason: string; testScore: number | null; testMax: number | null; note: string }[];
  online: boolean;
}) {
  const L: Record<string, string> = { PRESENT: "был", ABSENT: "не был", EXCUSED: "отпросился" };
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Ученик</th><th>Отметка</th><th>Причина</th><th>{online ? "Примечание" : "Быстрый тест"}</th></tr></thead>
        <tbody>
          {students.map((s) => {
            const a = att.find((x) => x.studentId === s.id);
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{a ? L[a.status] : "—"}</td>
                <td>{a?.reason}</td>
                <td>{online ? a?.note : a?.testScore != null ? `${a.testScore}/${a.testMax ?? "?"}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
