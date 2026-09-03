import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { MotionProvider } from "@/components/motion-config";
import "./globals.css";

// Two families (spec §10.3 v2): Manrope carries the UI and reading text;
// Bricolage Grotesque, with its optical-size and width axes, draws the page
// titles, greetings and the big tile numbers.
const manrope = Manrope({ subsets: ["latin"], weight: "variable", variable: "--font-manrope", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LuLu Learn", template: "%s · LuLu Learn" },
  description: "AI-native corporate training platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The chrome is charcoal in both themes, so the browser bar matches the header.
  themeColor: "#26241f",
};

const RTL_LANGS = new Set(["ar", "ur"]);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("ll_theme")?.value === "dark" ? "dark" : "";
  const lang = store.get("ll_lang")?.value ?? "en";
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";
  return (
    <html lang={lang} dir={dir} className={`${manrope.variable} ${bricolage.variable} ${theme}`}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
