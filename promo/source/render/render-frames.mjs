// Renders frames of the promo harness to PNG.
//   node render-frames.mjs --out <dir> --frames 0-299 | 18,57,105 [--dpr 1] [--port 4321]
//                          [--shutter 180] [--gap 6] [--max-samples 12]
// --shutter (degrees, default 0 = off) is real motion blur: a frame where something travels on screen during the open
// shutter (the page's window.motionAt) is captured as N sub-frames spread across the shutter, N chosen so neighbouring
// copies are at most --gap px apart; shutter.py averages them in linear light. Holds stay a single sharp capture.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith("--") ? [...a, [x.slice(2), arr[i + 1]]] : a), []),
);
const DIST = path.resolve(args.dist ?? path.join(import.meta.dirname, "../harness/dist"));
const OUT = path.resolve(args.out ?? "frames");
const DPR = Number(args.dpr ?? 1);
const PORT = Number(args.port ?? 4321);
const spec = args.frames ?? "0-299";
const SHUTTER = Number(args.shutter ?? 0) / 360; // open fraction of a frame
const GAP = Number(args.gap ?? 6);
const MAX_SAMPLES = Number(args["max-samples"] ?? 12);
const frames = spec.includes("-") && !spec.includes(",")
  ? (() => { const [a, b] = spec.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })()
  : spec.split(",").map(Number);
fs.mkdirSync(OUT, { recursive: true });

// Portable browser launch: the cloud container used a pinned Chromium + SwiftShader (software WebGL).
// On a Mac (local Claude Code) Playwright's own Chromium with the real GPU is used unless CHROME_PATH is set.
const PINNED = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const LINUX_SW = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const launchOpts = (extra = []) => {
  const exe = process.env.CHROME_PATH || (fs.existsSync(PINNED) ? PINNED : undefined);
  const sw = process.platform === "linux" || process.env.SWIFTSHADER === "1" ? LINUX_SW : ["--ignore-gpu-blocklist"];
  return { ...(exe ? { executablePath: exe } : {}), args: [...sw, ...extra] };
};

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!file.startsWith(DIST) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await chromium.launch(launchOpts(["--font-render-hinting=none"]));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(600000);
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html?dpr=${DPR}`);
await page.waitForFunction(() => window.harnessReady || document.body.dataset.error, null, { timeout: 120000 });
const err = await page.evaluate(() => document.body.dataset.error);
if (err) { console.error(err); process.exit(1); }

// Frames depend on what came before only through the ledger key; render a warm-up frame so shaders compile.
await page.evaluate(() => window.renderFrame(0));
const t0 = Date.now();
let captures = 0;
for (const f of frames) {
  const t = Date.now();
  const name = `frame-${String(f).padStart(4, "0")}`;
  const travel = SHUTTER > 0 ? await page.evaluate(([a, b]) => window.motionAt(a, b), [f - SHUTTER / 2, f + SHUTTER / 2]) : 0;
  const n = SHUTTER > 0 ? Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(travel / GAP))) : 1;
  if (n === 1) {
    await page.evaluate((x) => window.renderFrame(x), f);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  } else {
    // box filter over the open shutter, centred on the frame time
    const dir = path.join(OUT, ".sub", name);
    fs.mkdirSync(dir, { recursive: true });
    for (let k = 0; k < n; k++) {
      await page.evaluate((x) => window.renderFrame(x), f + SHUTTER * ((k + 0.5) / n - 0.5));
      await page.screenshot({ path: path.join(dir, `${String(k).padStart(2, "0")}.png`) });
    }
  }
  captures += n;
  console.log(`frame ${f} ${((Date.now() - t) / 1000).toFixed(1)}s${n > 1 ? ` · ${n} samples (${travel.toFixed(0)} px)` : ""}`);
}
console.log(`done ${frames.length} frames, ${captures} captures in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await browser.close();
server.close();
