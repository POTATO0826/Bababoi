// Dumps the film's sound data (window.soundData: cues, pen tip, camera speed, dispatch light) to JSON for score.py.
//   node export-sound.mjs <dist> <out.json>
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const DIST = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4497, "127.0.0.1", r));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("http://127.0.0.1:4497/index.html?dpr=1");
await page.waitForFunction(() => window.harnessReady, null, { timeout: 120000 });
const data = await page.evaluate(() => window.soundData());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(`wrote ${OUT}: ${data.cues.length} cues`);
await b.close();
server.close();
