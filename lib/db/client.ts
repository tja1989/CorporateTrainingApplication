import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

const pool =
  global.__dbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://lulu:lulu@127.0.0.1:5432/lulu_learn",
    max: 10,
  });
if (process.env.NODE_ENV !== "production") global.__dbPool = pool;

export const db = drizzle(pool, { schema });
export { pool };
export * as t from "./schema";
