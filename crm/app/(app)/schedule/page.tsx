import Link from "next/link";
import type { Days, Slot } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { DAYS, DAYS_LABEL, DAYS_WEEKDAYS, SLOTS, SLOT_LABEL, addDays, fmtDate, isoDate, todayLocal } from "@/lib/schedule";
import { openRecruitment } from "@/app/actions";

const STATUS_LABEL = { RECRUITING: "набор", WAITING: "ждёт старта", ACTIVE: "идёт", FINISHED: "завершена" } as const;

function nextStart(days: Days): string {
  let d = addDays(todayLocal(), 1);
  while (!DAYS_WEEKDAYS[days].includes(d.getUTCDay())) d = addDays(d, 1);
  return isoDate(d);
}

export default async function SchedulePage() {
  const user = await requireUser();
  const canOpen = can(user, "recruit.edit");
  const branches = await db.branch.findMany({
    orderBy: { order: "asc" },
    include: {
      rooms: { orderBy: { order: "asc" } },
      groups: {
        where: { status: { not: "FINISHED" } },
        include: { _count: { select: { students: { where: { status: "ACTIVE" } } } }, chemTeacher: true, bioTeacher: true, curator: true },
        orderBy: { startDate: "asc" },
      },
    },
  });
  const staff = await db.user.findMany({
    where: { active: true, department: { in: ["TEACHER", "CURATOR"] } },
    include: {
      chemGroups: { where: { status: { not: "FINISHED" } }, include: { branch: true } },
      bioGroups: { where: { status: { not: "FINISHED" } }, include: { branch: true } },
      curatedGroups: { where: { status: { not: "FINISHED" } }, include: { branch: true } },
    },
    orderBy: { name: "asc" },
  });

  const OpenForm = ({ branchId, roomId, days, slot }: { branchId: string; roomId?: string; days: Days; slot: Slot }) => (
    <details>
      <summary className="small">Открыть набор</summary>
      <form action={openRecruitment}>
        <input type="hidden" name="branchId" value={branchId} />
        {roomId && <input type="hidden" name="roomId" value={roomId} />}
        <input type="hidden" name="days" value={days} />
        <input type="hidden" name="slot" value={slot} />
        <label>Дата старта ({DAYS_LABEL[days]})</label>
        <input type="date" name="startDate" defaultValue={nextStart(days)} required />
        <div style={{ marginTop: 6 }}>
          <button className="small" type="submit">Открыть</button>
        </div>
      </form>
    </details>
  );

  return (
    <>
      <h1>Расписание и свободные места</h1>
      <p className="muted small">
        Синий — группа идёт, жёлтый — идёт набор, зелёный — набор закрыт, ждёт старта. Пустая ячейка — кабинет свободен
        {canOpen ? ": нажмите «Открыть набор»." : "."} Редактируют расписание админы на странице группы.
      </p>

      {branches.map((b) => (
        <div className="card" key={b.id}>
          <h2 style={{ marginTop: 0 }}>{b.name}</h2>
          <div className="table-wrap">
            <table className="chess">
              <thead>
                <tr>
                  <th></th>
                  {DAYS.map((d) => SLOTS.map((s) => <th key={d + s}>{DAYS_LABEL[d]}<br />{SLOT_LABEL[s]}</th>))}
                </tr>
              </thead>
              <tbody>
                {(b.isOnline ? [null] : b.rooms).map((room) => (
                  <tr key={room?.id ?? "online"}>
                    <th>{room?.name ?? "Онлайн"}</th>
                    {DAYS.map((d) =>
                      SLOTS.map((s) => {
                        const gs = b.groups.filter((g) => g.days === d && g.slot === s && (b.isOnline || g.roomId === room?.id));
                        const cls = gs.some((g) => g.status === "ACTIVE") ? "busy" : gs.some((g) => g.status === "RECRUITING") ? "recruit" : gs.length ? "wait" : "";
                        return (
                          <td key={d + s}>
                            <div className={`cell ${cls}`}>
                              {gs.map((g) => (
                                <div key={g.id} style={{ marginBottom: 6 }}>
                                  <Link href={`/groups/${g.id}`}><b>{g.name}</b></Link>
                                  <div className="small muted">
                                    {STATUS_LABEL[g.status]} · {g._count.students}{b.isOnline ? "" : `/${room?.capacity ?? 22}`} уч. · старт {fmtDate(g.startDate)}
                                  </div>
                                </div>
                              ))}
                              {canOpen && (b.isOnline || !gs.some((g) => g.status !== "FINISHED")) && (
                                <OpenForm branchId={b.id} roomId={room?.id} days={d} slot={s} />
                              )}
                              {!gs.length && !canOpen && <span className="muted small">свободно</span>}
                            </div>
                          </td>
                        );
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Занятость преподавателей и кураторов</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                {DAYS.map((d) => SLOTS.map((s) => <th key={d + s}>{DAYS_LABEL[d]} {SLOT_LABEL[s]}</th>))}
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => {
                const gs = [...u.chemGroups, ...u.bioGroups, ...u.curatedGroups];
                return (
                  <tr key={u.id}>
                    <td>{u.name} <span className="muted small">{u.department === "TEACHER" ? "преп." : "куратор"}</span></td>
                    {DAYS.map((d) =>
                      SLOTS.map((s) => {
                        const here = gs.filter((g) => g.days === d && g.slot === s);
                        return (
                          <td key={d + s} className="small">
                            {here.length ? here.map((g) => <div key={g.id}><Link href={`/groups/${g.id}`}>{g.name}</Link></div>) : <span className="pill green">свободен</span>}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {staff.length === 0 && <p className="muted">Сотрудники ещё не добавлены.</p>}
      </div>
    </>
  );
}
