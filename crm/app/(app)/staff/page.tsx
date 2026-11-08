import { redirect } from "next/navigation";
import type { Department } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEPARTMENT_LABEL, GRANTABLE, PERMISSIONS, type Permission } from "@/lib/permissions";
import { createStaff, resetCode, updateStaff } from "@/app/actions";
import StateForm from "@/components/StateForm";

const DEPTS: Department[] = ["LEADERSHIP", "ADMIN", "CURATOR", "MANAGER", "TEACHER", "FINANCE"];

export default async function StaffPage() {
  const user = await requireUser();
  if (!user.isFull && !user.isHead) redirect("/");
  const depts = user.isFull ? DEPTS : [user.department];
  const users = await db.user.findMany({ where: { department: { in: depts } }, orderBy: [{ department: "asc" }, { name: "asc" }] });
  const allGrantable = Array.from(new Set(DEPTS.flatMap((d) => GRANTABLE[d]))) as Permission[];

  return (
    <>
      <h1>Сотрудники и доступы</h1>
      <p className="muted small">
        Руководитель отдела добавляет сотрудников своего отдела и включает им разделы. Полный доступ видит всех и назначает руководителей.
        Код показывается один раз — передайте его сотруднику лично.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Добавить сотрудника</h2>
        <StateForm action={createStaff}>
          <div className="grid three">
            <div className="field"><label>Имя</label><input name="name" required /></div>
            <div className="field"><label>Логин (латиница)</label><input name="login" required autoCapitalize="none" placeholder="aisha.k" /></div>
            <div className="field"><label>Код (пусто — сгенерировать)</label><input name="code" /></div>
            <div className="field">
              <label>Отдел</label>
              <select name="department" defaultValue={depts[depts.length > 1 ? 1 : 0]}>
                {depts.map((d) => <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>)}
              </select>
            </div>
            {user.isFull && (
              <div className="field">
                <label><input type="checkbox" name="isHead" /> Руководитель отдела</label>
                <label><input type="checkbox" name="isFull" /> Полный доступ</label>
              </div>
            )}
          </div>
          <button type="submit">Создать</button>
        </StateForm>
      </div>

      {depts.map((d) => {
        const list = users.filter((u) => u.department === d);
        if (!list.length) return null;
        const grantable = user.isFull ? allGrantable : GRANTABLE[d];
        return (
          <div className="card" key={d}>
            <h2 style={{ marginTop: 0 }}>{DEPARTMENT_LABEL[d]} ({list.length})</h2>
            {list.map((u) => (
              <div className="item" key={u.id}>
                <form action={updateStaff}>
                  <input type="hidden" name="userId" value={u.id} />
                  <div className="row">
                    <input name="name" defaultValue={u.name} style={{ width: 180 }} />
                    <span className="muted small">логин: {u.login}</span>
                    {u.isFull && <span className="pill blue">полный доступ</span>}
                    {u.isHead && <span className="pill green">руководитель</span>}
                    {!u.active && <span className="pill red">отключён</span>}
                  </div>
                  {!u.isFull && grantable.length > 0 && (
                    <div className="row small" style={{ marginTop: 6 }}>
                      {grantable.map((p) => (
                        <label key={p} style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "inherit", fontSize: 12, marginRight: 8 }}>
                          <input type="checkbox" name="perm" value={p} defaultChecked={u.permissions.includes(p)} />
                          {PERMISSIONS[p]}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="row small" style={{ marginTop: 6 }}>
                    <label style={{ display: "inline-flex", gap: 4, color: "inherit", fontSize: 12 }}>
                      <input type="checkbox" name="active" defaultChecked={u.active} /> активен
                    </label>
                    {user.isFull && (
                      <>
                        <label style={{ display: "inline-flex", gap: 4, color: "inherit", fontSize: 12 }}>
                          <input type="checkbox" name="isHead" defaultChecked={u.isHead} /> руководитель отдела
                        </label>
                        <label style={{ display: "inline-flex", gap: 4, color: "inherit", fontSize: 12 }}>
                          <input type="checkbox" name="isFull" defaultChecked={u.isFull} disabled={u.id === user.id} /> полный доступ
                        </label>
                        {u.id === user.id && <input type="hidden" name="isFull" value="on" />}
                      </>
                    )}
                    <button className="small secondary" type="submit">Сохранить</button>
                  </div>
                </form>
                {u.id !== user.id && (
                  <StateForm action={resetCode}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button className="small secondary" type="submit" style={{ marginTop: 6 }}>Выдать новый код</button>
                  </StateForm>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
