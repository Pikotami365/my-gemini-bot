import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { groupWhere, taskWhere } from "@/lib/access";
import { fmtDate, fmtDateTime, todayLocal } from "@/lib/schedule";
import { ackAll, ackNotification, completeTask } from "@/app/actions";

export default async function Home() {
  const user = await requireUser();
  const now = new Date();
  const tw = user.isFull ? {} : taskWhere(user);

  const [overdue, open, redNotes, notes, risks, fbOverdue, unreviewed, lateAcks] = await Promise.all([
    db.task.findMany({ where: { ...tw, status: "OPEN", dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 100 }),
    db.task.findMany({ where: { ...taskWhere(user), status: "OPEN", dueAt: { gte: now } }, orderBy: { dueAt: "asc" }, take: 100 }),
    db.notificationRecipient.findMany({
      where: { userId: user.id, ackAt: null, notification: { red: true } },
      include: { notification: true },
      orderBy: { notification: { createdAt: "desc" } },
    }),
    db.notificationRecipient.findMany({
      where: { userId: user.id, ackAt: null, notification: { red: false } },
      include: { notification: true },
      orderBy: { notification: { createdAt: "desc" } },
      take: 50,
    }),
    db.risk.findMany({
      where: { open: true, student: { status: "ACTIVE", group: groupWhere(user) } },
      include: { student: { include: { group: true } } },
      orderBy: { createdAt: "desc" },
    }),
    user.isFull || user.isHead
      ? db.feedback.findMany({
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
            OR: [{ tone: "NEGATIVE" }, { churnRisk: true }],
            checkDate: { lt: todayLocal(now) },
          },
          include: { student: true },
        })
      : Promise.resolve([]),
    user.isFull
      ? db.movement.findMany({
          where: { type: { in: ["LEAVE", "TRANSFER"] }, reviewedAt: null },
          include: { student: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    user.isFull
      ? db.notification.findMany({
          where: { ackDueAt: { lt: now }, recipients: { some: { ackAt: null } } },
          include: { recipients: { where: { ackAt: null }, include: { user: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const redCount = overdue.length + redNotes.length + risks.length + fbOverdue.length + unreviewed.length + lateAcks.length;

  return (
    <>
      <h1>Здравствуйте, {user.name}</h1>

      <div className={`card ${redCount ? "redzone" : ""}`}>
        <h2>Красная зона {redCount ? <span className="pill red">{redCount}</span> : <span className="pill green">всё в порядке</span>}</h2>

        {redNotes.map((r) => (
          <div className="item" key={r.id}>
            <div className="row">
              <span className="pill red">{r.notification.kind === "risk" ? "риск" : "важно"}</span>
              <Link href={r.notification.link || "/"}><b>{r.notification.title}</b></Link>
              <span className="muted small">{fmtDateTime(r.notification.createdAt)}</span>
              <form action={ackNotification} style={{ marginLeft: "auto" }}>
                <input type="hidden" name="recipientId" value={r.id} />
                <button className="small" type="submit">Принято, понял(а)</button>
              </form>
            </div>
            {r.notification.body && <div className="muted small">{r.notification.body}</div>}
            {r.notification.ackDueAt && (
              <div className="small muted">Подтвердить до {fmtDateTime(r.notification.ackDueAt)}</div>
            )}
          </div>
        ))}

        {overdue.map((t) => (
          <div className="item" key={t.id}>
            <div className="row">
              <span className="pill red">просрочено</span>
              <Link href={t.link || "/"}>{t.title}</Link>
              <span className="muted small">срок {fmtDateTime(t.dueAt)}</span>
              {t.manual && (
                <form action={completeTask} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <button className="small secondary" type="submit">Выполнено</button>
                </form>
              )}
            </div>
            {t.details && <div className="muted small">{t.details}</div>}
          </div>
        ))}

        {lateAcks.map((n) => (
          <div className="item" key={n.id}>
            <span className="pill red">не приняли за 24 ч</span> <Link href={n.link || "/"}>{n.title}</Link>
            <div className="small muted">Не подтвердили: {n.recipients.map((r) => r.user.name).join(", ")}</div>
          </div>
        ))}

        {unreviewed.map((m) => (
          <div className="item" key={m.id}>
            <span className="pill amber">проверить уход/перевод</span>{" "}
            <Link href={`/movements#${m.id}`}>{m.student.name}</Link>{" "}
            <span className="muted small">— отметьте, на кого влияет (куратор / преподаватель / бизнес)</span>
          </div>
        ))}

        {fbOverdue.map((f) => (
          <div className="item" key={f.id}>
            <span className="pill red">отзыв: срок проверки прошёл</span>{" "}
            <Link href="/feedback?view=control">{f.student?.name ?? "анонимно"}</Link>{" "}
            <span className="muted small">«{f.text.slice(0, 100)}» · срок {fmtDate(f.checkDate)}</span>
          </div>
        ))}

        {risks.length > 0 && <h3>Ученики в риске ({risks.length})</h3>}
        {risks.map((r) => (
          <div className="item" key={r.id}>
            <span className="pill red">{r.source === "MANUAL" ? "риск (куратор)" : r.source === "FEEDBACK" ? "риск (отзыв)" : "авто-риск"}</span>{" "}
            <Link href={`/students/${r.studentId}`}>{r.student.name}</Link>{" "}
            <span className="muted small">{r.student.group.name} · {r.reason}</span>
          </div>
        ))}
      </div>

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Мои задачи ({open.length})</h2>
          {open.length === 0 && <p className="muted">Открытых задач нет.</p>}
          {open.map((t) => (
            <div className="item" key={t.id}>
              <div className="row">
                <Link href={t.link || "/"}>{t.title}</Link>
                <span className="muted small">до {fmtDateTime(t.dueAt)}</span>
                {t.manual && (
                  <form action={completeTask} style={{ marginLeft: "auto" }}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <button className="small secondary" type="submit">Выполнено</button>
                  </form>
                )}
              </div>
              {t.details && <div className="muted small">{t.details}</div>}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="row">
            <h2 style={{ marginTop: 0 }}>Уведомления ({notes.length})</h2>
            {notes.length > 0 && (
              <form action={ackAll} style={{ marginLeft: "auto" }}>
                <button className="small secondary" type="submit">Принять все</button>
              </form>
            )}
          </div>
          {notes.length === 0 && <p className="muted">Новых уведомлений нет.</p>}
          {notes.map((r) => (
            <div className="item" key={r.id}>
              <div className="row">
                <Link href={r.notification.link || "/"}>{r.notification.title}</Link>
                <span className="muted small">{fmtDateTime(r.notification.createdAt)}</span>
                <form action={ackNotification} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="recipientId" value={r.id} />
                  <button className="small secondary" type="submit">Принято</button>
                </form>
              </div>
              {r.notification.body && <div className="muted small">{r.notification.body}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
