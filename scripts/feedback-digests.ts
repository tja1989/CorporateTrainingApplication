import { loadEnv } from "../lib/env";
loadEnv();
async function main() {
  const interval = process.argv[2];
  if (interval !== "week" && interval !== "month")
    throw new Error("Usage: npm run feedback:digests -- week|month");
  const { runFeedbackDigests } = await import("../lib/feedback/digests");
  const { pool } = await import("../lib/db/client");
  try {
    const stats = await runFeedbackDigests(interval);
    console.log(
      "feedback digests (in-app):",
      JSON.stringify({ interval, ...stats }),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Feedback digest command failed",
  );
  process.exitCode = 1;
});
