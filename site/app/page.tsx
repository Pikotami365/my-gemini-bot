import Link from "next/link";
import FlashCard from "@/components/FlashCard";
import {
  formatDate,
  getAllNotes,
  getDailyQuestion,
  getSite,
  getSubjects,
  renderMarkdown,
} from "@/lib/content";
import { authConfigured, getUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ welcome?: string }> };

export default async function Home({ searchParams }: Props) {
  const site = getSite();
  const user = await getUser();
  const { welcome } = await searchParams;
  const subjects = getSubjects();
  const recent = getAllNotes().slice(0, 5);
  const daily = getDailyQuestion();

  return (
    <>
      {welcome && user && (
        <div className="notice notice-ok">Готово, {user.name}! Теперь вам открыты все конспекты.</div>
      )}

      <section className="hero">
        <div className="hero-text">
          <h1 className="hero-title">
            Медицина
            <br />
            по полочкам
          </h1>
          <p className="hero-lead">{site.tagline}</p>
          <div className="hero-actions">
            {user ? (
              <Link href="#subjects" className="btn btn-primary">
                Открыть предметы
              </Link>
            ) : (
              <>
                {authConfigured && (
                  <Link href="/register" className="btn btn-primary">
                    Создать аккаунт бесплатно
                  </Link>
                )}
                <Link href="#subjects" className="btn btn-ghost">
                  Посмотреть предметы
                </Link>
              </>
            )}
          </div>
        </div>
        {daily && (
          <FlashCard
            question={daily.q}
            answerHtml={user ? renderMarkdown(daily.a) : null}
            subjectName={daily.subjectName}
            color={daily.color}
            href={daily.href}
            noteTitle={daily.noteTitle}
          />
        )}
      </section>

      <section id="subjects" className="section">
        <h2 className="section-title">Предметы</h2>
        {subjects.length === 0 ? (
          <p className="muted">Предметы появятся, когда будет темплан.</p>
        ) : (
          <div className="tabs">
            {subjects.map((s) => {
              const total = s.plan.length;
              const done = s.plan.filter((p) => p.note).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <Link
                  key={s.slug}
                  href={`/subjects/${s.slug}`}
                  className="tab"
                  style={{ ["--subj" as string]: s.color }}
                >
                  <span className="tab-letter" aria-hidden>
                    {s.name.slice(0, 1)}
                  </span>
                  <span className="tab-body">
                    <span className="tab-name">{s.name}</span>
                    <span className="tab-meta">
                      {done} из {total} тем с конспектом
                      {s.control ? `, итог: ${s.control}` : ""}
                    </span>
                    <span className="bar" aria-hidden>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="section">
          <h2 className="section-title">Новые конспекты</h2>
          <ul className="rows">
            {recent.map((n) => (
              <li key={`${n.subject}/${n.slug}`}>
                <Link href={`/subjects/${n.subject}/${n.slug}`} className="row">
                  <span className="row-main">
                    <span className="row-title">{n.title}</span>
                    <span className="row-sub">{n.subjectName}</span>
                  </span>
                  <span className="row-date">{formatDate(n.updated)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
