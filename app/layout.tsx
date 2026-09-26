import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { MotionProvider } from "@/components/motion-config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "welearn", template: "%s · welearn" },
  description: "Workplace learning, practice, and support",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FFFFFF" }, { media: "(prefers-color-scheme: dark)", color: "#17253A" }],
};

const RTL_LANGS = new Set(["ar", "ur"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("ll_theme")?.value === "dark" ? "dark" : "";
  const lang = store.get("ll_lang")?.value ?? "en";
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  return (
    <html lang={lang} dir={dir} className={theme}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
