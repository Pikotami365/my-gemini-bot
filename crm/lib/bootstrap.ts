import { db } from "./db";

/** Филиалы и по 4 кабинета (идемпотентно). */
export async function ensureBranches() {
  const list = [
    { name: "Медерова", isOnline: false, order: 1 },
    { name: "Байтик Баатыра", isOnline: false, order: 2 },
    { name: "Онлайн", isOnline: true, order: 3 },
  ];
  for (const b of list) {
    const br = await db.branch.upsert({ where: { name: b.name }, create: b, update: {} });
    if (!b.isOnline) {
      for (let i = 1; i <= 4; i++) {
        await db.room.upsert({
          where: { branchId_name: { branchId: br.id, name: `Кабинет ${i}` } },
          create: { branchId: br.id, name: `Кабинет ${i}`, order: i, capacity: 22 },
          update: {},
        });
      }
    }
  }
}
