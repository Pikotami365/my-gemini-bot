import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext, supabaseServer } from "@/lib/supabase";

/**
 * Сюда ведут ссылки из писем: подтверждение email и сброс пароля.
 * Поддерживает оба формата: token_hash (работает в любом браузере) и code (стандартный шаблон).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), type === "recovery" ? "/reset" : "/?welcome=1");

  const sb = await supabaseServer();
  if (sb) {
    if (tokenHash && type) {
      const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) redirect(next);
    } else if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (!error) redirect(next);
    }
  }
  redirect("/login?error=link");
}
