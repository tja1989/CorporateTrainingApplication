import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif" });

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
    <html lang={lang} dir={dir} className={`${inter.variable} ${sourceSerif.variable} ${theme}`}>
      <body>{children}</body>
    </html>
  );
}
