import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { positionInMonth } from "@/lib/schedule";
import { attendanceRatio, barClass, efficiency, homeworkRatio, lateJoinsFor, pctOf, ratio, retention, type Ratio } from "@/lib/metrics";

const add = (a: Ratio, b: Ratio): Ratio => ratio(a.num + b.num, a.den + b.den);

function P({ r }: { r: Ratio | number | null }) {
  const p = typeof r === "number" || r === null ? r : pctOf(r);
  if (p == null) return <span className="muted">—</span>;
  return (
    <div style={{ minWidth: 90 }}>
      <b>{p}%</b>{typeof r === "object" && r && <span className="small muted"> {r.num}/{r.den}</span>}
      <div className={`bar ${barClass(p)}`}><span style={{ width: `${p}%` }} /></div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = sp.period === "7" || sp.period === "28" ? Number(sp.period) : null;
  const now = new Date();
  const from = period ? new Date(now.getTime() - period * 86400_000) : new Date(0);
  const full = user.isFull || can(user, "reports.view");
  const showTeachers = user.isFull || (full && user.department !== "CURATOR") || user.department === "TEACHER";
  const showCurators = user.isFull || (full && user.department !== "TEACHER") || user.department === "CURATOR";
  const showBusiness = user.isFull;

  const groups = await db.group.findMany({
    where: { status: { in: ["ACTIVE", "FINISHED"] } },
    include: {
      branch: true,
      lessons: { orderBy: { index: "asc" } },
      students: true,
      touches: true,
      surveys: true,
      curator: true,
      chemTeacher: true,
      bioTeacher: true,
    },
  });
  const allLessons = groups.flatMap((g) => g.lessons);
  const periodLessons = allLessons.filter((l) => l.startsAt >= from && l.startsAt <= now);
  const ids = periodLessons.map((l) => l.id);
  const [att, hw, movements, staff] = await Promise.all([
    db.attendance.findMany({ where: { lessonId: { in: ids } } }),
    db.homework.findMany({ where: { lessonId: { in: ids } } }),
    db.movement.findMany({}),
    db.user.findMany({ where: { department: { in: ["TEACHER", "CURATOR"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  const curMonth = (g: (typeof groups)[number]) => g.lessons.filter((l) => l.startsAt <= now).pop()?.courseMonth ?? 1;
  const ret = (g: (typeof groups)[number], kind: "business" | "curator" | "chem" | "bio", month = curMonth(g)) =>
    retention({
      startCount: g.startCount ?? g.students.length,
      lateJoins: lateJoinsFor(g.students, g.lessons[0]?.startsAt),
      movements,
      groupId: g.id,
      month,
      kind,
    });
  const avg = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };

  const teachers = staff.filter((u) => u.department === "TEACHER" && (full || u.id === user.id));
  const curators = staff.filter((u) => u.department === "CURATOR" && (full || u.id === user.id));

  return (
    <>
      <h1>Отчёты и эффективность</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="small muted">Период для посещаемости, тестов и ДЗ:</span>
        <Link className={`btn small ${period === 7 ? "" : "secondary"}`} href="/reports?period=7">неделя</Link>
        <Link className={`btn small ${period === 28 ? "" : "secondary"}`} href="/reports?period=28">месяц (28 дней)</Link>
        <Link className={`btn small ${!period ? "" : "secondary"}`} href="/reports">весь курс</Link>
        <span className="small muted">Удержание — на текущий месяц курса каждой группы.</span>
      </div>

      {showTeachers && teachers.length > 0 && (
        <div className="card table-wrap">
          <h2 style={{ marginTop: 0 }}>Преподаватели</h2>
          <p className="small muted">Оцениваются по посещаемости своих учеников, эффективности (быстрые тесты, офлайн), удержанию и опроснику.</p>
          <table>
            <thead><tr><th>Преподаватель</th><th>Группы</th><th>Посещаемость</th><th>Эффективность</th><th>Удержание</th><th>Опросник</th></tr></thead>
            <tbody>
              {teachers.map((t) => {
                const mine = periodLessons.filter((l) => l.teacherId === t.id);
                const gs = groups.filter((g) => g.chemTeacherId === t.id || g.bioTeacherId === t.id);
                let r = ratio();
                const surveys: (number | null)[] = [];
                for (const g of gs) {
                  if (g.chemTeacherId === t.id) { r = add(r, ret(g, "chem")); surveys.push(...g.surveys.map((s) => s.chemPct)); }
                  if (g.bioTeacherId === t.id) { r = add(r, ret(g, "bio")); surveys.push(...g.surveys.map((s) => s.bioPct)); }
                }
                return (
                  <tr key={t.id}>
                    <td><b>{t.name}</b></td>
                    <td className="small">{gs.map((g) => <div key={g.id}><Link href={`/groups/${g.id}`}>{g.name}</Link> {g.chemTeacherId === t.id ? "(хим.)" : "(биол.)"}</div>)}</td>
                    <td><P r={attendanceRatio(att, mine)} /></td>
                    <td><P r={efficiency(att, mine)} /></td>
                    <td><P r={r} /></td>
                    <td><P r={avg(surveys)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCurators && curators.length > 0 && (
        <div className="card table-wrap">
          <h2 style={{ marginTop: 0 }}>Кураторы</h2>
          <p className="small muted">Оцениваются по выполнению ДЗ (опыты и тесты), удержанию и касаниям (цель 100%).</p>
          <table>
            <thead><tr><th>Куратор</th><th>Группы</th><th>ДЗ опыты</th><th>ДЗ тесты</th><th>ДЗ всего</th><th>Удержание</th><th>Касания</th><th>Опросник</th></tr></thead>
            <tbody>
              {curators.map((c) => {
                const gs = groups.filter((g) => g.curatorId === c.id);
                const ls = periodLessons.filter((l) => gs.some((g) => g.id === l.groupId));
                let r = ratio();
                let touch = ratio();
                for (const g of gs) {
                  r = add(r, ret(g, "curator"));
                  for (const l of g.lessons.filter((x) => x.endsAt <= now && x.startsAt >= from)) {
                    const pos = positionInMonth(l.index);
                    if (pos !== 6 && pos !== 12) continue;
                    const n = pos === 6 ? 1 : 2;
                    const need = g.students.filter((s) => s.status === "ACTIVE" && !s.parentsNotInvolved && s.joinedAt <= l.endsAt);
                    const done = need.filter((s) => g.touches.some((t) => t.studentId === s.id && t.courseMonth === l.courseMonth && t.number === n));
                    touch = add(touch, ratio(done.length, need.length));
                  }
                }
                return (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td className="small">{gs.map((g) => <div key={g.id}><Link href={`/groups/${g.id}`}>{g.name}</Link></div>)}</td>
                    <td><P r={homeworkRatio(hw, ls, undefined, "EXPERIMENT")} /></td>
                    <td><P r={homeworkRatio(hw, ls, undefined, "TEST")} /></td>
                    <td><P r={homeworkRatio(hw, ls)} /></td>
                    <td><P r={r} /></td>
                    <td><P r={touch} /></td>
                    <td><P r={avg(gs.flatMap((g) => g.surveys.map((s) => s.curatorPct)))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showBusiness && (
        <div className="card table-wrap">
          <h2 style={{ marginTop: 0 }}>Бизнес: удержание по группам</h2>
          <p className="small muted">База — ученики на старте курса; пришедшие позже считаются со следующего месяца. Переводы внутри UMED — не отток для бизнеса.</p>
          <table>
            <thead>
              <tr><th>Группа</th><th>Филиал</th><th>Куратор</th><th>Старт</th><th>Пришло</th><th>Ушло</th><th>Сейчас</th>{[1, 2, 3, 4, 5].map((m) => <th key={m}>{m} мес</th>)}</tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const late = lateJoinsFor(g.students, g.lessons[0]?.startsAt);
                const cm = curMonth(g);
                const left = movements.filter((m) => m.fromGroupId === g.id && (m.type === "LEAVE" || m.type === "TRANSFER")).length;
                return (
                  <tr key={g.id}>
                    <td><Link href={`/groups/${g.id}`}>{g.name}</Link></td>
                    <td>{g.branch.name}</td>
                    <td>{g.curator?.name ?? "—"}</td>
                    <td>{g.startCount ?? "—"}</td>
                    <td>{late.size}</td>
                    <td>{left}</td>
                    <td>{g.students.filter((s) => s.status === "ACTIVE").length}</td>
                    {[1, 2, 3, 4, 5].map((m) => (
                      <td key={m}>{m <= Math.min(cm, g.months) ? <P r={ret(g, "business", m)} /> : ""}</td>
                    ))}
                  </tr>
                );
              })}
              {groups.length === 0 && <tr><td colSpan={12} className="muted">Активных групп пока нет.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
