// Start the real app twice in a disposable checkout, without operator credentials or shared data.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { childEnv } from "../src/local/isolation";
import { findConvexNode } from "../src/local/node-runtime";

const root = resolve(import.meta.dir, "..");
const nodeDir = findConvexNode({
  env: process.env, platform: process.platform, home: homedir(), which: (cmd) => Bun.which(cmd),
  exists: existsSync, isDir: (p) => existsSync(p) && statSync(p).isDirectory(), listDir: readdirSync,
  version: (bin) => { const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "ignore" }); return r.exitCode === 0 ? r.stdout.toString() : null; },
});
// Keep the disposable copy on the checkout's drive. Convex component imports use path.relative;
// a Windows TEMP on C: with dependencies on D: produces invalid ./D:/... imports.
const smokeDir = join(root, ".convex");
mkdirSync(smokeDir, { recursive: true });
const scratch = mkdtempSync(join(smokeDir, "startup-"));
const fixture = join(scratch, "checkout");
const excluded = new Set([".git", "node_modules", ".convex", ".pi", ".vercel", "dist", "out", "backups"]);
const include = (path: string) => !excluded.has(basename(path)) && !basename(path).startsWith(".env") && !path.endsWith(".log");
mkdirSync(fixture);
for (const name of readdirSync(root)) {
  if (include(name)) cpSync(join(root, name), join(fixture, name), { recursive: true, filter: include });
}
symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
const emptyAgent = join(scratch, "agent");
mkdirSync(emptyAgent);
const freePort = () => new Promise<number>((ok, no) => {
  const s = createServer();
  s.once("error", no);
  s.listen(0, "127.0.0.1", () => { const port = (s.address() as { port: number }).port; s.close(() => ok(port)); });
});
const ports = new Set<number>();
while (ports.size < 3) ports.add(await freePort());
const [web, convex, site] = [...ports] as [number, number, number];
const base = `http://127.0.0.1:${web}`;
const env = childEnv(process.env, {
  WAREORB_DEMO_PORT: String(web), WAREORB_CONVEX_PORT: String(convex), WAREORB_CONVEX_SITE_PORT: String(site),
  PI_CODING_AGENT_DIR: emptyAgent, PI_TELEMETRY: "0", PI_SKIP_VERSION_CHECK: "1",
  WAREORB_CONVEX_NODE: nodeDir,
  HOME: scratch, USERPROFILE: scratch, LOCALAPPDATA: scratch, APPDATA: scratch,
  XDG_CACHE_HOME: join(scratch, "cache"), XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"),
});
let running: ReturnType<typeof Bun.spawn> | undefined;
let output = "";
let drain: Promise<unknown> = Promise.resolve();
async function start() {
  output = "";
  const p = Bun.spawn([process.execPath, "--no-env-file", "scripts/demo.ts"], { cwd: fixture, env, stdout: "pipe", stderr: "pipe", stdin: "ignore", detached: process.platform !== "win32" });
  running = p;
  const consume = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      output = (output + new TextDecoder().decode(value)).slice(-16000);
    }
  };
  drain = Promise.all([consume(p.stdout), consume(p.stderr)]);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (p.exitCode !== null) throw new Error(`Demo exited with ${p.exitCode} before readiness.\n${output}`);
    try {
      const health = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1000) });
      if (health.ok && (await health.json()).service === "wareorb-frontend") return;
    } catch { /* Still starting. */ }
    await Bun.sleep(500);
  }
  throw new Error(`Demo did not become ready within four minutes.\n${output}`);
}
async function stop() {
  if (!running) return;
  const pid = running.pid;
  if (process.platform === "win32") Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
  else {
    running.kill("SIGTERM");
    await Promise.race([drain, Bun.sleep(3000)]);
    // Also clean up failed startup before the demo's normal signal handlers were installed.
    try { process.kill(-pid, "SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; }
  }
  await Promise.race([Promise.all([running.exited, drain]), Bun.sleep(15000).then(() => { throw new Error("Demo process tree did not stop"); })]);
  running = undefined;
  for (const port of ports) {
    let closed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      closed = await new Promise<boolean>((ok) => {
        const s = createServer();
        s.once("error", () => ok(false));
        s.listen(port, "127.0.0.1", () => s.close(() => ok(true)));
      });
      if (closed) break;
      await Bun.sleep(250);
    }
    assert(closed, `Port ${port} was not released after shutdown`);
  }
}
async function snapshot() {
  assert.equal((await fetch(base)).status, 200, "Frontend HTML must be served");
  const identity = await (await fetch(`${base}/api/demo/token`)).json() as { token: string };
  assert(identity.token, "Presenter must receive a token");
  const query = (token?: string) => fetch(`http://127.0.0.1:${convex}/api/query`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ path: "ledger:snapshot", args: { since: 0 }, format: "json" }),
  }).then((r) => r.json());
  const ledger = await query(identity.token);
  assert.equal(ledger.status, "success", "Presenter must read the warehouse");
  assert(ledger.value.skus.length > 0 && ledger.value.batches.length > 0, "First run must seed inventory");
  const guest = await query();
  assert(guest.status !== "success" || !guest.value?.skus?.length, "Unauthenticated queries must not read inventory");
  assert.equal((await (await fetch(`${base}/api/agent/status`)).json()).ready, false, "No personal AI credentials may be inherited");
  assert.equal((await (await fetch(`${base}/api/lalamove/status`)).json()).connected, false, "No delivery credentials may be inherited");
  return JSON.stringify({ skus: ledger.value.skus.map((s: { _id: string }) => s._id).sort(), batches: ledger.value.batches.map((b: { _id: string }) => b._id).sort() });
}
try {
  await start();
  const first = await snapshot();
  await stop();
  await start();
  assert.equal(await snapshot(), first, "Restart must retain the local database instead of reseeding");
  await stop();
} finally {
  await stop();
  // Node handles Windows directory junctions and EBUSY retries; Bun's rmSync does not retry here.
  const cleanup = Bun.spawn([
    join(nodeDir, process.platform === "win32" ? "node.exe" : "node"), "-e",
    "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })",
    scratch,
  ], { cwd: root, env, stdin: "ignore", stdout: "ignore", stderr: "inherit" });
  const timer = setTimeout(() => cleanup.kill(), 60000);
  try { assert.equal(await cleanup.exited, 0, "Disposable test directory must be removed"); }
  finally { clearTimeout(timer); }
}
console.log(`[startup] ${process.platform}: first run, frontend, authenticated inventory, no inherited API keys, restart persistence, shutdown and cleanup passed.`);
