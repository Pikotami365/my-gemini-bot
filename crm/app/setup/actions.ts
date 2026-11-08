"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashCode, signSession } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/auth";
import { ensureBranches } from "@/lib/bootstrap";

export async function firstSetup(_: unknown, f: FormData) {
  if ((await db.user.count()) > 0) return { error: "Система уже настроена. Войдите по логину и коду." };
  const name = String(f.get("name") ?? "").trim();
  const login = String(f.get("login") ?? "").trim().toLowerCase();
  const code = String(f.get("code") ?? "").trim();
  if (!name || !/^[a-z0-9._-]{3,32}$/.test(login)) return { error: "Укажите имя и логин латиницей (3–32 символа)" };
  if (code.length < 4) return { error: "Код — минимум 4 символа" };
  await ensureBranches();
  const u = await db.user.create({
    data: { name, login, codeHash: hashCode(code), department: "LEADERSHIP", isFull: true, isHead: true },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(u.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400,
  });
  redirect("/");
}
