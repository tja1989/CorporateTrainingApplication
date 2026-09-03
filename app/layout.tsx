import type { Metadata, Viewport } from "next";
import { Inter_Tight, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { MotionProvider } from "@/components/motion-config";
import "./globals.css";

// Two families (spec §10.3 v2): Manrope carries the UI and reading text;
// Inter Tight — the tight neutral grotesk of the reference dashboard — draws
// the page titles, greetings and the big tile numbers.
const manrope = Manrope({ subsets: ["latin"], weight: "variable", variable: "--font-manrope", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: "variable", variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  title: { default: "LuLu Learn", template: "%s · LuLu Learn" },
  description: "AI-native corporate training platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The chrome is charcoal in both themes, so the browser bar matches the header.
  themeColor: "#1a1a1a",
};

const RTL_LANGS = new Set(["ar", "ur"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("ll_theme")?.value === "dark" ? "dark" : "";
  const lang = store.get("ll_lang")?.value ?? "en";
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  return (
    <html lang={lang} dir={dir} className={`${manrope.variable} ${interTight.variable} ${theme}`}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
