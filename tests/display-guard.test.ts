import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(__dirname, "..");
function walk(dir: string): string[] { return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "api" ? [] : walk(p)) : p.endsWith(".tsx") ? [p] : []; }); }
const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];
// Scan whole files so a chained call split across lines is still caught.
const hits = (re: RegExp) => files.flatMap(f => {
  const text = readFileSync(f, "utf8");
  return [...text.matchAll(new RegExp(re.source, "g"))].map(m => `${f.replace(ROOT, "")}:${text.slice(0, m.index).split("\n").length}`);
});

describe("display guard", () => {
  it("shows no raw ISO dates", () => expect(hits(/toISOString\(\)\s*\.slice\(/)).toEqual([]));
  it("shows no ad-hoc date formatting", () => expect(hits(/new Intl\.DateTimeFormat|toLocaleString\(|toLocaleDateString\(/)).toEqual([]));
  it("shows no raw lower- or upper-cased enum values", () => expect(hits(/\b(type|status|language|approvalState|ingestionStatus|feedbackMode|toState|toPublication)\.to(Lower|Upper)Case\(\)/)).toEqual([]));
  it("does not print the IANA zone to people", () => expect(hits(/Asia\/Dubai|\{DEFAULT_TZ\}|\(\$\{DEFAULT_TZ\}\)/)).toEqual([]));
});
