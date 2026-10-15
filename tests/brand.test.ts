import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Brand, Logomark } from "../components/brand";
import manifest from "../app/manifest";

describe("brand", () => {
  it("pairs a decorative logomark with the xprtn wordmark", () => {
    const html = renderToStaticMarkup(createElement(Brand, {}));
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.replace(/<[^>]+>/g, "")).toBe("xprtn");
  });
  it("draws the logomark at any size", () => {
    expect(renderToStaticMarkup(createElement(Logomark, { size: 48 }))).toContain('width="48"');
  });
  it("describes the installable app", () => {
    const m = manifest();
    expect(m.name).toBe("xprtn");
    expect(m.display).toBe("standalone");
    expect(m.icons?.length).toBeGreaterThan(0);
  });
});
