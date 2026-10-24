// Debug: load a harness build, print every console message and the boot state after a while.
//   node debug/boot-probe.mjs <dist> [seconds]
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const DIST = path.resolve(process.argv[2]);
const SECS = Number(process.argv[3] ?? 40);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(file)) { console.log("404", req.url); return res.writeHead(404).end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4499, "127.0.0.1", r));
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--ignore-gpu-blocklist", "--font-render-hinting=none"] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url(), r.failure()?.errorText));
await page.goto("http://127.0.0.1:4499/index.html?dpr=1");
for (let i = 0; i < SECS; i += 5) {
  await new Promise((r) => setTimeout(r, 5000));
  const st = await page.evaluate(() => ({ ready: !!window.harnessReady, err: document.body.dataset.error ?? null, r3f: !!window.__r3f, committed: window.__committed ?? null, fonts: document.fonts.status }));
  console.log(`t+${i + 5}s`, JSON.stringify(st));
  if (st.ready || st.err) break;
}
await b.close();
server.close();
