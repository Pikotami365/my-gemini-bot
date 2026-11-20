import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/onest";
import Motion from "@/components/Motion";
import { getSite } from "@/lib/content";
import { authConfigured, getUser } from "@/lib/supabase";
import "./globals.css";

export function generateMetadata(): Metadata {
  const site = getSite();
  return {
    title: { default: site.title, template: `%s | ${site.title}` },
    description: site.tagline,
  };
}

// Все страницы зависят от того, вошёл ли человек, поэтому собираются на каждый запрос.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5fc" },
    { media: "(prefers-color-scheme: dark)", color: "#12112a" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = getSite();
  const user = await getUser();
  return (
    <html lang="ru">
      <body>
        <a href="#main" className="skip">
          Перейти к содержимому
        </a>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path
                    d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="brand-name">{site.title}</span>
            </Link>
            <nav className="nav" aria-label="Разделы">
              <Link href="/#subjects">Предметы</Link>
              <Link href="/schedule">Расписание</Link>
              <Link href="/about">Обо мне</Link>
            </nav>
            <div className="nav-user">
              {user ? (
                <Link href="/account" className="avatar" title={user.email} aria-label="Профиль">
                  {user.name.slice(0, 1).toUpperCase()}
                </Link>
              ) : authConfigured ? (
                <>
                  <Link href="/login" className="nav-login">
                    Войти
                  </Link>
                  <Link href="/register" className="btn btn-primary btn-sm">
                    Регистрация
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <Motion />
        <main id="main" className="wrap main">
          {children}
        </main>
        <footer className="footer">
          <div className="wrap footer-inner">
            <p>{site.disclaimer}</p>
            <p className="footer-links">
              <Link href="/privacy">Данные и приватность</Link>
              <span>
                © {site.author}, {new Date().getFullYear()}
              </span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
