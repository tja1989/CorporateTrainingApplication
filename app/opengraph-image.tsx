import { ImageResponse } from "next/og";

export const alt = "xprtn — workplace learning, practice, and support";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link-preview card: monogram, wordmark and one plain line on deep ink. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "96px", background: "#0F2347", color: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <svg width="112" height="112" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#1B3566" />
            <path d="M10.5 10.5 21.5 21.5" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M21.5 10.5 10.5 21.5" stroke="#4C8DFF" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: "-0.04em" }}>xprtn</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, color: "#C9D6EE" }}>Workplace learning, practice, and support</div>
      </div>
    ),
    size,
  );
}
