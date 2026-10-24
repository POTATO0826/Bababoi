// Renders a frame range with several browsers in parallel (frame f goes to worker f mod W), then merges the shutter
// sub-frames. Every flag except --workers is passed through to render-frames.mjs.
//   node render-film.mjs --dist ../harness/dist3b --out <dir> --frames 0-629 --dpr 2 --shutter 180 [--workers 3]
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const argv = process.argv.slice(2);
const get = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const W = Number(get("workers", 3));
const OUT = path.resolve(get("out", "frames"));
const spec = get("frames", "0-629");
const frames = spec.includes("-") && !spec.includes(",")
  ? (() => { const [a, b] = spec.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })()
  : spec.split(",").map(Number);
const pass = [];
for (let i = 0; i < argv.length; i += 2) if (!["--workers", "--frames", "--port"].includes(argv[i])) pass.push(argv[i], argv[i + 1]);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const here = path.dirname(new URL(import.meta.url).pathname);
const jobs = Array.from({ length: W }, (_, k) => frames.filter((_, i) => i % W === k)).filter((l) => l.length);
const logs = jobs.map((_, k) => fs.createWriteStream(path.join(OUT, `render-worker-${k}.log`)));
await Promise.all(
  jobs.map(
    (list, k) =>
      new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [path.join(here, "render-frames.mjs"), ...pass, "--frames", list.join(","), "--port", String(4600 + k)], { env: process.env });
        p.stdout.pipe(logs[k]);
        p.stderr.pipe(logs[k]);
        p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`worker ${k} exited ${c}`))));
      }),
  ),
);
const py = process.env.PYTHON ?? path.join(here, "../.venv/bin/python");
const m = spawnSync(py, [path.join(here, "shutter.py"), OUT], { encoding: "utf8" });
if (m.status !== 0) throw new Error(m.stderr);
console.log(m.stdout.trim().split("\n").pop());
const done = fs.readdirSync(OUT).filter((f) => /^frame-\d{4}\.png$/.test(f)).length;
console.log(`rendered ${done}/${frames.length} frames with ${W} workers in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
