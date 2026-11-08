import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Возвращает пользователя на ту же страницу с текстом ошибки (?error=...). */
export async function fail(msg: string): Promise<never> {
  const h = await headers();
  const ref = h.get("referer");
  let target = "/";
  if (ref) {
    try {
      const u = new URL(ref);
      u.searchParams.set("error", msg);
      target = u.pathname + u.search;
    } catch {}
  } else {
    target = `/?error=${encodeURIComponent(msg)}`;
  }
  redirect(target);
}
