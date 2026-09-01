import { loadEnv } from "../lib/env";
loadEnv();

import { spawn } from "child_process";
import { networkInterfaces } from "os";
import { writeInitStatus } from "../lib/init-status";
import { cleanDatabaseUrl, describeDatabaseUrl } from "../lib/db/url";

/**
 * Deployment entrypoint:
 * 1. Boot Next.js IMMEDIATELY (dual-stack `::` when the container has IPv6,
 *    else 0.0.0.0) so the public domain always responds — even while the
 *    database is still initializing or misconfigured.
 * 2. Run deploy-init (pgvector → schema → indexes → one-time seed) in the
 *    background, retrying forever and writing status that /api/health serves.
 */

const interfaces = Object.values(networkInterfaces()).flat();
const hasIpv6 = interfaces.some((iface) => iface && iface.family === "IPv6");
const host = hasIpv6 ? "::" : "0.0.0.0";
const port = process.env.PORT ?? "3000";
const target = describeDatabaseUrl(cleanDatabaseUrl(process.env.DATABASE_URL) ?? "(DATABASE_URL not set)");

console.log(`start-server: binding next start on host ${host} port ${port} (ipv6=${hasIpv6})`);
console.log(`start-server: database target → ${target}`);
writeInitStatus({ state: "starting", attempt: 0, target });

const child = spawn("npx", ["next", "start", "-H", host, "-p", port], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error("start-server: failed to launch next:", err);
  process.exit(1);
});

async function initLoop() {
  const { runDeployInit } = await import("./deploy-init");
  for (let attempt = 1; ; attempt++) {
    writeInitStatus({ state: "initializing", attempt, target });
    try {
      await runDeployInit();
      writeInitStatus({ state: "ready", attempt, target });
      console.log("start-server: database initialization complete");
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`start-server: init attempt ${attempt} failed — ${message}`);
      writeInitStatus({ state: "error", attempt, target, error: message });
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

initLoop();
