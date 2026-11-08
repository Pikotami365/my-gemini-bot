import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "UMED CRM", description: "Учёт групп, учеников и задач UMED" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
