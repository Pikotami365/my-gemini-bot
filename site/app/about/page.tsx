import { getSite, renderMarkdown } from "@/lib/content";

export const metadata = { title: "Обо мне" };

export default function AboutPage() {
  const site = getSite();
  return (
    <article className="note">
      <h1>Обо мне</h1>
      <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(site.about) }} />
      {site.links && site.links.length > 0 && (
        <>
          <h2>Где меня найти</h2>
          <ul className="list">
            {site.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
