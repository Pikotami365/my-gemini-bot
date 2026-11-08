import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readSession } from "./crypto";
import { can, type Permission } from "./permissions";
import { fail } from "./errors";

export const SESSION_COOKIE = "umed_sid";

export async function getUser() {
  const store = await cookies();
  const id = readSession(store.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id } });
  if (!user || !user.active) return null;
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePerm(perm: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, perm)) return fail("Нет доступа к этому действию");
  return user;
}

export async function audit(userId: string | null, action: string, entity: string, entityId?: string, details = "") {
  await db.auditLog.create({ data: { userId, action, entity, entityId, details } });
}
