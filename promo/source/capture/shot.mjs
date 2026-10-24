// Quick capture helper: node shot.mjs <url> <out.png> [waitMs]
import { chromium } from "playwright";
import fs from "node:fs";

const [url, out, wait = "6000"] = process.argv.slice(2);
// Portable browser launch (same as capture-flow.mjs): CHROME_PATH, else the cloud's pinned Chromium if present,
// else Playwright's own; SwiftShader (software WebGL) only on Linux or with SWIFTSHADER=1.
const PINNED = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
const exe = process.env.CHROME_PATH || (fs.existsSync(PINNED) ? PINNED : undefined);
const sw = process.platform === "linux" || process.env.SWIFTSHADER === "1" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : ["--ignore-gpu-blocklist"];
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: sw });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log(logs.slice(-30).join("\n"));
await browser.close();
