import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getNotes, getSubject, getSubjects } from "@/lib/content";

export function generateStaticParams() {
  return getSubjects().map((s) => ({ subject: s.slug }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ subject: string }> };

export async function generateMetadata({ params }: Props) {
  const s = getSubject((await params).subject);
  return { title: s?.name ?? "Предмет" };
}

export default async function SubjectPage({ params }: Props) {
  const s = getSubject((await params).subject);
  if (!s) notFound();
  const notes = new Map(getNotes(s.slug).map((n) => [n.slug, n]));
  const main = s.books.filter((b) => b.kind === "основная");
  const extra = s.books.filter((b) => b.kind !== "основная");

  return (
    <>
      <div className="crumbs">
        <Link href="/">Предметы</Link> / {s.name}
      </div>
      {s.demo && (
        <div className="banner">
          Это пример, чтобы показать формат. Его заменят реальные данные, когда появится темплан.
        </div>
      )}
      <h1>{s.name}</h1>
      <div className="meta">
        {s.semester && <span>{s.semester}</span>}
        {s.department && <span>{s.department}</span>}
        {s.control && <span>Итог: {s.control}</span>}
      </div>
      {s.teachers && s.teachers.length > 0 && (
        <p className="muted small">Преподаватели: {s.teachers.join(", ")}</p>
      )}

      <h2>Темплан</h2>
      {s.plan.length === 0 ? (
        <p className="muted">Темплан ещё не добавлен.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Тема</th>
                <th>Конспект</th>
              </tr>
            </thead>
            <tbody>
              {s.plan.map((p) => {
                const note = p.note ? notes.get(p.note) : undefined;
                return (
                  <tr key={p.n}>
                    <td className="num">{p.n}</td>
                    <td className="date">{formatDate(p.date) || "—"}</td>
                    <td>
                      {p.topic}
                      {p.type && (
                        <>
                          {" "}
                          <span className="badge badge-type">{p.type}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {note ? (
                        <Link href={`/subjects/${s.slug}/${note.slug}`}>Открыть →</Link>
                      ) : (
                        <span className="muted small">скоро</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>Что читать</h2>
      {s.books.length === 0 ? (
        <p className="muted">Список литературы ещё не добавлен.</p>
      ) : (
        <>
          {[
            ["Основная литература", main],
            ["Дополнительная", extra],
          ].map(([label, list]) =>
            (list as typeof s.books).length ? (
              <div key={label as string}>
                <h3>{label as string}</h3>
                <ul className="list">
                  {(list as typeof s.books).map((b) => (
                    <li key={b.title}>
                      <span>
                        <strong>{b.title}</strong>
                        {b.authors && <span className="muted"> · {b.authors}</span>}
                        {b.comment && (
                          <>
                            <br />
                            <span className="muted small">{b.comment}</span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </>
      )}
    </>
  );
}
