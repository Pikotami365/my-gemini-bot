import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { groupWhere } from "@/lib/access";
import { isoDate, todayLocal, addDays } from "@/lib/schedule";
import { FEEDBACK_ABOUT, FEEDBACK_CHANNEL, FEEDBACK_FROM } from "@/lib/feedback";
import { createFeedback } from "@/app/actions";

export default async function NewFeedback({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [students, staff] = await Promise.all([
    db.student.findMany({
      where: { status: "ACTIVE", group: groupWhere(user) },
      include: { group: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h1>Новый отзыв</h1>
      <form action={createFeedback}>
        <div className="grid two">
          <div className="field">
            <label>Дата</label>
            <input type="date" name="date" defaultValue={isoDate(todayLocal())} />
          </div>
          <div className="field">
            <label>Ученик</label>
            <select name="studentId" defaultValue={sp.student ?? ""}>
              <option value="">— не про конкретного ученика —</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.group.name})</option>)}
            </select>
            <label style={{ marginTop: 4 }}><input type="checkbox" name="anonymous" /> анонимно</label>
          </div>
          <div className="field">
            <label>От кого</label>
            <select name="fromType" required defaultValue="Ученик">
              {FEEDBACK_FROM.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Если от сотрудника — от какого</label>
            <select name="fromStaffId" defaultValue="">
              <option value="">—</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Канал</label>
            <select name="channel" defaultValue="Личное сообщение">
              {FEEDBACK_CHANNEL.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label>О чём / о ком отзыв</label>
            <select name="about" required>
              {FEEDBACK_ABOUT.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Какой сотрудник (если про сотрудника)</label>
            <select name="aboutStaffId" defaultValue="">
              <option value="">—</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Тон</label>
            <select name="tone" required defaultValue="POSITIVE">
              <option value="POSITIVE">Позитив</option>
              <option value="NEUTRAL">Нейтрально</option>
              <option value="NEGATIVE">Негатив</option>
            </select>
          </div>
          <div className="field">
            <label>Риск ухода (обязательно при негативе)</label>
            <select name="churnRisk" defaultValue="">
              <option value="">—</option>
              <option value="yes">Да, риск</option>
              <option value="no">Нет</option>
            </select>
          </div>
          <div className="field">
            <label>Срок проверки (для негатива)</label>
            <input type="date" name="checkDate" defaultValue={isoDate(addDays(todayLocal(), 3))} />
          </div>
        </div>
        <div className="field"><label>Отзыв дословно / как отреагировал</label><textarea name="text" required /></div>
        <div className="field"><label>Что сделано</label><textarea name="action" /></div>
        <div className="field"><label>Ссылка на скрин</label><input name="link" placeholder="https://…" /></div>
        <button type="submit">Сохранить отзыв</button>
      </form>
    </div>
  );
}
