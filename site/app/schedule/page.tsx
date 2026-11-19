import Link from "next/link";
import { formatDate, getSchedule, getSubjects } from "@/lib/content";
import TodayHighlight from "@/components/TodayHighlight";

const FALLBACK = "#6e6c8f";

export const metadata = { title: "Расписание" };

export default function SchedulePage() {
  const schedule = getSchedule();
  const subjects = new Map(getSubjects().map((s) => [s.slug, s]));

  return (
    <>
      {schedule.demo && (
        <div className="notice">Это пример. Здесь будет реальное расписание потока.</div>
      )}
      <h1 className="page-title">Расписание</h1>
      <p className="page-lead">
        {schedule.comment}
        {schedule.updated && (
          <span className="muted"> Обновлено {formatDate(schedule.updated)}.</span>
        )}
      </p>
      <div className="week">
        {schedule.days.map((d) => (
          <section key={d.day} className="day" data-day={d.day}>
            <h3>{d.day}</h3>
            {d.items.length === 0 ? (
              <p className="muted">Нет занятий</p>
            ) : (
              d.items.map((it, i) => {
                const subj = it.subject ? subjects.get(it.subject) : undefined;
                const title = subj?.name ?? it.title;
                return (
                  <div key={i} className="slot" style={{ ["--subj" as string]: subj?.color ?? FALLBACK }}>
                    <div className="slot-time">
                      {it.time}
                      {it.weeks && `, ${it.weeks}`}
                    </div>
                    <div className="slot-title">
                      {subj ? (
                        <Link href={`/subjects/${it.subject}`}>{title}</Link>
                      ) : (
                        title
                      )}
                    </div>
                    <div className="muted">
                      {[it.type, it.room].filter(Boolean).join(", ")}
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
