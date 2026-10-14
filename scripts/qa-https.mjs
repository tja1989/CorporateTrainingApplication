// Local-only TLS front door for production-mode browser qualification.
// WebKit correctly refuses Secure session cookies over plain HTTP localhost.
import { createServer } from "node:https";
import { request } from "node:http";
import { mkdirSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const directory = resolve(".artifacts/qa-tls");
const key = resolve(directory, "localhost.key");
const cert = resolve(directory, "localhost.crt");
const upstreamPort=Number(process.env.QA_UPSTREAM_PORT??3100);
const httpsPort=Number(process.env.QA_HTTPS_PORT??3443);
if(![upstreamPort,httpsPort].every(port=>Number.isInteger(port)&&port>1024&&port<65536))throw new Error("Use valid local QA ports.");
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (!existsSync(key) || !existsSync(cert)) {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", key, "-out", cert, "-days", "30", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
  chmodSync(key, 0o600);
}

const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (incoming, outgoing) => {
  const upstream = request({
    hostname: "127.0.0.1", port: upstreamPort, path: incoming.url, method: incoming.method,
    headers: { ...incoming.headers, "x-forwarded-proto": "https", "x-forwarded-host": incoming.headers.host },
  }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain" });
    outgoing.end("Local application unavailable. Start the production server on port 3100.");
  });
  incoming.on("aborted", () => upstream.destroy());
  incoming.pipe(upstream);
});
server.listen(httpsPort, "127.0.0.1", () => console.log(`Local QA HTTPS: https://localhost:${httpsPort} → http://127.0.0.1:${upstreamPort}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
