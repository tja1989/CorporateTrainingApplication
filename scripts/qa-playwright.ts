import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadEnv } from "../lib/env";
import { localChromiumTls } from "../e2e/qa-tls";

loadEnv();
const base = process.env.QA_BASE ?? "https://localhost:3443";
const tls = localChromiumTls(base);
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("QA must not disable Node TLS validation");

// route.fetch() and APIRequestContext use Node, not Chromium's network stack.
// Node reads extra CAs only at process startup, so pass the exact local proxy
// certificate to this disposable test child. No OS or application setting changes.
const env: NodeJS.ProcessEnv = { ...process.env, QA_BASE: base };
if (tls.certificatePath) env.NODE_EXTRA_CA_CERTS = tls.certificatePath;
const child = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), ...process.argv.slice(2)], { env, stdio: "inherit" });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
