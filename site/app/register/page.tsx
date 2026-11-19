import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { signUp } from "@/app/auth/actions";
import { getUser, safeNext } from "@/lib/supabase";

export const metadata = { title: "Регистрация" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const target = safeNext((await searchParams).next);
  if (await getUser()) redirect(target);
  const q = target !== "/" ? `?next=${encodeURIComponent(target)}` : "";
  return (
    <AuthShell
      title="Создать аккаунт"
      lead="Бесплатно. Откроет полные конспекты, термины и вопросы для самопроверки."
      footer={
        <span>
          Уже есть аккаунт? <Link href={`/login${q}`}>Войти</Link>
        </span>
      }
    >
      <AuthForm
        action={signUp}
        submit="Создать аккаунт"
        hidden={{ next: target }}
        fields={[
          { name: "name", label: "Как вас зовут", autoComplete: "given-name", required: false },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Пароль",
            type: "password",
            autoComplete: "new-password",
            minLength: 8,
            hint: "Минимум 8 символов",
          },
        ]}
      />
    </AuthShell>
  );
}
