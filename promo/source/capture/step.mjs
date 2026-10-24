// Drive the real WareOrb frontend (running against the local Convex backend) and capture 1920x1080 states.
// Usage: node step.mjs <role> <script.json-ish JS file exporting async (page, h) => {}> <outPrefix>
// The step file receives helpers: shot(name), open(stage), click(text), wait(ms), state(partial), detail(kind,id)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [role, stepFile, outDir] = process.argv.slice(2);
// Portable browser launch (same as capture-flow.mjs): CHROME_PATH, else the cloud's pinned Chromium if present,
// else Playwright's own; SwiftShader (software WebGL) only on Linux or with SWIFTSHADER=1.
const PINNED = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const exe = process.env.CHROME_PATH || (fs.existsSync(PINNED) ? PINNED : undefined);
const sw = process.platform === "linux" || process.env.SWIFTSHADER === "1" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : ["--ignore-gpu-blocklist"];
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: sw });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:3000/?role=${role}&ai=0`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ware?.getState().ledgerReady, null, { timeout: 30000 });
await page.waitForTimeout(2500);

const h = {
  page,
  wait: (ms) => page.waitForTimeout(ms),
  shot: async (name, opts = {}) => {
    const p = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: p, ...opts });
    console.log("shot", p);
  },
  state: (partial) => page.evaluate((p) => window.__ware.setState(p), partial),
  get: (fn) => page.evaluate(fn),
  open: async (stage) => { await page.evaluate((s) => window.__ware.setState({ stage: s, detail: null, panelOpen: false }), stage); await page.waitForTimeout(800); },
  click: async (text, opts = {}) => {
    const loc = page.getByRole("button", { name: text, exact: opts.exact ?? false }).first();
    await loc.click({ timeout: 8000 });
    await page.waitForTimeout(opts.after ?? 1200);
  },
  text: async () => page.evaluate(() => document.body.innerText),
};

const mod = await import(path.resolve(stepFile));
try {
  await mod.default(page, h);
} catch (e) {
  console.error("STEP ERROR", e.message);
  await page.screenshot({ path: path.join(outDir, "_error.png") });
}
if (logs.length) console.log(logs.slice(-15).join("\n"));
await browser.close();
