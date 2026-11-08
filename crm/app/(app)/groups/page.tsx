import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { groupWhere } from "@/lib/access";
import { DAYS_LABEL, SLOT_LABEL, fmtDate } from "@/lib/schedule";

const STATUS = { RECRUITING: ["набор", "amber"], WAITING: ["ждёт старта", "green"], ACTIVE: ["идёт", "blue"], FINISHED: ["завершена", ""] } as const;

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ status?: string; branch?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const showFinished = sp.status === "finished";
  const [branches, groups] = await Promise.all([
    db.branch.findMany({ orderBy: { order: "asc" } }),
    db.group.findMany({
      where: {
        ...groupWhere(user),
        status: showFinished ? "FINISHED" : { not: "FINISHED" },
        ...(sp.branch ? { branchId: sp.branch } : {}),
      },
      include: {
        branch: true,
        room: true,
        curator: true,
        chemTeacher: true,
        bioTeacher: true,
        _count: { select: { students: { where: { status: "ACTIVE" } } } },
        students: { where: { status: "ACTIVE", risks: { some: { open: true } } }, select: { id: true } },
      },
      orderBy: [{ branch: { order: "asc" } }, { startDate: "asc" }],
    }),
  ]);

  return (
    <>
      <h1>Группы</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className={`btn ${!sp.branch ? "" : "secondary"}`} href={`/groups${showFinished ? "?status=finished" : ""}`}>Все</Link>
        {branches.map((b) => (
          <Link key={b.id} className={`btn ${sp.branch === b.id ? "" : "secondary"}`} href={`/groups?branch=${b.id}${showFinished ? "&status=finished" : ""}`}>{b.name}</Link>
        ))}
        <Link className="btn secondary" href={showFinished ? "/groups" : "/groups?status=finished"} style={{ marginLeft: "auto" }}>
          {showFinished ? "Текущие" : "Завершённые"}
        </Link>
      </div>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Группа</th><th>Филиал</th><th>Расписание</th><th>Старт</th><th>Учеников</th><th>Химия</th><th>Биология</th><th>Куратор</th><th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>
                  <Link href={`/groups/${g.id}`}><b>{g.name}</b></Link>
                  {g.students.length > 0 && <> <span className="pill red">риск: {g.students.length}</span></>}
                </td>
                <td>{g.branch.name}{g.room ? `, ${g.room.name}` : ""}</td>
                <td>{DAYS_LABEL[g.days]}, {SLOT_LABEL[g.slot]}</td>
                <td>{fmtDate(g.startDate)}</td>
                <td>{g._count.students}{g.branch.isOnline ? "" : "/22"}</td>
                <td>{g.chemTeacher?.name ?? <span className="pill red">нет</span>}</td>
                <td>{g.bioTeacher?.name ?? <span className="pill red">нет</span>}</td>
                <td>{g.curator?.name ?? <span className="pill red">нет</span>}</td>
                <td><span className={`pill ${STATUS[g.status][1]}`}>{STATUS[g.status][0]}</span></td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={9} className="muted">Групп нет. Набор открывается в «Расписании».</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
