#!/usr/bin/env bun
// WareOrb local presentation: `bun run demo` (add `--reset` to reload the synthetic demo data,
// `--setup-only` to prepare without starting the web server). Everything runs on this computer:
// an accountless local Convex backend whose data persists in .convex/local, and the WareOrb server
// at http://127.0.0.1:3000 with the presenter signed in. See docs/local-demo.md.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DemoError, runDemo, type DemoDeps } from "../src/local/demo-runner";
import { IsolationError } from "../src/local/isolation";
import { findConvexNode } from "../src/local/node-runtime";

const root = join(import.meta.dir, "..");
const at = (file: string) => join(root, file);

const deps: DemoDeps = {
  root,
  ambient: { ...process.env },
  argv: process.argv.slice(2),
  read: (file) => (existsSync(at(file)) ? readFileSync(at(file), "utf8") : null),
  writePrivate: (file, text) => {
    writeFileSync(at(file), text, { mode: 0o600 });
    chmodSync(at(file), 0o600);
  },
  run: async (cmd, env) => {
    const p = Bun.spawn(cmd, { cwd: root, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, output: `${out}\n${err}` };
  },
  start: (cmd, env, log) => {
    let out: number | "inherit" = "inherit";
    if (log) {
      mkdirSync(dirname(at(log)), { recursive: true });
      out = openSync(at(log), "a", 0o600);
    }
    const p = Bun.spawn(cmd, { cwd: root, env, stdin: "ignore", stdout: out, stderr: out });
    return { kill: () => p.kill(), exited: p.exited };
  },
  fetch: (url, init) => fetch(url, init),
  portFree: (port) => new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  }),
  convexNodeDir: () => findConvexNode({
    env: process.env,
    platform: process.platform,
    home: homedir(),
    which: (cmd) => Bun.which(cmd),
    exists: (p) => existsSync(p),
    isDir: (p) => existsSync(p) && statSync(p).isDirectory(),
    listDir: (p) => readdirSync(p),
    version: (bin) => {
      const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "ignore" });
      return r.exitCode === 0 ? r.stdout.toString() : null;
    },
  }),
  withSecretFile: async (text, use) => {
    const dir = mkdtempSync(join(tmpdir(), "wareorb-env-"));
    try {
      const file = join(dir, "backend.env");
      writeFileSync(file, text, { mode: 0o600 });
      return await use(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  log: (msg) => console.log(`[demo] ${msg}`),
  sleep: (ms) => Bun.sleep(ms),
  agentStatus: async () => (await import("../src/local/agent")).agentStatus(),
};

try {
  const demo = await runDemo(deps);
  if (demo.web) {
    const quit = () => { demo.stop(); process.exit(0); };
    process.on("SIGINT", quit);
    process.on("SIGTERM", quit);
    await demo.web;
    demo.stop();
  }
} catch (e) {
  console.error(`[demo] ${e instanceof IsolationError || e instanceof DemoError || e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
