import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import StateForm from "@/components/StateForm";
import { firstSetup } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="card">
        <h1>Первый запуск UMED CRM</h1>
        <p className="muted">Создайте свой вход с полным доступом. Филиалы и кабинеты создадутся автоматически.</p>
        <StateForm action={firstSetup}>
          <div className="field"><label>Ваше имя</label><input name="name" required /></div>
          <div className="field"><label>Логин (латиница)</label><input name="login" required autoCapitalize="none" placeholder="zhanetta" /></div>
          <div className="field"><label>Код (минимум 4 символа)</label><input name="code" type="password" required minLength={4} /></div>
          <button type="submit">Создать и войти</button>
        </StateForm>
      </div>
    </div>
  );
}
