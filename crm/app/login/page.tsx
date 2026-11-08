import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { login } from "@/app/actions";
import StateForm from "@/components/StateForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  if ((await db.user.count()) === 0) redirect("/setup");
  return (
    <div className="wrap" style={{ maxWidth: 380, paddingTop: 80 }}>
      <div className="card">
        <h1>UMED CRM</h1>
        <p className="muted">Вход по логину и коду. Код выдаёт руководитель.</p>
        <StateForm action={login}>
          <div className="field">
            <label>Логин</label>
            <input name="login" autoComplete="username" required autoCapitalize="none" />
          </div>
          <div className="field">
            <label>Код</label>
            <input name="code" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit">Войти</button>
        </StateForm>
      </div>
    </div>
  );
}
