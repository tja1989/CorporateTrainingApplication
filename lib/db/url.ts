/**
 * DATABASE_URL hygiene: values pasted into dashboards commonly arrive with
 * surrounding quotes or whitespace; node-postgres then silently falls back to
 * localhost:5432 defaults. Clean the value and expose a redacted description
 * so logs always show the real target host.
 */
export function cleanDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return `UNPARSEABLE value (starts "${url.slice(0, 14)}…", length ${url.length}) — the driver would fall back to 127.0.0.1:5432`;
  }
}
