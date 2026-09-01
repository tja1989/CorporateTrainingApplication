import { loadEnv } from "../lib/env";
loadEnv();

async function main() {
  const { runDailySweep, runWeeklyDigest } = await import("../lib/lms/sweep");
  const stats = await runDailySweep();
  const digests = await runWeeklyDigest();
  console.log("sweep:", JSON.stringify({ ...stats, digests }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
