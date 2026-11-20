import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

async function fonts() {
  const dir = path.join(process.cwd(), "assets/fonts");
  const load = (f: string) => readFile(path.join(dir, f));
  return [
    { name: "Unbounded", data: await load("unbounded-cyrillic-700-normal.woff"), weight: 700 as const },
    { name: "Unbounded", data: await load("unbounded-latin-700-normal.woff"), weight: 700 as const },
    { name: "Onest", data: await load("onest-cyrillic-500-normal.woff"), weight: 500 as const },
    { name: "Onest", data: await load("onest-latin-500-normal.woff"), weight: 500 as const },
  ];
}

/** Картинка-превью для ссылок в Telegram, WhatsApp и т. п. */
export async function ogImage({
  site,
  title,
  label,
  color = "#5b3df5",
  mark = "?",
}: {
  site: string;
  title: string;
  label?: string;
  color?: string;
  /** Крупный знак на карточке справа: буква предмета или «?» */
  mark?: string;
}) {
  const size = title.length > 60 ? 54 : title.length > 34 ? 64 : 80;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f3f5fc",
          fontFamily: "Onest",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -60,
            top: 120,
            width: 340,
            height: 420,
            borderRadius: 40,
            background: "#ffd447",
            transform: "rotate(10deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -20,
            top: 90,
            width: 340,
            height: 420,
            borderRadius: 40,
            background: color,
            transform: "rotate(-4deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontFamily: "Unbounded",
            fontSize: 220,
          }}
        >
          {mark}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            width: 900,
            height: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "#ff4f7b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "rotate(-8deg)",
              }}
            >
              <svg viewBox="0 0 24 24" width="30" height="30">
                <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#fff" />
              </svg>
            </div>
            <div style={{ fontFamily: "Unbounded", fontSize: 30, color: "#1b1838" }}>{site}</div>
          </div>
          <div
            style={{
              fontFamily: "Unbounded",
              fontSize: size,
              lineHeight: 1.08,
              color: "#1b1838",
              letterSpacing: -1.5,
              display: "flex",
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex" }}>
            {label ? (
              <div
                style={{
                  padding: "12px 26px",
                  borderRadius: 999,
                  background: color,
                  color: "#fff",
                  fontSize: 30,
                }}
              >
                {label}
              </div>
            ) : (
              <div style={{ fontSize: 30, color: "#4a4870" }}>Конспекты, темпланы и вопрос дня</div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
