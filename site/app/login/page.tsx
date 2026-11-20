import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { signIn } from "@/app/auth/actions";
import { getUser, safeNext } from "@/lib/supabase";

export const metadata = { title: "Вход" };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await getUser()) redirect(target);
  const q = target !== "/" ? `?next=${encodeURIComponent(target)}` : "";
  return (
    <AuthShell
      title="С возвращением"
      lead="Войдите, чтобы читать конспекты целиком и проверять себя."
      footer={
        <>
          <Link href="/forgot">Забыли пароль?</Link>
          <span>
            Нет аккаунта? <Link href={`/register${q}`}>Зарегистрироваться</Link>
          </span>
        </>
      }
    >
      {error === "link" && (
        <div className="notice notice-warn">
          Ссылка из письма устарела или уже использована. Войдите или запросите новую.
        </div>
      )}
      <AuthForm
        action={signIn}
        submit="Войти"
        hidden={{ next: target }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Пароль", type: "password", autoComplete: "current-password" },
        ]}
      />
    </AuthShell>
  );
}
