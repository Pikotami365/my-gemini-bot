import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { requestReset } from "@/app/auth/actions";

export const metadata = { title: "Восстановить пароль" };

export default function ForgotPage() {
  return (
    <AuthShell
      title="Забыли пароль?"
      lead="Укажите email, и мы пришлём ссылку, чтобы задать новый пароль."
      footer={<Link href="/login">Вернуться ко входу</Link>}
    >
      <AuthForm
        action={requestReset}
        submit="Прислать ссылку"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      />
    </AuthShell>
  );
}
