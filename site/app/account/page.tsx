import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { getUser } from "@/lib/supabase";

export const metadata = { title: "Профиль" };

type Props = { searchParams: Promise<{ updated?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");
  const { updated } = await searchParams;
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="avatar avatar-lg" aria-hidden>
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <h1 className="auth-title">Привет, {user.name}!</h1>
        <p className="auth-lead">{user.email}</p>
        {updated && <div className="notice notice-ok">Пароль обновлён.</div>}
        <div className="stack">
          <Link href="/" className="btn btn-primary btn-wide">
            К предметам
          </Link>
          <Link href="/reset" className="btn btn-ghost btn-wide">
            Сменить пароль
          </Link>
          <form action={signOut}>
            <button className="btn btn-ghost btn-wide">Выйти</button>
          </form>
        </div>
      </div>
    </div>
  );
}
