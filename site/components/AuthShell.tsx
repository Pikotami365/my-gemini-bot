import { authConfigured } from "@/lib/supabase";

export default function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="auth-title">{title}</h1>
        {lead && <p className="auth-lead">{lead}</p>}
        {authConfigured ? (
          children
        ) : (
          <div className="notice">Регистрация ещё не подключена. Загляните чуть позже.</div>
        )}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </div>
  );
}
