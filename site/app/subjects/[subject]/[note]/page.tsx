import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatDate,
  getNote,
  getNoteSlugs,
  getSite,
  getSubject,
  getSubjects,
  renderMarkdown,
} from "@/lib/content";
import { authConfigured, getUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ subject: string; note: string }> };

export async function generateMetadata({ params }: Props) {
  const { subject, note } = await params;
  const n = getNote(subject, note);
  return { title: n?.title ?? "Конспект", description: n?.summary?.[0] };
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export default async function NotePage({ params }: Props) {
  const { subject, note } = await params;
  const s = getSubject(subject);
  if (!s || !getNoteSlugs(subject).includes(note)) notFound();
  const n = getNote(subject, note)!;
  const site = getSite();
  const user = await getUser();
  const unlocked = Boolean(user);
  const here = `/subjects/${s.slug}/${n.slug}`;

  const ordered = s.plan.filter((p) => p.note && getNoteSlugs(s.slug).includes(p.note));
  const idx = ordered.findIndex((p) => p.note === n.slug);
  const prev = idx > 0 ? ordered[idx - 1] : undefined;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : undefined;
  const planItem = s.plan.find((p) => p.note === n.slug);
  const showSummary = unlocked || site.public_summary !== false;

  return (
    <article className="note" style={{ ["--subj" as string]: s.color }}>
      <nav className="crumbs" aria-label="Путь">
        <Link href="/#subjects">Предметы</Link>
        <span aria-hidden>/</span>
        <Link href={`/subjects/${s.slug}`}>{s.name}</Link>
      </nav>
      {s.demo && <div className="notice">Пример конспекта, чтобы показать формат.</div>}

      <header className="note-head">
        {planItem && <p className="note-num">Тема {planItem.n}</p>}
        <h1 className="note-title">{n.title}</h1>
        <div className="meta">
          {n.status === "проверено" ? (
            <span className="badge badge-ok">Проверено</span>
          ) : (
            <span className="badge badge-draft">Черновик</span>
          )}
          {n.updated && <span>Обновлено {formatDate(n.updated)}</span>}
        </div>
      </header>

      {showSummary && n.summary.length > 0 && (
        <section className="summary">
          <h2 className="summary-title">Кратко</h2>
          <ul>
            {n.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {unlocked ? (
        <>
          <div className="prose" dangerouslySetInnerHTML={{ __html: n.html }} />

          {n.terms.length > 0 && (
            <section className="block">
              <h2>Ключевые термины</h2>
              <dl className="terms">
                {n.terms.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{t.def}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {n.questions.length > 0 && (
            <section className="block">
              <h2>Проверь себя</h2>
              <p className="muted">Сначала ответь сам, потом открывай.</p>
              <div className="quiz">
                {n.questions.map((q, i) => (
                  <details key={i}>
                    <summary>
                      <span className="quiz-n">{i + 1}</span>
                      <span>{q.q}</span>
                    </summary>
                    <div className="answer" dangerouslySetInnerHTML={{ __html: renderMarkdown(q.a) }} />
                  </details>
                ))}
              </div>
            </section>
          )}

          {n.sources.length > 0 && (
            <section className="block">
              <h2>Источники</h2>
              <ol className="sources">
                {n.sources.map((src) => (
                  <li key={src}>{src}</li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : (
        <section className="locked">
          <svg className="locked-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden>
            <path
              d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"
              fill="currentColor"
            />
          </svg>
          <h2 className="locked-title">Полный конспект открыт для участников</h2>
          <p className="muted">Регистрация бесплатная. Внутри:</p>
          <ul className="locked-list">
            {n.outline.map((h) => (
              <li key={h}>{h}</li>
            ))}
            {n.terms.length > 0 && <li>{plural(n.terms.length, "ключевой термин", "ключевых термина", "ключевых терминов")}</li>}
            {n.questions.length > 0 && (
              <li>{plural(n.questions.length, "вопрос", "вопроса", "вопросов")} для самопроверки</li>
            )}
          </ul>
          {authConfigured ? (
            <div className="hero-actions">
              <Link href={`/register?next=${encodeURIComponent(here)}`} className="btn btn-primary">
                Создать аккаунт
              </Link>
              <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-ghost">
                Войти
              </Link>
            </div>
          ) : (
            <p className="muted">Регистрация скоро откроется.</p>
          )}
        </section>
      )}

      <nav className="pager" aria-label="Соседние темы">
        {prev ? (
          <Link className="pager-link" href={`/subjects/${s.slug}/${prev.note}`}>
            <span className="pager-dir">Предыдущая тема</span>
            {prev.topic}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link className="pager-link pager-next" href={`/subjects/${s.slug}/${next.note}`}>
            <span className="pager-dir">Следующая тема</span>
            {next.topic}
          </Link>
        )}
      </nav>
    </article>
  );
}
