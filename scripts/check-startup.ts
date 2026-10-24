// Keep fixture file handles in a worker process; delete only after it exits (required on Windows).
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { childEnv } from "../src/local/isolation";
import { findConvexNode } from "../src/local/node-runtime";

const root = resolve(import.meta.dir, "..");
const nodeDir = findConvexNode({
  env: process.env, platform: process.platform, home: homedir(), which: (cmd) => Bun.which(cmd),
  exists: existsSync, isDir: (p) => existsSync(p) && statSync(p).isDirectory(), listDir: readdirSync,
  version: (bin) => { const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "ignore" }); return r.exitCode === 0 ? r.stdout.toString() : null; },
});
const node = join(nodeDir, process.platform === "win32" ? "node.exe" : "node");
const env = childEnv(process.env, { WAREORB_CONVEX_NODE: nodeDir });
// Same drive as node_modules: Convex cannot bundle component imports across Windows drives.
const create = Bun.spawnSync([node, "-e", "const fs=require('node:fs');fs.mkdirSync(process.argv[1],{recursive:true});process.stdout.write(fs.mkdtempSync(require('node:path').join(process.argv[1],'startup-')))", join(root, ".convex")], { cwd: root, env, stdout: "pipe", stderr: "inherit" });
assert.equal(create.exitCode, 0, "Could not create disposable test directory");
const scratch = create.stdout.toString();
let code: number;
try {
  const worker = Bun.spawn([process.execPath, "--no-env-file", join(root, "scripts", "smoke-demo.ts"), scratch], { cwd: root, env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  code = await worker.exited;
} finally {
  const cleanup = Bun.spawn([node, "-e", "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:20,retryDelay:250})", scratch], { cwd: root, env, stdin: "ignore", stdout: "ignore", stderr: "inherit" });
  const timer = setTimeout(() => cleanup.kill(), 60000);
  try { assert.equal(await cleanup.exited, 0, "Disposable test directory must be removed"); }
  finally { clearTimeout(timer); }
}
assert.equal(code, 0, "Startup worker failed");
console.log(`[startup] ${process.platform}: first run, frontend, authenticated inventory, no inherited API keys, restart persistence, shutdown and cleanup passed.`);
