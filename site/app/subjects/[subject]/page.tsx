import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getNoteSlugs, getSubject, getSubjects } from "@/lib/content";

export function generateStaticParams() {
  return getSubjects().map((s) => ({ subject: s.slug }));
}

type Props = { params: Promise<{ subject: string }> };

export async function generateMetadata({ params }: Props) {
  const s = getSubject((await params).subject);
  return { title: s?.name ?? "Предмет" };
}

export default async function SubjectPage({ params }: Props) {
  const s = getSubject((await params).subject);
  if (!s) notFound();
  const notes = new Set(getNoteSlugs(s.slug));
  const groups = [
    { label: "Основная литература", list: s.books.filter((b) => b.kind === "основная") },
    { label: "Дополнительная", list: s.books.filter((b) => b.kind !== "основная") },
  ].filter((g) => g.list.length > 0);
  const done = s.plan.filter((p) => p.note && notes.has(p.note)).length;

  return (
    <div style={{ ["--subj" as string]: s.color }}>
      <nav className="crumbs" aria-label="Путь">
        <Link href="/#subjects">Предметы</Link>
        <span aria-hidden>/</span>
        <span>{s.name}</span>
      </nav>
      {s.demo && (
        <div className="notice">
          Это пример, чтобы показать формат. Его заменят реальные данные, когда появится темплан.
        </div>
      )}

      <header className="subject-head">
        <span className="tab-letter tab-letter-lg" aria-hidden>
          {s.name.slice(0, 1)}
        </span>
        <div>
          <h1 className="subject-title">{s.name}</h1>
          <div className="meta">
            {s.semester && <span>{s.semester}</span>}
            {s.department && <span>{s.department}</span>}
            {s.control && <span>Итог: {s.control}</span>}
            <span>
              Конспекты: {done} из {s.plan.length}
            </span>
          </div>
          {s.teachers && s.teachers.length > 0 && (
            <p className="muted">Преподаватели: {s.teachers.join(", ")}</p>
          )}
        </div>
      </header>

      <section className="section">
        <h2 className="section-title">Темплан</h2>
        {s.plan.length === 0 ? (
          <p className="muted">Темплан ещё не добавлен.</p>
        ) : (
          <ol className="plan" data-reveal>
            {s.plan.map((p, i) => {
              const has = p.note && notes.has(p.note);
              const inner = (
                <>
                  <span className="plan-n">{p.n}</span>
                  <span className="plan-main">
                    <span className="plan-topic">{p.topic}</span>
                    <span className="plan-meta">
                      {[formatDate(p.date), p.type].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className={has ? "plan-status plan-ready" : "plan-status"}>
                    {has ? "Конспект" : "Скоро"}
                  </span>
                </>
              );
              return (
                <li key={p.n} style={{ ["--i" as string]: i }}>
                  {has ? (
                    <Link href={`/subjects/${s.slug}/${p.note}`} className="plan-row plan-link">
                      {inner}
                    </Link>
                  ) : (
                    <div className="plan-row">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Что читать</h2>
        {groups.length === 0 ? (
          <p className="muted">Список литературы ещё не добавлен.</p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="books">
              <h3 className="books-label">{g.label}</h3>
              <ul className="rows">
                {g.list.map((b) => (
                  <li key={b.title} className="row row-static">
                    <span className="row-main">
                      <span className="row-title">{b.title}</span>
                      {b.authors && <span className="row-sub">{b.authors}</span>}
                      {b.comment && <span className="row-note">{b.comment}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
