import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assertLocalQa, withDb } from "./support";

/** Do not start/seed/reset an arbitrary database as a side effect of running tests. */
export default async function globalSetup() {
  assertLocalQa();
  await withDb(async db => {
    const result = await db.query("SELECT count(*)::int AS n FROM courses WHERE status='PUBLISHED'");
    if (!result.rows[0].n) throw new Error("Seed the dedicated QA database before browser qualification.");
  });
  const out = process.env.QA_OUT ?? "test-results";
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/environment.json`, JSON.stringify({
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    runtimeBuildCommit: process.env.QA_BUILD_COMMIT ?? null,
    runtimeBuildDirty: process.env.QA_BUILD_DIRTY === "1",
    baseURL: process.env.QA_BASE ?? "https://localhost:3443",
    time: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    liveProvidersQualified: false,
    realIosQualified: false,
  }, null, 2));
}
