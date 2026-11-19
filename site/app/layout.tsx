import type { Metadata } from "next";
import Link from "next/link";
import { getSite } from "@/lib/content";
import "./globals.css";

export function generateMetadata(): Metadata {
  const site = getSite();
  return {
    title: { default: site.title, template: `%s · ${site.title}` },
    description: site.tagline,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const site = getSite();
  return (
    <html lang="ru">
      <body>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                ✚
              </span>
              {site.title}
            </Link>
            <nav className="nav">
              <Link href="/">Предметы</Link>
              <Link href="/schedule">Расписание</Link>
              <Link href="/about">Обо мне</Link>
            </nav>
          </div>
        </header>
        <main className="wrap main">{children}</main>
        <footer className="footer">
          <div className="wrap">
            <p>{site.disclaimer}</p>
            <p className="muted">
              © {site.author}, {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
