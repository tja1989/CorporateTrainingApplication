import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { MotionProvider } from "@/components/motion-config";
import "./globals.css";

// One variable sans-serif for the whole product (spec §10.3 v1.2): Inter with
// its optical-size axis so display text and labels render with the right cuts.
const inter = Inter({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "LuLu Learn", template: "%s · LuLu Learn" },
  description: "AI-native corporate training platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#211f1c" },
  ],
};

const RTL_LANGS = new Set(["ar", "ur"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("ll_theme")?.value === "dark" ? "dark" : "";
  const lang = store.get("ll_lang")?.value ?? "en";
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  return (
    <html lang={lang} dir={dir} className={`${inter.variable} ${theme}`}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
