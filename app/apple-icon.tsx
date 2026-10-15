import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the monogram on a full-bleed ink tile (iOS rounds the corners). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0F2347" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M10.5 10.5 21.5 21.5" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M21.5 10.5 10.5 21.5" stroke="#4C8DFF" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
