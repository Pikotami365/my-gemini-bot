import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "./auth";
import { seesOnlyOwnGroups } from "./permissions";

export function groupWhere(user: CurrentUser): Prisma.GroupWhereInput {
  if (!seesOnlyOwnGroups(user)) return {};
  if (user.department === "CURATOR") return { curatorId: user.id };
  return { OR: [{ chemTeacherId: user.id }, { bioTeacherId: user.id }] };
}

export function taskWhere(user: CurrentUser): Prisma.TaskWhereInput {
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: user.id }];
  if (user.department !== "CURATOR" && user.department !== "TEACHER") or.push({ department: user.department });
  if (user.isFull) or.push({ department: "LEADERSHIP" });
  return { OR: or };
}
