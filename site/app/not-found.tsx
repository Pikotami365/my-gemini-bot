import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth">
      <div className="auth-card">
        <p className="nf-code" aria-hidden>
          404
        </p>
        <h1 className="auth-title">Такой страницы нет</h1>
        <p className="auth-lead">
          Возможно, тему переименовали или ссылка с опечаткой. Начните с предметов, там всё по темплану.
        </p>
        <div className="stack">
          <Link href="/#subjects" className="btn btn-primary btn-wide">
            К предметам
          </Link>
          <Link href="/schedule" className="btn btn-ghost btn-wide">
            Расписание
          </Link>
        </div>
      </div>
    </div>
  );
}
