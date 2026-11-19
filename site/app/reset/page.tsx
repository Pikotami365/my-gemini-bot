import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { updatePassword } from "@/app/auth/actions";
import { getUser } from "@/lib/supabase";

export const metadata = { title: "Новый пароль" };

export default async function ResetPage() {
  const user = await getUser();
  return (
    <AuthShell
      title="Новый пароль"
      lead={user ? `Для ${user.email}` : undefined}
      footer={<Link href="/">На главную</Link>}
    >
      {user ? (
        <AuthForm
          action={updatePassword}
          submit="Сохранить пароль"
          fields={[
            {
              name: "password",
              label: "Новый пароль",
              type: "password",
              autoComplete: "new-password",
              minLength: 8,
              hint: "Минимум 8 символов",
            },
            { name: "password2", label: "Повторите пароль", type: "password", autoComplete: "new-password" },
          ]}
        />
      ) : (
        <div className="notice notice-warn">
          Ссылка для сброса устарела или уже использована. <Link href="/forgot">Запросите новую</Link>.
        </div>
      )}
    </AuthShell>
  );
}
