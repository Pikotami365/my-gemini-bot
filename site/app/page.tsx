import Link from "next/link";
import FlashCard from "@/components/FlashCard";
import Ticker from "@/components/Ticker";
import {
  formatDate,
  getAllNotes,
  getQuestionDeck,
  getSite,
  getTickerItems,
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
  // Гостю отдаём только вопрос дня и без ответа; вошедшему — всю колоду с ответами.
  const deck = getQuestionDeck(new Date(), user ? 30 : 1).map((c) => ({
    q: c.q,
    answerHtml: user ? renderMarkdown(c.a) : null,
    subjectName: c.subjectName,
    color: c.color,
    href: c.href,
    noteTitle: c.noteTitle,
  }));

  return (
    <>
      {welcome && user && (
        <div className="notice notice-ok">Готово, {user.name}! Теперь вам открыты все конспекты.</div>
      )}

      <section className="hero">
        <div className="hero-bg" aria-hidden>
          <span className="cell cell-1" />
          <span className="cell cell-2" />
          <span className="cell cell-3" />

        </div>
        <div className="hero-text">
          <h1 className="hero-title">
            <span className="line">
              <span>Медицина</span>
            </span>
            <span className="line">
              <span>по полочкам</span>
            </span>
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
        {deck.length > 0 && <FlashCard cards={deck} locked={!user} />}
      </section>

      <div className="ecg-strip" aria-hidden>
        <svg className="ecg" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path
            className="ecg-base"
            pathLength={1}
            d="M0 70 H330 l14 -8 l12 8 H400 l10 14 l18 -78 l20 98 l14 -34 H560 l16 -12 l18 12 H860 l14 -8 l12 8 H900 l10 14 l18 -78 l20 98 l14 -34 H1060 l16 -12 l18 12 H1200"
          />
          <path
            className="ecg-pulse"
            pathLength={1}
            d="M0 70 H330 l14 -8 l12 8 H400 l10 14 l18 -78 l20 98 l14 -34 H560 l16 -12 l18 12 H860 l14 -8 l12 8 H900 l10 14 l18 -78 l20 98 l14 -34 H1060 l16 -12 l18 12 H1200"
          />
        </svg>
      </div>
      <Ticker items={getTickerItems()} />

      <section id="subjects" className="section">
        <h2 className="section-title">Предметы</h2>
        {subjects.length === 0 ? (
          <p className="muted">Предметы появятся, когда будет темплан.</p>
        ) : (
          <div className="tabs">
            {subjects.map((s, i) => {
              const total = s.plan.length;
              const done = s.plan.filter((p) => p.note).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <Link
                  key={s.slug}
                  href={`/subjects/${s.slug}`}
                  className="tab"
                  data-reveal
                  style={{ ["--subj" as string]: s.color, ["--i" as string]: i, ["--w" as string]: `${pct}%` }}
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
                      <span />
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
