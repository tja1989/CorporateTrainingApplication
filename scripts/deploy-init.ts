import { loadEnv } from "../lib/env";
loadEnv();

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";

/**
 * Self-initializing deploy step (runs before `next start` on Railway):
 * 1. ensure the pgvector extension exists
 * 2. push the Drizzle schema
 * 3. apply ANN/FTS indexes + constraints (db-extras.sql, idempotent)
 * 4. seed demo data once, only when DEMO_MODE=true and the DB is empty
 */
export async function runDeployInit(): Promise<void> {
  const { cleanDatabaseUrl, describeDatabaseUrl } = await import("../lib/db/url");
  const url = cleanDatabaseUrl(process.env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL is not set — add a Postgres service and reference its DATABASE_URL.");
  process.env.DATABASE_URL = url; // pass the cleaned value to drizzle-kit/seed subprocesses
  console.log(`deploy-init: database target → ${describeDatabaseUrl(url)}`);
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set — add a long random string in the service variables.");
  }

  // Railway's private network (`*.railway.internal`) can take a few seconds to
  // come up after container start, and Postgres itself may still be booting —
  // retry the first connection for up to 90s instead of crashing instantly.
  const client = await connectWithRetry(url);

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    console.log("deploy-init: pgvector extension ready");
  } catch (err) {
    throw new Error(
      `deploy-init: could not enable pgvector (${err instanceof Error ? err.message : err}). ` +
        "On Railway, deploy the Postgres database from the 'pgvector' template (or any Postgres image that ships the vector extension).",
    );
  }

  console.log("deploy-init: pushing schema…");
  execSync("npx drizzle-kit push --force", { stdio: "inherit", env: process.env });

  console.log("deploy-init: applying indexes/constraints…");
  const extras = readFileSync(resolve(process.cwd(), "scripts/db-extras.sql"), "utf8");
  for (const statement of extras.split(/;\s*\n/)) {
    const sql = statement.trim();
    if (!sql || sql.startsWith("--")) continue;
    await client.query(sql);
  }

  const { rows } = await client.query("SELECT count(*)::int AS n FROM users");
  await client.end();
  if (rows[0].n === 0 && process.env.DEMO_MODE === "true") {
    console.log("deploy-init: empty database + DEMO_MODE — seeding demo data…");
    execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env: process.env });
  } else {
    console.log(`deploy-init: ${rows[0].n} user(s) present — skipping seed`);
  }
  console.log("deploy-init: done");
}

async function connectWithRetry(url: string, attempts = 5, delayMs = 3000): Promise<Client> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    const client = new Client({ connectionString: url, ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined });
    try {
      await client.connect();
      if (i > 1) console.log(`deploy-init: database reachable after ${i} attempt(s)`);
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      console.log(
        `deploy-init: waiting for database (attempt ${i}/${attempts}) — ${err instanceof Error ? err.message : err}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `deploy-init: could not reach the database after ${attempts} attempts. Last error: ${
      lastErr instanceof Error ? lastErr.message : lastErr
    }. Check that the Postgres service is Online and DATABASE_URL matches its credentials.`,
  );
}

function needsSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  // Railway/most managed public endpoints need TLS; internal hosts don't.
  return !/localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
}

// Run directly (npm run start:deploy used to call this; start-server now drives it)
if (process.argv[1]?.endsWith("deploy-init.ts")) {
  runDeployInit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
