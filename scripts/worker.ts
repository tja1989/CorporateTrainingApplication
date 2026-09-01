import { loadEnv } from "../lib/env";
loadEnv();

/** Background worker loop over the Postgres job queue (spec §12.1). */
async function main() {
  const { claimAndRun } = await import("../lib/jobs/queue");
  const { handlers } = await import("../lib/jobs/handlers");
  console.log("worker: polling jobs (ctrl-c to stop)");
  for (;;) {
    try {
      const ran = await claimAndRun(handlers);
      if (!ran) await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      console.error("worker error:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main();
