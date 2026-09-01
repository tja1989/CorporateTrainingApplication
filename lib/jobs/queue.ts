import { sql } from "drizzle-orm";
import { db, t, pool } from "@/lib/db/client";
import { id } from "@/lib/ids";

/**
 * Postgres-backed job queue (FOR UPDATE SKIP LOCKED) — the only queue in the
 * MVP (spec §12.1). BullMQ/Redis is a documented swap behind this interface.
 */

export type JobKind = "ingest_video" | "ingest_policy_doc" | "health_check_videos";

export async function enqueue(kind: JobKind, payload: Record<string, unknown>, delayMs = 0): Promise<string> {
  const jobId = id();
  await db.insert(t.jobs).values({
    id: jobId,
    kind,
    payload,
    state: "queued",
    runAfter: new Date(Date.now() + delayMs),
  });
  return jobId;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export async function claimAndRun(handlers: Record<string, JobHandler>): Promise<boolean> {
  const client = await pool.connect();
  let job: { id: string; kind: string; payload: Record<string, unknown> } | null = null;
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `SELECT id, kind, payload FROM jobs
       WHERE state = 'queued' AND run_after <= now()
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    if (res.rows.length === 0) {
      await client.query("COMMIT");
      return false;
    }
    job = res.rows[0];
    await client.query(`UPDATE jobs SET state = 'running' WHERE id = $1`, [job!.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const handler = handlers[job!.kind];
  try {
    if (!handler) throw new Error(`No handler for job kind ${job!.kind}`);
    await handler(job!.payload);
    await db.execute(sql`UPDATE jobs SET state = 'done', finished_at = now() WHERE id = ${job!.id}`);
  } catch (err) {
    await db.execute(
      sql`UPDATE jobs SET state = 'failed', error = ${String(err instanceof Error ? err.message : err)}, finished_at = now() WHERE id = ${job!.id}`,
    );
  }
  return true;
}

export async function retryJob(jobId: string): Promise<void> {
  await db.execute(sql`UPDATE jobs SET state = 'queued', error = NULL, run_after = now() WHERE id = ${jobId}`);
}

/** Drain the queue inline (used by seed and by the dev "process now" action). */
export async function drain(handlers: Record<string, JobHandler>, max = 100): Promise<number> {
  let n = 0;
  while (n < max && (await claimAndRun(handlers))) n++;
  return n;
}
