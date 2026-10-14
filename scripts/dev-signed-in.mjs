#!/usr/bin/env node
/**
 * Run the whole app on this computer, signed in as you.
 *
 *   npm run dev:local -- you@example.org
 *
 * Then open http://localhost:8788 (the catalogue), /contribute, or / on a phone-sized window.
 *
 * WHY THIS EXISTS. On the live site Cloudflare Access signs people in and adds their
 * email to every request; the Worker refuses anything without it (AGENTS.md, "The
 * server side"). Locally there is no Access, so every /api call is refused and the app
 * says you don't have access. `npm run dev` alone has no server at all.
 *
 * This script starts the real Worker (`wrangler dev`, local D1 and R2 — never the live
 * database) on port 8787, and a tiny forwarder on 8788 that adds the email header,
 * standing in for Access. Nothing in the Worker's sign-in code changes.
 *
 * SAFETY. The forwarder listens on 127.0.0.1 only, so nobody else on the wifi can use it
 * to act as you. It is a development tool: never run it on a server.
 *
 * First run on an empty local database: the first email to arrive becomes admin (the
 * normal bootstrap). Catalogue an object or two through the capture app at
 * http://localhost:8788/ — choose photos from the library — and they appear in
 * /contribute. To try the computer's description locally, put ANTHROPIC_API_KEY=... in
 * .dev.vars (gitignored); each description costs a few cents.
 */

import { spawn, spawnSync } from "node:child_process";
import http from "node:http";

const email = (process.argv[2] ?? process.env.DEV_EMAIL ?? "").trim().toLowerCase();
if (!email.includes("@")) {
  console.error("Usage: npm run dev:local -- you@example.org");
  process.exit(1);
}

const WORKER_PORT = 8787;
const PUBLIC_PORT = 8788;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

console.log("Building the app…");
if (spawnSync(npm, ["run", "build"], { stdio: "inherit" }).status !== 0) process.exit(1);

console.log("Bringing the LOCAL database up to date (the live one is not touched)…");
if (
  spawnSync(npx, ["wrangler", "d1", "migrations", "apply", "artefact-catalogue", "--local"], {
    stdio: "inherit",
  }).status !== 0
) {
  process.exit(1);
}

const worker = spawn(npx, ["wrangler", "dev", "--local", "--port", String(WORKER_PORT)], { stdio: "inherit" });
const stop = () => {
  worker.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
worker.on("exit", (code) => process.exit(code ?? 0));

http
  .createServer((req, res) => {
    const headers = { ...req.headers, "cf-access-authenticated-user-email": email };
    const upstream = http.request(
      { host: "127.0.0.1", port: WORKER_PORT, method: req.method, path: req.url, headers },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      }
    );
    upstream.on("error", () => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("The local Worker isn't answering yet. Give it a few seconds and reload.");
    });
    req.pipe(upstream);
  })
  .listen(PUBLIC_PORT, "127.0.0.1", () => {
    console.log(`\nSigned in as ${email}. Open http://localhost:${PUBLIC_PORT}/contribute\n`);
  });
