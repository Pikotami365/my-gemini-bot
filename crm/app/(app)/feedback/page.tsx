import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { seesOnlyOwnGroups } from "@/lib/permissions";
import { fmtDate, isoDate, todayLocal } from "@/lib/schedule";
import { FB_STATUS_LABEL, TONE_LABEL } from "@/lib/feedback";
import { updateFeedback } from "@/app/actions";

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view ?? "list";
  let where: Prisma.FeedbackWhereInput = {};
  if (seesOnlyOwnGroups(user)) {
    const own = await db.group.findMany({
      where: user.department === "CURATOR" ? { curatorId: user.id } : { OR: [{ chemTeacherId: user.id }, { bioTeacherId: user.id }] },
      select: { id: true },
    });
    where = { OR: [{ createdById: user.id }, { groupId: { in: own.map((g) => g.id) } }, { aboutStaffId: user.id }] };
  }
  const [items, groups, users] = await Promise.all([
    db.feedback.findMany({ where, include: { student: true }, orderBy: { date: "desc" }, take: 500 }),
    db.group.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const gName = new Map(groups.map((g) => [g.id, g.name]));
  const uName = new Map(users.map((u) => [u.id, u.name]));
  const today = todayLocal();
  const canDecide = user.isFull || user.isHead;

  const summarize = (list: typeof items) => {
    const total = list.length;
    const neg = list.filter((f) => f.tone === "NEGATIVE").length;
    return {
      total,
      pos: list.filter((f) => f.tone === "POSITIVE").length,
      neu: list.filter((f) => f.tone === "NEUTRAL").length,
      neg,
      negPct: total ? Math.round((neg / total) * 100) : 0,
      risk: list.filter((f) => f.churnRisk).length,
      open: list.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length,
    };
  };
  const control = items.filter((f) => (f.tone === "NEGATIVE" || f.churnRisk) && (f.status === "OPEN" || f.status === "IN_PROGRESS"));

  const tone = (t: keyof typeof TONE_LABEL) => <span className={`pill ${t === "POSITIVE" ? "green" : t === "NEGATIVE" ? "red" : ""}`}>{TONE_LABEL[t]}</span>;

  return (
    <>
      <div className="row">
        <h1>Отзывы</h1>
        <Link href="/feedback/new" className="btn" style={{ marginLeft: "auto" }}>+ Отзыв</Link>
      </div>
      <div className="tabs">
        <Link href="/feedback" className={view === "list" ? "active" : ""}>Все отзывы</Link>
        <Link href="/feedback?view=summary" className={view === "summary" ? "active" : ""}>Сводка</Link>
        <Link href="/feedback?view=control" className={view === "control" ? "active" : ""}>Контроль ({control.length})</Link>
      </div>

      {view === "list" && (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Дата</th><th>Группа</th><th>Ученик</th><th>От кого</th><th>Канал</th><th>О чём</th><th>Тон</th><th>Риск</th><th>Отзыв</th><th>Статус</th></tr></thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id}>
                  <td>{fmtDate(f.date)}</td>
                  <td>{f.groupId ? gName.get(f.groupId) : "—"}</td>
                  <td>{f.anonymous ? "анонимно" : f.student ? <Link href={`/students/${f.studentId}`}>{f.student.name}</Link> : "—"}</td>
                  <td>{f.fromType}{f.fromStaffId && `: ${uName.get(f.fromStaffId)}`}</td>
                  <td>{f.channel}</td>
                  <td>{f.about}{f.aboutStaffId && `: ${uName.get(f.aboutStaffId)}`}</td>
                  <td>{tone(f.tone)}</td>
                  <td>{f.churnRisk === true ? <span className="pill red">да</span> : f.churnRisk === false ? "нет" : ""}</td>
                  <td className="small" style={{ minWidth: 220 }}>«{f.text}»{f.link && <> <a href={f.link} target="_blank" rel="noreferrer">скрин</a></>}</td>
                  <td>{FB_STATUS_LABEL[f.status]}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={10} className="muted">Отзывов пока нет.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === "summary" && (() => {
        const all = summarize(items);
        const byAbout = Array.from(new Set(items.map((f) => f.about))).map((a) => ({ key: a, ...summarize(items.filter((f) => f.about === a)) }));
        const byGroup = Array.from(new Set(items.map((f) => f.groupId ?? ""))).map((g) => ({ key: g ? gName.get(g) ?? "—" : "Без группы", ...summarize(items.filter((f) => (f.groupId ?? "") === g)) }));
        const Table = ({ title, rows }: { title: string; rows: { key: string; total: number; pos: number; neg: number; negPct: number; risk: number; open: number }[] }) => (
          <div className="card table-wrap">
            <h2 style={{ marginTop: 0 }}>{title}</h2>
            <table>
              <thead><tr><th></th><th>Всего</th><th>Позитив</th><th>Негатив</th><th>% негатива</th><th>Риск ухода</th><th>Открыто</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.key}</td><td>{r.total}</td><td>{r.pos}</td><td>{r.neg}</td>
                    <td>{r.negPct > 15 ? <span className="pill red">{r.negPct}%</span> : `${r.negPct}%`}</td>
                    <td>{r.risk}</td><td>{r.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        return (
          <>
            <div className="kpis" style={{ marginBottom: 14 }}>
              <div className="card"><div className="small muted">Всего</div><div className="stat">{all.total}</div></div>
              <div className="card"><div className="small muted">Позитив</div><div className="stat">{all.pos}</div></div>
              <div className="card"><div className="small muted">Нейтрально</div><div className="stat">{all.neu}</div></div>
              <div className="card"><div className="small muted">Негатив</div><div className="stat">{all.neg}</div></div>
              <div className={`card ${all.negPct > 15 ? "redzone" : ""}`}><div className="small muted">% негатива (красное &gt; 15%)</div><div className="stat">{all.negPct}%</div></div>
              <div className="card"><div className="small muted">Риск ухода / открыто</div><div className="stat">{all.risk} / {all.open}</div></div>
            </div>
            <Table title="По темам" rows={byAbout} />
            <Table title="По группам" rows={byGroup} />
          </>
        );
      })()}

      {view === "control" && (
        <div className="card">
          <p className="muted small">На контроле: негатив и риск ухода со статусом «Открыт» / «В работе». Красный срок — проверка просрочена.</p>
          {control.length === 0 && <p>Открытых проблем нет.</p>}
          {control.map((f) => {
            const overdue = f.checkDate && f.checkDate < today;
            const days = Math.floor((Date.now() - f.createdAt.getTime()) / 86400_000);
            return (
              <div className={`item`} key={f.id}>
                <div className="row">
                  {tone(f.tone)}
                  {f.churnRisk && <span className="pill red">риск ухода</span>}
                  <b>{f.student?.name ?? "анонимно"}</b>
                  <span className="small muted">{f.groupId ? gName.get(f.groupId) : ""} · {f.about} · {fmtDate(f.date)} · открыто {days} дн.</span>
                  {f.checkDate && <span className={`pill ${overdue ? "red" : ""}`}>проверка {fmtDate(f.checkDate)}</span>}
                </div>
                <div>«{f.text}»</div>
                <form action={updateFeedback} className="grid three" style={{ marginTop: 8 }}>
                  <input type="hidden" name="feedbackId" value={f.id} />
                  <div className="field"><label>Что сделано</label><input name="action" defaultValue={f.action} /></div>
                  {canDecide && <div className="field"><label>Решение руководителя</label><input name="decision" defaultValue={f.decision} /></div>}
                  <div className="field"><label>Статус</label>
                    <select name="status" defaultValue={f.status}>
                      {Object.entries(FB_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Срок проверки</label><input type="date" name="checkDate" defaultValue={isoDate(f.checkDate)} /></div>
                  <div className="field" style={{ alignSelf: "end" }}><button className="small" type="submit">Сохранить</button></div>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
