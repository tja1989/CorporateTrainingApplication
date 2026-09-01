import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

import { cleanDatabaseUrl } from "./url";

const connectionString = cleanDatabaseUrl(process.env.DATABASE_URL) ?? "postgres://lulu:lulu@127.0.0.1:5432/lulu_learn";

function needsSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  // Managed public endpoints (e.g. Railway proxy) need TLS; local/internal hosts don't.
  return !/localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
}

const pool =
  global.__dbPool ??
  new Pool({
    connectionString,
    max: 10,
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
if (process.env.NODE_ENV !== "production") global.__dbPool = pool;

export const db = drizzle(pool, { schema });
export { pool };
export * as t from "./schema";
