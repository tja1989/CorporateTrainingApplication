import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { DUR, EASE_IN_OUT, EASE_OUT } from "../lib/motion";

/**
 * Design-language guardrails (spec §10 v2.0). The Tailwind theme is a closed
 * vocabulary, so an off-system class silently emits no CSS — this test turns
 * that silence into a named failure, and checks the colour tokens for WCAG AA.
 */

const ROOT = resolve(__dirname, "..");
const ALLOWED_STEPS = new Set(["0", "1", "2", "3", "4", "6", "8", "12"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const SPACING = /(?<![\w-])-?(?:m|p|mx|my|ms|me|mt|mb|ml|mr|px|py|ps|pe|pt|pb|pl|pr|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|bottom|start|end|left|right|scroll-mt|scroll-mb)-(\d+(?:\.\d+)?)(?![\w/-])/g;

/* Typed glyph icons (arrows, technical, geometric, misc symbols, dingbats,
   emoji) rendered at a different weight on every platform — icons are drawn
   by <Icon> now. Typographic punctuation (· — … ‹ ›) is outside these ranges. */
const GLYPH = /[←-⇿⌀-⏿■-➿]|\p{Extended_Pictographic}/u;

const RULES: Array<[RegExp, string]> = [
  [/(?<![\w-])font-(?:thin|extralight|light|bold|extrabold|black)(?![\w-])/, "font weight outside 400/500 (600 is the display face only)"],
  [/(?<![\w-])text-[4-9]xl(?![\w-])/, "font size outside the seven-step scale"],
  [/(?<![\w-])text-\[\d+(?:px|rem|em)\]/, "arbitrary font size"],
  [/backdrop-blur/, "frosted glass"],
  [/(?<![\w-])shadow-(?:2xs|xs|sm|md|lg|xl|2xl|\[)/, "non-token shadow (only shadow-card|overlay|glow)"],
  [/(?<![\w-])rounded(?:-[tbse]{1,2})?(?:-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|\[[^\]]*\]))?(?![\w-])/, "non-token radius (use rounded-control|input|card|full)"],
  [/font-ai-voice|font-serif|Source_Serif/, "serif AI voice was replaced by <AiSurface>"],
  [/(?<![\w-])(?:duration|ease|delay)-(?:\d|\[|\()/, "non-token motion utility"],
  [/(?<![\w-])transition-all(?![\w-])/, "transition-all (name the property)"],
  [/(?<![\w-])animate-(?:spin|ping|pulse|bounce)(?![\w-])/, "default keyframes"],
  [/overflow-y-(?:auto|scroll)|max-h-\[?\d/, "internal vertical scroll region (bento rule)"],
  [/window\.(?:confirm|alert|prompt)\(/, "native dialog — use <Dialog>"],
  [/fontWeight=\{?["']?[7-9]00/, "SVG weight outside 400/500/600"],
  [GLYPH, "typed glyph icon — draw it with <Icon>"],
];

describe("design guardrails — source", () => {
  const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];

  it("uses only the seven-step spacing scale and token classes", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(SPACING)) {
          if (!ALLOWED_STEPS.has(m[1])) violations.push(`${rel}:${i + 1}: ${m[0]} — off-scale spacing (allowed 0/1/2/3/4/6/8/12)`);
        }
        for (const [re, reason] of RULES) {
          const m = line.match(re);
          if (m) violations.push(`${rel}:${i + 1}: ${m[0]} — ${reason}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});

describe("design guardrails — globals.css", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

  it("declares exactly the seven spacing steps", () => {
    const steps = [...css.matchAll(/--spacing-(\d+):/g)].map((m) => m[1]).sort((a, b) => Number(a) - Number(b));
    expect(steps).toEqual(["0", "1", "2", "3", "4", "6", "8", "12"]);
  });

  it("never reaches for heavy weights or frosted glass", () => {
    expect(css).not.toMatch(/font-weight:\s*[7-9]00/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).toMatch(/--font-weight-\*: initial/);
    expect(css).toMatch(/--font-weight-semibold: 600/);
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--radius-control: 8px/);
    expect(css).toMatch(/--radius-input: 12px/);
    expect(css).toMatch(/--radius-card: 20px/);
  });

  it("keeps CSS motion tokens in parity with lib/motion.ts", () => {
    const ms = (name: string) => Number(css.match(new RegExp(`--duration-${name}:\\s*(\\d+)ms`))![1]) / 1000;
    expect(ms("fast")).toBe(DUR.fast);
    expect(ms("base")).toBe(DUR.base);
    expect(ms("slow")).toBe(DUR.slow);
    const bezier = (name: string) => css.match(new RegExp(`--ease-${name}:\\s*cubic-bezier\\(([^)]+)\\)`))![1].split(",").map((n) => Number(n.trim()));
    expect(bezier("out")).toEqual(EASE_OUT);
    expect(bezier("in-out")).toEqual(EASE_IN_OUT);
  });
});

/* ---------------- WCAG contrast on the OKLCH tokens ---------------- */

type Oklch = { L: number; C: number; h: number };

function parseTokens(css: string, selector: string): Record<string, Oklch> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end);
  const out: Record<string, Oklch> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) {
    out[m[1]] = { L: Number(m[2]), C: Number(m[3]), h: Number(m[4]) };
  }
  return out;
}

function luminance({ L, C, h }: Oklch): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const R = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const G = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const B = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "surface-2"],
  ["foreground", "ai-tint"],
  ["foreground", "success-tint"],
  ["foreground", "warning-tint"],
  ["foreground", "destructive-tint"],
  ["foreground", "accent-tint"],
  ["muted-foreground", "background"],
  ["muted-foreground", "surface"],
  ["muted-foreground", "surface-2"],
  ["primary-fg", "primary"],
  ["accent-fg", "accent"],
  ["destructive-fg", "destructive"],
  ["success-fg", "success-tint"],
  ["success-fg", "surface"],
  ["warning-fg", "warning-tint"],
  ["warning-fg", "surface"],
  ["destructive-text", "destructive-tint"],
  ["destructive-text", "surface"],
  ["ai-fg", "ai-tint"],
  ["ai-fg", "surface"],
  ["link", "background"],
  ["link", "surface"],
  ["link", "surface-2"],
  ["primary", "background"],
  /* the charcoal chrome */
  ["rail-fg", "rail"],
  ["rail-fg", "rail-hover"],
  ["rail-muted", "rail"],
  ["accent", "rail"],
  ["accent", "rail-hover"],
];

describe("design guardrails — WCAG AA contrast (≥ 4.5:1) in both themes", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  for (const theme of [":root", ".dark"]) {
    const tokens = parseTokens(css, theme);
    it(`${theme} text pairs`, () => {
      const missing = TEXT_PAIRS.flat().filter((name) => !tokens[name]);
      expect([...new Set(missing)]).toEqual([]);
      const failures = TEXT_PAIRS.filter(([fg, bg]) => contrast(tokens[fg], tokens[bg]) < 4.5).map(
        ([fg, bg]) => `${fg} on ${bg}: ${contrast(tokens[fg], tokens[bg]).toFixed(2)}`,
      );
      expect(failures).toEqual([]);
    });
  }
});
