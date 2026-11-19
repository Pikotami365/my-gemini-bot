import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Регистрация работает, только когда в Vercel заданы ключи Supabase. */
export const authConfigured = Boolean(URL && KEY);

export async function supabaseServer() {
  if (!URL || !KEY) return null;
  const store = await cookies();
  return createServerClient(URL, KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Вызов из серверного компонента: куки обновит middleware.
        }
      },
    },
  });
}

export type AppUser = { email: string; name: string };

export async function getUser(): Promise<AppUser | null> {
  // Только для локального просмотра: показать сайт так, как его видит вошедший человек.
  if (process.env.LOCAL_PREVIEW_UNLOCK === "1" && !process.env.VERCEL) {
    return { email: "preview@local", name: "Превью" };
  }
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const name = String(data.user.user_metadata?.name ?? "").trim() || email.split("@")[0];
  return { email, name };
}

/** Разрешаем переход только на страницы этого сайта. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
