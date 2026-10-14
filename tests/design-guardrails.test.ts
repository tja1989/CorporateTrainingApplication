import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { DUR, EASE_OUT, EASE_IN_OUT } from "../lib/motion";

const ROOT = resolve(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
function walk(dir: string): string[] { return readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; }); }
const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];

describe("xprtn design contract", () => {
  it("declares the approved light palette and restrained control/card geometry", () => {
    for (const [token, value] of Object.entries({ background: "#F7F9FC", surface: "#FFFFFF", foreground: "#172B4D", "muted-foreground": "#526477", primary: "#1559C9" })) expect(css).toContain(`--${token}: ${value}`);
    expect(css).toContain("--radius-control: 8px");
    expect(css).toContain("--radius-input: 8px");
    expect(css).toContain("--radius-card: 12px");
    expect(css).not.toMatch(/--shadow-glow|\.rail\[data-collapsed\]|--font-manrope|--font-inter-tight/);
  });
  it("declares every numeric spacing step used by product source", () => {
    const steps = new Set([...css.matchAll(/--spacing-(\d+):/g)].map(m => m[1]));
    const pattern = /(?<![\w-])(?:m|p|mx|my|ms|me|mt|mb|px|py|ps|pe|pt|pb|gap|gap-x|gap-y|space-x|space-y|top|bottom|start|end)-(\d+)(?![\w/-])/g;
    const missing = files.flatMap(file => [...readFileSync(file, "utf8").matchAll(pattern)].filter(m => !steps.has(m[1])).map(m => `${file}: ${m[0]}`));
    expect(missing).toEqual([]);
  });
  it("keeps focus, reflow, safe-area clearance and reduced-motion support", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(".lesson-shell-main");
  });
  it("uses feedback-only motion with the same JS and CSS tokens", () => {
    for (const name of ["fast", "base", "slow"] as const) expect(Number(css.match(new RegExp(`--duration-${name}:\\s*(\\d+)ms`))?.[1]) / 1000).toBe(DUR[name]);
    for (const [name, curve] of [["out", EASE_OUT], ["in-out", EASE_IN_OUT]] as const) expect(css.match(new RegExp(`--ease-${name}:\\s*cubic-bezier\\(([^)]+)\\)`))?.[1].split(",").map(Number)).toEqual(curve);
    expect(css).not.toMatch(/@keyframes ll-(enter|slide-up|pop|float|wave)/);
  });
  it("has no stale product brand in shipped source", () => {
    expect(files.filter(file => /LuLu Learn|welearn/i.test(readFileSync(file, "utf8")))).toEqual([]);
  });
});

function tokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1], m[2]]));
}
function luminance(hex: string): number {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
const textPairs = [
  ["foreground", "background"], ["foreground", "surface"], ["foreground", "surface-2"],
  ["muted-foreground", "background"], ["muted-foreground", "surface"], ["muted-foreground", "surface-2"],
  ["primary-fg", "primary"], ["primary-fg", "primary-hover"], ["accent-fg", "accent"],
  ["link", "surface"], ["link", "background"], ["link", "surface-2"],
  ["foreground", "accent-tint"], ["foreground", "success-tint"], ["foreground", "warning-tint"], ["foreground", "destructive-tint"],
  ["muted-foreground", "warning-tint"], ["success-fg", "surface"], ["warning-fg", "surface"], ["destructive-text", "surface"], ["ai-fg", "surface"], ["success-fg", "success-tint"], ["warning-fg", "warning-tint"],
  ["destructive-text", "destructive-tint"], ["destructive-fg", "destructive"],
  ["ai-fg", "ai-tint"], ["foreground", "ai-tint"], ["muted-foreground", "ai-tint"],
] as const;
describe("semantic text contrast is WCAG AA in both themes", () => {
  for (const theme of [":root", ".dark"]) it(`${theme}: every supported text pair is at least 4.5:1`, () => {
    const colors = tokens(theme);
    const missing = textPairs.flat().filter(token => !colors[token]);
    expect([...new Set(missing)]).toEqual([]);
    const boundary = (luminance(colors.surface) + .05) / (luminance(colors["control-border"]) + .05);
    expect(Math.max(boundary, 1 / boundary)).toBeGreaterThanOrEqual(3);
    const failures = textPairs.flatMap(([fg, bg]) => {
      const [hi, lo] = [luminance(colors[fg]), luminance(colors[bg])].sort((a, b) => b - a);
      const ratio = (hi + .05) / (lo + .05);
      return ratio < 4.5 ? [`${fg} on ${bg}: ${ratio.toFixed(2)}`] : [];
    });
    expect(failures).toEqual([]);
  });
});
