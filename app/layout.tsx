import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import { MotionProvider } from "@/components/motion-config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "xprtn", template: "%s · xprtn" },
  description: "Workplace learning, practice, and support",
  applicationName: "xprtn",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FFFFFF" }, { media: "(prefers-color-scheme: dark)", color: "#17253A" }],
};

const RTL_LANGS = new Set(["ar", "ur"]);

/** Headings and the wordmark only; bundled at build so nothing loads from a font host. */
const instrument = localFont({
  src: "../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  variable: "--font-instrument",
  weight: "400 700",
  display: "swap",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("ll_theme")?.value === "dark" ? "dark" : "";
  const lang = store.get("ll_lang")?.value ?? "en";
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  return (
    <html lang={lang} dir={dir} className={[theme, instrument.variable].filter(Boolean).join(" ")}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
