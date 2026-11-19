"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext, supabaseServer } from "@/lib/supabase";

export type FormState = { error?: string; done?: boolean; message?: string } | null;

const NOT_READY = "Регистрация ещё не подключена. Загляните чуть позже.";

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Неверный email или пароль.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Этот email уже зарегистрирован. Войдите или восстановите пароль.";
  if (m.includes("email not confirmed")) return "Подтвердите email: ссылка в письме, которое мы прислали.";
  if (m.includes("password") && (m.includes("at least") || m.includes("characters")))
    return "Пароль слишком короткий: нужно минимум 8 символов.";
  if (m.includes("same") && m.includes("password")) return "Новый пароль должен отличаться от старого.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  if (m.includes("invalid") && m.includes("email")) return "Проверьте email: похоже, в нём опечатка.";
  return "Не получилось. Попробуйте ещё раз через минуту.";
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  if (!sb) return { error: NOT_READY };
  const { error } = await sb.auth.signInWithPassword({
    email: field(fd, "email"),
    password: String(fd.get("password") ?? ""),
  });
  if (error) return { error: translate(error.message) };
  redirect(safeNext(field(fd, "next")));
}

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  if (!sb) return { error: NOT_READY };
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Пароль слишком короткий: нужно минимум 8 символов." };
  const { data, error } = await sb.auth.signUp({
    email: field(fd, "email"),
    password,
    options: {
      data: { name: field(fd, "name") },
      emailRedirectTo: `${await origin()}/auth/confirm`,
    },
  });
  if (error) return { error: translate(error.message) };
  // Supabase не сообщает, что email занят, если включено подтверждение почты: identities будет пустым.
  if (data.user && data.user.identities?.length === 0)
    return { error: "Этот email уже зарегистрирован. Войдите или восстановите пароль." };
  if (data.session) redirect(safeNext(field(fd, "next")));
  return {
    done: true,
    message: "Почти готово! Мы отправили письмо со ссылкой. Откройте его, чтобы подтвердить email.",
  };
}

export async function requestReset(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  if (!sb) return { error: NOT_READY };
  const { error } = await sb.auth.resetPasswordForEmail(field(fd, "email"), {
    redirectTo: `${await origin()}/auth/confirm?next=/reset`,
  });
  if (error && /rate limit|too many/i.test(error.message)) return { error: translate(error.message) };
  // Не раскрываем, зарегистрирован ли email.
  return {
    done: true,
    message: "Если такой email зарегистрирован, письмо со ссылкой уже в пути. Проверьте и папку «Спам».",
  };
}

export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  if (!sb) return { error: NOT_READY };
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Пароль слишком короткий: нужно минимум 8 символов." };
  if (password !== String(fd.get("password2") ?? "")) return { error: "Пароли не совпадают." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: translate(error.message) };
  redirect("/account?updated=1");
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb?.auth.signOut();
  redirect("/");
}
