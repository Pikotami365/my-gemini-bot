import { requireUser } from "@/lib/auth";
import { changeOwnCode } from "@/app/actions";
import StateForm from "@/components/StateForm";

export default async function MePage() {
  const user = await requireUser();
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h1>Мой код входа</h1>
      <p className="muted">Логин: <b>{user.login}</b></p>
      <StateForm action={changeOwnCode}>
        <div className="field"><label>Текущий код</label><input type="password" name="oldCode" required /></div>
        <div className="field"><label>Новый код</label><input type="password" name="newCode" required minLength={4} /></div>
        <button type="submit">Сменить код</button>
      </StateForm>
    </div>
  );
}
