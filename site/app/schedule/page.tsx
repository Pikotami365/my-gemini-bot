import Link from "next/link";
import { formatDate, getSchedule, getSubjects } from "@/lib/content";
import TodayHighlight from "@/components/TodayHighlight";

export const metadata = { title: "Расписание" };

export default function SchedulePage() {
  const schedule = getSchedule();
  const names = new Map(getSubjects().map((s) => [s.slug, s.name]));

  return (
    <>
      <h1>Расписание</h1>
      {schedule.demo && (
        <div className="banner">Это пример. Здесь будет реальное расписание потока.</div>
      )}
      <p className="lead">
        {schedule.comment}
        {schedule.updated && (
          <span className="muted small"> Обновлено {formatDate(schedule.updated)}.</span>
        )}
      </p>
      <div className="week">
        {schedule.days.map((d) => (
          <section key={d.day} className="day" data-day={d.day}>
            <h3>{d.day}</h3>
            {d.items.length === 0 ? (
              <p className="muted small">Нет занятий</p>
            ) : (
              d.items.map((it, i) => {
                const title = it.subject ? names.get(it.subject) ?? it.title : it.title;
                return (
                  <div key={i} className="slot">
                    <div className="slot-time">
                      {it.time}
                      {it.weeks && ` · ${it.weeks}`}
                    </div>
                    <div className="slot-title">
                      {it.subject && names.has(it.subject) ? (
                        <Link href={`/subjects/${it.subject}`}>{title}</Link>
                      ) : (
                        title
                      )}
                    </div>
                    <div className="muted small">
                      {[it.type, it.room].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        ))}
      </div>
      <TodayHighlight />
    </>
  );
}
