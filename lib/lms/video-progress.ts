/** Resume position and watched coverage are deliberately independent. A heartbeat
 * credits only its own five-second bucket, never the distance travelled by a seek. */
export const VIDEO_BUCKET_SEC = 5;
export function clampVideoPosition(position: unknown, durationSec: number): number | null {
  if (typeof position !== "number" || !Number.isFinite(position) || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  return Math.min(durationSec, Math.max(0, position));
}
export function videoHeartbeat(existing: number[], positionSec: number, durationSec: number) {
  const lastPositionSec = clampVideoPosition(positionSec, durationSec);
  if (lastPositionSec === null) throw new Error("Invalid video position");
  const total = Math.max(1, Math.ceil(durationSec / VIDEO_BUCKET_SEC));
  const buckets = new Set(existing.filter(b => Number.isInteger(b) && b >= 0 && b < total));
  buckets.add(Math.min(total - 1, Math.floor(lastPositionSec / VIDEO_BUCKET_SEC)));
  const coverage = buckets.size / total;
  return { lastPositionSec, watchedBuckets: [...buckets].sort((a, b) => a - b), coveragePct: Math.min(100, Math.round(coverage * 100)), complete: coverage >= 0.9 };
}
export function videoCoverage(buckets: number[], durationSec: number): number {
  const total = Math.max(1, Math.ceil(durationSec / VIDEO_BUCKET_SEC));
  return Math.min(100, Math.round(new Set(buckets.filter(b => Number.isInteger(b) && b >= 0 && b < total)).size / total * 100));
}
