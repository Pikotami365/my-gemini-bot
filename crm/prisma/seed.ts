import { PrismaClient } from "@prisma/client";
import { hashCode } from "../lib/crypto";

const db = new PrismaClient();

async function main() {
  // Филиалы и кабинеты
  const branches = [
    { name: "Медерова", isOnline: false, order: 1 },
    { name: "Байтик Баатыра", isOnline: false, order: 2 },
    { name: "Онлайн", isOnline: true, order: 3 },
  ];
  for (const b of branches) {
    const br = await db.branch.upsert({ where: { name: b.name }, create: b, update: { order: b.order } });
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

  // Первый пользователь с полным доступом
  const login = (process.env.ADMIN_LOGIN ?? "").toLowerCase();
  const code = process.env.ADMIN_CODE ?? "";
  if (login && code) {
    const exists = await db.user.findUnique({ where: { login } });
    if (!exists) {
      await db.user.create({
        data: { name: process.env.ADMIN_NAME ?? "Руководитель", login, codeHash: hashCode(code), department: "LEADERSHIP", isFull: true, isHead: true },
      });
      console.log(`Создан пользователь с полным доступом: ${login}`);
    } else {
      console.log(`Пользователь ${login} уже существует`);
    }
  } else {
    console.log("ADMIN_LOGIN/ADMIN_CODE не заданы — первый пользователь не создан");
  }
}

main().finally(() => db.$disconnect());
