import { readFileSync } from "fs";
import { resolve } from "path";

/** Minimal .env loader for tsx scripts (Next.js loads .env itself). */
export function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env — fine */
  }
}
