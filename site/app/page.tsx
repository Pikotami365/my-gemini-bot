import Link from "next/link";
import { formatDate, getAllNotes, getSite, getSubjects } from "@/lib/content";

export default function Home() {
  const site = getSite();
  const subjects = getSubjects();
  const recent = getAllNotes().slice(0, 6);

  return (
    <>
      <h1>{site.title}</h1>
      <p className="lead">{site.tagline}</p>

      <h2>Предметы</h2>
      {subjects.length === 0 ? (
        <p className="muted">Предметы появятся, когда будет темплан.</p>
      ) : (
        <div className="grid">
          {subjects.map((s) => {
            const total = s.plan.length;
            const done = s.plan.filter((p) => p.note).length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Link key={s.slug} href={`/subjects/${s.slug}`} className="card">
                <h3>{s.name}</h3>
                <p className="muted small">
                  {[s.semester, s.control].filter(Boolean).join(" · ") || " "}
                </p>
                <div className="progress" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="muted small">
                  Конспекты: {done} из {total} тем{s.demo ? " · пример" : ""}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2>Новые конспекты</h2>
          <ul className="list">
            {recent.map((n) => (
              <li key={`${n.subject}/${n.slug}`}>
                <span>
                  <Link href={`/subjects/${n.subject}/${n.slug}`}>{n.title}</Link>
                  <span className="muted small"> · {n.subjectName}</span>
                </span>
                <span className="muted small">{formatDate(n.updated)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
