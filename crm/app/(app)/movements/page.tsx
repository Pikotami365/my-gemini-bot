import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { seesOnlyOwnGroups } from "@/lib/permissions";
import { fmtDate } from "@/lib/schedule";
import { reviewMovement } from "@/app/actions";

const TYPE = { TRANSFER: ["перевод", "amber"], LEAVE: ["уход", "red"], CHANGE: ["изменение", ""], OTHER: ["другое", ""] } as const;

function Flag({ name, value }: { name: string; value: boolean | null }) {
  return (
    <select name={name} defaultValue={value === true ? "yes" : value === false ? "no" : ""}>
      <option value="">не проверено</option>
      <option value="yes">отток</option>
      <option value="no">не отток</option>
    </select>
  );
}

function Show({ v }: { v: boolean | null }) {
  return v === true ? <span className="pill red">отток</span> : v === false ? <span className="pill green">не отток</span> : <span className="pill amber">не проверено</span>;
}

export default async function MovementsPage() {
  const user = await requireUser();
  let groupIds: string[] | undefined;
  if (seesOnlyOwnGroups(user)) {
    groupIds = (
      await db.group.findMany({
        where: user.department === "CURATOR" ? { curatorId: user.id } : { OR: [{ chemTeacherId: user.id }, { bioTeacherId: user.id }] },
        select: { id: true },
      })
    ).map((g) => g.id);
  }
  const [items, groups, users] = await Promise.all([
    db.movement.findMany({
      where: groupIds ? { OR: [{ fromGroupId: { in: groupIds } }, { toGroupId: { in: groupIds } }] } : {},
      include: { student: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.group.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const gName = new Map(groups.map((g) => [g.id, g.name]));
  const uName = new Map(users.map((u) => [u.id, u.name]));

  return (
    <>
      <h1>Движения учеников: уходы и переводы</h1>
      <p className="muted small">
        Отметку «отток / не отток» отдельно для куратора, преподавателей и бизнеса ставит руководство с полным доступом — от неё зависит удержание
        сотрудников. Непроверенный уход считается оттоком.
      </p>
      {items.length === 0 && <div className="card muted">Движений пока нет.</div>}
      {items.map((m) => (
        <div className="card" key={m.id} id={m.id}>
          <div className="row">
            <span className={`pill ${TYPE[m.type][1]}`}>{TYPE[m.type][0]}</span>
            <Link href={`/students/${m.studentId}`}><b>{m.student.name}</b></Link>
            <span className="muted small">
              {fmtDate(m.createdAt)} · {gName.get(m.fromGroupId)}{m.toGroupId && ` → ${gName.get(m.toGroupId)}`} · мес. {m.courseMonth} · зафиксировал(а) {uName.get(m.createdById)}
            </span>
          </div>
          <p style={{ margin: "6px 0" }}>
            <b>{m.reasonCategory || "—"}</b>{m.reasonVerbatim && <> · «{m.reasonVerbatim}»</>}
            {m.curatorAction && <><br /><span className="small">Что сделал куратор: {m.curatorAction}</span></>}
            {m.links && <><br /><a className="small" href={m.links} target="_blank" rel="noreferrer">скриншоты / фото</a></>}
          </p>
          {(m.type === "LEAVE" || m.type === "TRANSFER") &&
            (user.isFull ? (
              <form action={reviewMovement} className="row">
                <input type="hidden" name="movementId" value={m.id} />
                <span className="small">Куратор:</span><Flag name="churnCurator" value={m.churnCurator} />
                <span className="small">Химия:</span><Flag name="churnChem" value={m.churnChem} />
                <span className="small">Биология:</span><Flag name="churnBio" value={m.churnBio} />
                <span className="small">Бизнес:</span><Flag name="churnBusiness" value={m.churnBusiness} />
                <button className="small" type="submit">Сохранить</button>
                {m.reviewedAt && <span className="small muted">проверено {fmtDate(m.reviewedAt)}</span>}
              </form>
            ) : (
              <div className="row small">
                Куратор <Show v={m.churnCurator} /> Химия <Show v={m.churnChem} /> Биология <Show v={m.churnBio} /> Бизнес <Show v={m.churnBusiness} />
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
