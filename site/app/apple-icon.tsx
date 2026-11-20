import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#ff4f7b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 24 24" width="110" height="110">
          <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
