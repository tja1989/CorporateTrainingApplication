import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

/**
 * Nav rail invariants (spec §10.7).
 *
 * The rail holds one width in the flow in every state, so nothing it does can
 * move the page beside it, and the panel never grows past the gutter the rail
 * already reserves, so nothing it does can cover that page either. Both
 * properties live entirely in CSS — a single extra `width` on `.rail` puts the
 * content back to jumping under the chevron, and one larger panel width puts it
 * back under the panel — so this guards them as CSS.
 */

const ROOT = resolve(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const nav = readFileSync(join(ROOT, "components/nav.tsx"), "utf8");

/** Rules whose selector mentions `.rail`-something, with their declarations. */
function rulesMatching(pattern: RegExp): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}\n]*)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }))
    .filter((r) => pattern.test(r.selector));
}

/** `width: …` declarations only — not the `width` inside a `transition` list. */
const widthsIn = (body: string) => [...body.matchAll(/(?:^|[;\s])width\s*:\s*([^;]+)/g)].map((m) => m[1].trim());

describe("nav rail — the arrow moves the rail, never the page", () => {
  it("declares the flow width once, on the rail itself, at the open width", () => {
    /* `.rail` but not `.rail-panel`/`-label`/`-toggle`/…, and not a rule that
       merely descends from the rail into one of those. */
    const onTheRail = rulesMatching(/(^|[\s,])\.rail(?![\w-])/).filter((r) => !/\s\.rail-/.test(r.selector));
    const settingWidth = onTheRail.filter((r) => widthsIn(r.body).length > 0);
    expect(settingWidth.map((r) => `${r.selector} { ${widthsIn(r.body).join("; ")} }`)).toEqual([
      ".rail { var(--width-rail) }",
    ]);
  });

  it("never widens the panel past the gutter the rail reserves", () => {
    const panelWidths = rulesMatching(/\.rail-panel(?![\w-])/).flatMap((r) => widthsIn(r.body));
    expect(panelWidths.length).toBeGreaterThan(0);
    /* Only the two rail tokens, and --width-rail is what `.rail` itself holds,
       so the widest the panel can ever be is exactly the reserved gutter. */
    expect([...new Set(panelWidths)].sort()).toEqual(["var(--width-rail)", "var(--width-rail-sm)"]);
  });

  it("reveals on keyboard focus only, so a mouse click cannot pin the rail open", () => {
    /* :focus-within stayed true after a click landed focus on the row it
       activated, which held the rail open with the pointer nowhere near it. */
    expect(css).toMatch(/\.rail\[data-collapsed\]:has\(:focus-visible\)\s+\.rail-panel/);
    expect(css).not.toMatch(/\.rail[^{\n]*:focus-within/);
  });

  it("keeps the hover reveal off a rail the chevron has just collapsed", () => {
    expect(css).toMatch(/\.rail\[data-collapsed\]:not\(\[data-hover-lock\]\):hover\s+\.rail-panel/);
    /* Wired on both rails — the workspace SideNav and the learner LearnerTabs. */
    expect(nav.match(/data-hover-lock=\{hoverLock \? "" : undefined\}/g)).toHaveLength(2);
    expect(nav.match(/onPointerLeave=\{releaseHoverLock\}/g)).toHaveLength(2);
  });

  it("still gates the hover reveal on pointer devices", () => {
    const hoverBlock = css.slice(css.indexOf("@media (hover: hover)"));
    expect(hoverBlock).toMatch(/\.rail\[data-collapsed\]:not\(\[data-hover-lock\]\):hover/);
  });

  it("keeps both rail width tokens", () => {
    expect(css).toMatch(/--width-rail:\s*14rem/);
    expect(css).toMatch(/--width-rail-sm:\s*4rem/);
  });
});
