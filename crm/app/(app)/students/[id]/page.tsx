import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { groupWhere } from "@/lib/access";
import { can } from "@/lib/permissions";
import { DAYS, DAYS_LABEL, SLOTS, SLOT_LABEL, SUBJECT_LABEL, fmtDate, fmtDateTime } from "@/lib/schedule";
import { attendanceRatio, barClass, byMonth, bySubject, homeworkRatio, pctOf } from "@/lib/metrics";
import { addRisk, closeRisk, createMovement, markExcused, updateStudent } from "@/app/actions";

const LEAVE_REASONS = [
  "Финансы / дорого",
  "Неудобное время / расписание",
  "Не понравился преподаватель / урок",
  "Переезд",
  "Нагрузка в школе",
  "Другое",
];

const ATT_LABEL = { PRESENT: "был", ABSENT: "не был", EXCUSED: "отпросился" } as const;
const SOURCE_LABEL = { MANUAL: "куратор", AUTO_ABSENCE: "авто: пропуски", AUTO_HOMEWORK: "авто: ДЗ", FEEDBACK: "отзыв" } as const;
const TONE = { POSITIVE: ["позитив", "green"], NEUTRAL: ["нейтрально", ""], NEGATIVE: ["негатив", "red"] } as const;

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; slot?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const st = await db.student.findFirst({
    where: { id, group: groupWhere(user) },
    include: {
      group: { include: { branch: true, lessons: { orderBy: { index: "asc" } }, curator: true } },
      attendance: true,
      homework: true,
      risks: { orderBy: { createdAt: "desc" } },
      movements: { orderBy: { createdAt: "desc" } },
      feedback: { orderBy: { date: "desc" } },
      touches: { orderBy: [{ courseMonth: "asc" }, { number: "asc" }] },
    },
  });
  if (!st) notFound();

  const now = new Date();
  const lessons = st.group.lessons;
  const past = lessons.filter((l) => l.startsAt <= now);
  const upcoming = lessons.filter((l) => l.startsAt > now).slice(0, 6);
  const months = Array.from(new Set(lessons.map((l) => l.courseMonth)));
  const groupNames = new Map(
    (await db.group.findMany({ where: { id: { in: st.movements.flatMap((m) => [m.fromGroupId, m.toGroupId ?? ""]) } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]),
  );

  // Кандидаты для перевода
  const wantDays = DAYS.includes(sp.days as never) ? sp.days : undefined;
  const wantSlot = SLOTS.includes(sp.slot as never) ? sp.slot : undefined;
  const candidates = can(user, "roster.edit")
    ? await db.group.findMany({
        where: {
          id: { not: st.groupId },
          status: { not: "FINISHED" },
          ...(wantDays ? { days: wantDays as never } : {}),
          ...(wantSlot ? { slot: wantSlot as never } : {}),
        },
        include: { branch: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } },
        orderBy: [{ branch: { order: "asc" } }, { startDate: "asc" }],
      })
    : [];

  const attR = attendanceRatio(st.attendance, lessons);
  const hwR = homeworkRatio(st.homework, lessons);

  return (
    <>
      <div className="row">
        <h1 style={{ marginBottom: 4 }}>{st.name}</h1>
        {st.status === "LEFT" && <span className="pill red">ушёл</span>}
        {st.risks.some((r) => r.open) && <span className="pill red">в риске</span>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href={`/groups/${st.groupId}`}>{st.group.name}</Link> · {st.group.branch.name} · куратор {st.group.curator?.name ?? "—"}
      </p>

      <div className="kpis" style={{ marginBottom: 14 }}>
        <div className="card"><div className="small muted">Занятий пройдено / осталось</div><div className="stat">{past.length} / {lessons.length - past.length}</div></div>
        <div className="card"><div className="small muted">Посещаемость</div><div className="stat">{pctOf(attR) ?? "—"}{pctOf(attR) != null && "%"}</div><div className={`bar ${barClass(pctOf(attR))}`}><span style={{ width: `${pctOf(attR) ?? 0}%` }} /></div></div>
        <div className="card"><div className="small muted">ДЗ выполнено</div><div className="stat">{pctOf(hwR) ?? "—"}{pctOf(hwR) != null && "%"}</div><div className={`bar ${barClass(pctOf(hwR))}`}><span style={{ width: `${pctOf(hwR) ?? 0}%` }} /></div><div className="small muted">{hwR.num} из {hwR.den}</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Прогресс по месяцам</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Месяц</th><th>Посещ. химия</th><th>Посещ. биология</th><th>ДЗ опыты</th><th>ДЗ тесты</th><th>Динамика ДЗ</th></tr></thead>
            <tbody>
              {months.map((m, i) => {
                const f = byMonth(m);
                const hwm = pctOf(homeworkRatio(st.homework, lessons, f));
                const prev = i > 0 ? pctOf(homeworkRatio(st.homework, lessons, byMonth(months[i - 1]))) : null;
                const show = (r: { num: number; den: number }) => (r.den ? `${pctOf(r)}% (${r.num}/${r.den})` : "—");
                return (
                  <tr key={m}>
                    <td>Месяц {m}</td>
                    <td>{show(attendanceRatio(st.attendance, lessons, (l) => f(l) && bySubject("CHEM")(l)))}</td>
                    <td>{show(attendanceRatio(st.attendance, lessons, (l) => f(l) && bySubject("BIO")(l)))}</td>
                    <td>{show(homeworkRatio(st.homework, lessons, f, "EXPERIMENT"))}</td>
                    <td>{show(homeworkRatio(st.homework, lessons, f, "TEST"))}</td>
                    <td>{hwm != null && prev != null ? (hwm > prev ? <span className="pill green">↑ растёт</span> : hwm < prev ? <span className="pill red">↓ падает</span> : <span className="pill">= без изменений</span>) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Данные и биография</h2>
          <form action={updateStudent}>
            <input type="hidden" name="studentId" value={st.id} />
            {can(user, "roster.edit") || can(user, "recruit.edit") ? (
              <div className="grid two">
                <div className="field"><label>ФИО</label><input name="name" defaultValue={st.name} /></div>
                <div className="field"><label>Телефон</label><input name="phone" defaultValue={st.phone} /></div>
                <div className="field"><label>Имя родителя</label><input name="parentName" defaultValue={st.parentName} /></div>
                <div className="field"><label>Телефон родителя</label><input name="parentPhone" defaultValue={st.parentPhone} /></div>
              </div>
            ) : (
              <p>Тел.: {st.phone || "—"}<br />Родитель: {st.parentName || "—"} {st.parentPhone}</p>
            )}
            {can(user, "student.bio") ? (
              <div className="field"><label>Биография (заполняет куратор, необязательно)</label><textarea name="bio" defaultValue={st.bio} /></div>
            ) : (
              st.bio && <p className="muted">{st.bio}</p>
            )}
            {can(user, "touch.edit") && (
              <div className="field">
                <input type="hidden" name="parentsFlag" value="1" />
                <label><input type="checkbox" name="parentsNotInvolved" defaultChecked={st.parentsNotInvolved} /> Родители не участвуют (касания не нужны)</label>
                <select name="parentsNotInvolvedReason" defaultValue={st.parentsNotInvolvedReason}>
                  <option value="">— причина —</option>
                  <option>Нет номера родителя</option>
                  <option>Ученик сам оплачивает</option>
                  <option>Другое</option>
                </select>
              </div>
            )}
            <button className="secondary" type="submit">Сохранить</button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Риски</h2>
          {st.risks.length === 0 && <p className="muted">Рисков нет.</p>}
          {st.risks.map((r) => (
            <div className="item" key={r.id}>
              <div className="row">
                <span className={`pill ${r.open ? "red" : ""}`}>{r.open ? "открыт" : "снят"}</span>
                <span className="small muted">{SOURCE_LABEL[r.source]} · {fmtDate(r.createdAt)}</span>
              </div>
              <div>{r.reason}</div>
              {!r.open && r.closeNote && <div className="small muted">Снят: {r.closeNote}</div>}
              {r.open && (can(user, "risk.create") || user.isFull) && (
                <form action={closeRisk} className="row" style={{ marginTop: 4 }}>
                  <input type="hidden" name="riskId" value={r.id} />
                  <input name="closeNote" placeholder="что сделано / почему снят" />
                  <button className="small secondary" type="submit">Снять риск</button>
                </form>
              )}
            </div>
          ))}
          {can(user, "risk.create") && st.status === "ACTIVE" && (
            <form action={addRisk} style={{ marginTop: 10 }}>
              <input type="hidden" name="studentId" value={st.id} />
              <div className="field"><label>Поставить риск — почему?</label><textarea name="reason" required placeholder="например: сомневается, думает перейти на репетитора" /></div>
              <button className="danger" type="submit">Поставить риск</button>
            </form>
          )}
        </div>
      </div>

      {can(user, "attendance.edit") && st.status === "ACTIVE" && upcoming.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Отпросился заранее</h2>
          <form action={markExcused} className="row">
            <input type="hidden" name="studentId" value={st.id} />
            <select name="lessonId">
              {upcoming.map((l) => (
                <option key={l.id} value={l.id}>Занятие {l.index} · {SUBJECT_LABEL[l.subject]} · {fmtDateTime(l.startsAt)}</option>
              ))}
            </select>
            <input name="reason" placeholder="причина" required />
            <button className="secondary" type="submit">Отметить</button>
          </form>
        </div>
      )}

      {can(user, "roster.edit") && st.status === "ACTIVE" && (
        <div className="card" id="actions">
          <h2 style={{ marginTop: 0 }}>Изменить состав: перевод, уход, другое</h2>
          <form method="get" className="row" style={{ marginBottom: 10 }}>
            <span className="small muted">Желаемое время для перевода:</span>
            <select name="days" defaultValue={wantDays ?? ""}>
              <option value="">любые дни</option>
              {DAYS.map((d) => <option key={d} value={d}>{DAYS_LABEL[d]}</option>)}
            </select>
            <select name="slot" defaultValue={wantSlot ?? ""}>
              <option value="">любое время</option>
              {SLOTS.map((x) => <option key={x} value={x}>{SLOT_LABEL[x]}</option>)}
            </select>
            <button className="small secondary" type="submit">Показать группы</button>
          </form>
          <form action={createMovement}>
            <input type="hidden" name="studentId" value={st.id} />
            <div className="grid two">
              <div className="field">
                <label>Действие</label>
                <select name="type" defaultValue="TRANSFER">
                  <option value="TRANSFER">Перевод в другую группу</option>
                  <option value="LEAVE">Уход</option>
                  <option value="CHANGE">Изменение состава</option>
                  <option value="OTHER">Другое</option>
                </select>
              </div>
              <div className="field">
                <label>Группа для перевода (свободные места)</label>
                <select name="toGroupId" defaultValue="">
                  <option value="">—</option>
                  {candidates.map((g) => {
                    const free = g.branch.isOnline ? "без лимита" : `${22 - g._count.students} мест`;
                    return (
                      <option key={g.id} value={g.id} disabled={!g.branch.isOnline && g._count.students >= 22}>
                        {g.branch.name} · {g.name} · {DAYS_LABEL[g.days]} {SLOT_LABEL[g.slot]} · {free}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="field">
                <label>Причина</label>
                <select name="reasonCategory" defaultValue="">
                  <option value="">—</option>
                  {LEAVE_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Ссылки на скриншоты / фото</label>
                <input name="links" placeholder="https://…" />
              </div>
            </div>
            <div className="field"><label>Как написал/сказал ученик — дословно</label><textarea name="reasonVerbatim" /></div>
            <div className="field"><label>Что сделал куратор (обязательно при уходе)</label><textarea name="curatorAction" /></div>
            <div className="field"><label>Комментарий</label><input name="comment" /></div>
            <p className="small muted">После сохранения все (админы, менеджеры, кураторы, руководство) получат красное уведомление — его нужно принять в течение 24 часов.</p>
            <button className="danger" type="submit">Сохранить изменение</button>
          </form>
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Посещаемость</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>№</th><th>Дата</th><th>Предмет</th><th>Отметка</th><th>Причина / тест</th></tr></thead>
              <tbody>
                {past.map((l) => {
                  const a = st.attendance.find((x) => x.lessonId === l.id);
                  return (
                    <tr key={l.id}>
                      <td>{l.index}</td>
                      <td>{fmtDate(l.startsAt)}</td>
                      <td>{SUBJECT_LABEL[l.subject]}</td>
                      <td>{a ? <span className={`pill ${a.status === "PRESENT" ? "green" : a.status === "ABSENT" ? "red" : "amber"}`}>{ATT_LABEL[a.status]}</span> : "—"}</td>
                      <td className="small">{a?.reason}{a?.testScore != null && ` тест ${a.testScore}/${a.testMax ?? "?"}`}{a?.note && ` ${a.note}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>ДЗ</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>№</th><th>Опыт</th><th>Тест</th></tr></thead>
              <tbody>
                {past.filter((l) => l.endsAt <= now).map((l) => {
                  const e = st.homework.find((h) => h.lessonId === l.id && h.type === "EXPERIMENT");
                  const t = st.homework.find((h) => h.lessonId === l.id && h.type === "TEST");
                  const cell = (h?: typeof e) =>
                    !h ? "—" : h.done ? <span className="pill green">сдано{h.score != null ? ` ${h.score}/${h.maxScore ?? "?"}` : ""}</span> : <span className="small"><span className="pill red">не сдано</span> {h.reason}{h.expectedDate && ` · ждём ${fmtDate(h.expectedDate)}`}</span>;
                  return (
                    <tr key={l.id}><td>{l.index}</td><td>{cell(e)}</td><td>{cell(t)}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Касания с родителями</h2>
          {st.parentsNotInvolved && <p><span className="pill">родители не участвуют</span> {st.parentsNotInvolvedReason}</p>}
          {st.touches.length === 0 && <p className="muted">Касаний пока нет.</p>}
          {st.touches.map((t) => (
            <div className="item" key={t.id}>
              <b>Месяц {t.courseMonth}, касание {t.number}</b> · {fmtDate(t.doneAt)}{" "}
              {t.awaiting ? <span className="pill amber">ожидается ответ</span> : <span className="pill green">ответ получен</span>}
              {t.response && <div className="small">«{t.response}»</div>}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="row">
            <h2 style={{ marginTop: 0 }}>Отзывы</h2>
            <Link className="btn small" href={`/feedback/new?student=${st.id}`} style={{ marginLeft: "auto" }}>+ Отзыв</Link>
          </div>
          {st.feedback.length === 0 && <p className="muted">Отзывов нет.</p>}
          {st.feedback.map((f) => (
            <div className="item" key={f.id}>
              <span className={`pill ${TONE[f.tone][1]}`}>{TONE[f.tone][0]}</span> <span className="small muted">{fmtDate(f.date)} · {f.fromType} · о: {f.about}</span>
              <div className="small">«{f.text}»</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>История движений</h2>
        {st.movements.length === 0 && <p className="muted">Не было.</p>}
        {st.movements.map((m) => (
          <div className="item" key={m.id}>
            <b>{fmtDate(m.createdAt)}</b> · {m.type === "TRANSFER" ? `перевод: ${groupNames.get(m.fromGroupId)} → ${groupNames.get(m.toGroupId ?? "")}` : m.type === "LEAVE" ? "уход" : "изменение"}{" "}
            · {m.reasonCategory} {m.reasonVerbatim && <>· «{m.reasonVerbatim}»</>} {m.curatorAction && <div className="small muted">Куратор: {m.curatorAction}</div>}
            {m.links && <div className="small"><a href={m.links} target="_blank" rel="noreferrer">скриншоты</a></div>}
          </div>
        ))}
      </div>
    </>
  );
}
