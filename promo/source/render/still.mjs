import fs from "node:fs";
// node still.mjs <frame> <out.png> [query]
import { chromium } from "playwright";
const [f, out, q = ""] = process.argv.slice(2);
// Portable browser launch: the cloud container used a pinned Chromium + SwiftShader (software WebGL).
// On a Mac (local Claude Code) Playwright's own Chromium with the real GPU is used unless CHROME_PATH is set.
const PINNED = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const LINUX_SW = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const launchOpts = (extra = []) => {
  const exe = process.env.CHROME_PATH || (fs.existsSync(PINNED) ? PINNED : undefined);
  const sw = process.platform === "linux" || process.env.SWIFTSHADER === "1" ? LINUX_SW : ["--ignore-gpu-blocklist"];
  return { ...(exe ? { executablePath: exe } : {}), args: [...sw, ...extra] };
};
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:4322/index.html?" + q);
await page.waitForFunction(() => window.harnessReady, null, { timeout: 120000 });
for (const n of f.split(",").map(Number)) { await page.evaluate((x) => window.renderFrame(x), n); }
await page.screenshot({ path: out });
await browser.close();
