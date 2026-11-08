import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncIfStale } from "@/lib/sync";
import { can, DEPARTMENT_LABEL } from "@/lib/permissions";
import { taskWhere } from "@/lib/access";
import { logout } from "@/app/actions";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await syncIfStale();
  const now = new Date();
  const [unacked, overdue] = await Promise.all([
    db.notificationRecipient.count({ where: { userId: user.id, ackAt: null } }),
    db.task.count({ where: { ...taskWhere(user), status: "OPEN", dueAt: { lt: now } } }),
  ]);
  const showStaff = user.isFull || user.isHead;
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/" className="brand">UMED</Link>
          <Link href="/">
            Главная{unacked + overdue > 0 && <span className="badge-count">{unacked + overdue}</span>}
          </Link>
          <Link href="/schedule">Расписание</Link>
          <Link href="/groups">Группы</Link>
          <Link href="/feedback">Отзывы</Link>
          <Link href="/movements">Движения</Link>
          {can(user, "reports.view") ? (
            <Link href="/reports">Отчёты</Link>
          ) : (
            (user.department === "TEACHER" || user.department === "CURATOR") && <Link href="/reports">Мои показатели</Link>
          )}
          {showStaff && <Link href="/staff">Сотрудники</Link>}
          <span className="me">
            {user.name} · {user.isFull ? "полный доступ" : DEPARTMENT_LABEL[user.department]}
            {user.isHead && !user.isFull ? " (руководитель)" : ""}
            <Link href="/me">Мой код</Link>
            <form action={logout}>
              <button className="small secondary" type="submit">Выйти</button>
            </form>
          </span>
        </div>
      </header>
      <main className="wrap">
        <Suspense>
          <Flash />
        </Suspense>
        {children}
      </main>
    </>
  );
}
