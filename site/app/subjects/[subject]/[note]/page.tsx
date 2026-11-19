import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatDate,
  getNote,
  getNoteSlugs,
  getSubject,
  getSubjects,
  renderMarkdown,
} from "@/lib/content";

export function generateStaticParams() {
  return getSubjects().flatMap((s) =>
    getNoteSlugs(s.slug).map((note) => ({ subject: s.slug, note })),
  );
}

export const dynamicParams = false;

type Props = { params: Promise<{ subject: string; note: string }> };

export async function generateMetadata({ params }: Props) {
  const { subject, note } = await params;
  const n = getNote(subject, note);
  return { title: n?.title ?? "Конспект", description: n?.summary?.[0] };
}

export default async function NotePage({ params }: Props) {
  const { subject, note } = await params;
  const s = getSubject(subject);
  const n = getNote(subject, note);
  if (!s || !n) notFound();

  // Соседние темы по порядку темплана — только те, где конспект уже есть.
  const ordered = s.plan.filter((p) => p.note && getNote(s.slug, p.note));
  const idx = ordered.findIndex((p) => p.note === n.slug);
  const prev = idx > 0 ? ordered[idx - 1] : undefined;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : undefined;
  const planItem = s.plan.find((p) => p.note === n.slug);

  return (
    <article className="note">
      <div className="crumbs">
        <Link href="/">Предметы</Link> / <Link href={`/subjects/${s.slug}`}>{s.name}</Link>
      </div>
      {s.demo && <div className="banner">Пример конспекта, чтобы показать формат.</div>}

      <header className="note-head">
        <h1>{n.title}</h1>
        <div className="meta">
          {planItem && <span>Тема {planItem.n}</span>}
          {n.status === "проверено" ? (
            <span className="badge badge-ok">проверено</span>
          ) : (
            <span className="badge badge-draft">черновик</span>
          )}
          {n.updated && <span>обновлено {formatDate(n.updated)}</span>}
        </div>
      </header>

      {n.summary.length > 0 && (
        <section className="summary">
          <h2>Кратко</h2>
          <ul>
            {n.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="prose" dangerouslySetInnerHTML={{ __html: n.html }} />

      {n.terms.length > 0 && (
        <>
          <h2>Ключевые термины</h2>
          <dl className="terms">
            {n.terms.map((t) => (
              <div key={t.term}>
                <dt>{t.term}</dt>
                <dd>{t.def}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {n.questions.length > 0 && (
        <>
          <h2>Проверь себя</h2>
          <p className="muted small">Сначала ответь сам, потом открывай.</p>
          <div className="quiz">
            {n.questions.map((q, i) => (
              <details key={i}>
                <summary>{q.q}</summary>
                <div
                  className="answer"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(q.a) }}
                />
              </details>
            ))}
          </div>
        </>
      )}

      {n.sources.length > 0 && (
        <>
          <h2>Источники</h2>
          <ol className="sources">
            {n.sources.map((src) => (
              <li key={src}>{src}</li>
            ))}
          </ol>
        </>
      )}

      <nav className="pager">
        {prev ? (
          <Link className="card" href={`/subjects/${s.slug}/${prev.note}`}>
            <span className="muted small">← Предыдущая тема</span>
            <br />
            {prev.topic}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link className="card next" href={`/subjects/${s.slug}/${next.note}`}>
            <span className="muted small">Следующая тема →</span>
            <br />
            {next.topic}
          </Link>
        )}
      </nav>
    </article>
  );
}
