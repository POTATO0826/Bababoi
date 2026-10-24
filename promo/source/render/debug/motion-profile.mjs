// Prints the on-screen travel per frame (window.motionAt over a 180° shutter) and the shutter sample counts it implies.
//   node debug/motion-profile.mjs <dist> [gap=6] [max=12]
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const DIST = path.resolve(process.argv[2]);
const GAP = Number(process.argv[3] ?? 6), MAX = Number(process.argv[4] ?? 12);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4498, "127.0.0.1", r));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("http://127.0.0.1:4498/index.html?dpr=1");
await page.waitForFunction(() => window.harnessReady, null, { timeout: 120000 });
const m = await page.evaluate(() => Array.from({ length: 630 }, (_, f) => window.motionAt(f - 0.25, f + 0.25)));
const per = await page.evaluate(() => Array.from({ length: 630 }, (_, f) => window.motionAt(f - 0.5, f + 0.5)));

const N = m.map((x) => Math.min(Number(process.argv[4] ?? 12), Math.max(1, Math.ceil(x / Number(process.argv[3] ?? 6)))));
console.log("captures:", N.reduce((a, x) => a + x, 0), "of which blurred frames:", N.filter((x) => x > 1).length);
console.log("frames over 80 px/frame:", per.map((x, f) => (x > 80 ? f : -1)).filter((f) => f >= 0).join(","));
const rows = [];
for (let f = 0; f < 630; f += 10) rows.push(`${String(f).padStart(3)} ` + per.slice(f, f + 10).map((x) => x.toFixed(0).padStart(4)).join(""));
console.log("px/frame (rows of 10):\n" + rows.join("\n"));
fs.writeFileSync(path.join(process.cwd(), "../../qa/motion-profile.json"), JSON.stringify({ perFrame: per, shutter180: m }, null, 0));
await b.close();
server.close();
