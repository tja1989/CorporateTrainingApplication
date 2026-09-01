import { spawn } from "child_process";
import { networkInterfaces } from "os";

/**
 * Start Next.js bound to the right interface for the runtime:
 * prefer dual-stack `::` (Railway's proxy reaches containers over IPv6),
 * fall back to `0.0.0.0` when the container has no IPv6. Prints the choice
 * so deploy logs always show exactly where the server listens.
 */
const interfaces = Object.values(networkInterfaces()).flat();
const hasIpv6 = interfaces.some((iface) => iface && iface.family === "IPv6");
const host = hasIpv6 ? "::" : "0.0.0.0";
const port = process.env.PORT ?? "3000";

console.log(`start-server: binding next start on host ${host} port ${port} (ipv6=${hasIpv6})`);

const child = spawn("npx", ["next", "start", "-H", host, "-p", port], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error("start-server: failed to launch next:", err);
  process.exit(1);
});
