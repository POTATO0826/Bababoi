// Evidence screenshots of the backend-production local demo (`bun run demo`), with no credentials.
// This is a verification smoke script, not the recording driver: it only opens pages and types into Jarvis.
//   CHROME_PATH=... node smoke-screens.mjs <baseUrl> <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [base = "http://127.0.0.1:3350", out = "screens"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const log = [];
page.on("pageerror", (e) => log.push(`[pageerror] ${e.message}`));
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log("shot", name); };
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 1200);

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
await shot("01-home");
console.log("HOME:", await text());

// Jarvis input: open the dock if the input isn't visible yet.
const input = page.getByPlaceholder(/Ask, or type \/ for commands/i).first();
if (!(await input.isVisible().catch(() => false))) {
  const opener = page.getByRole("button", { name: /jarvis/i }).first();
  if (await opener.isVisible().catch(() => false)) { await opener.click(); await page.waitForTimeout(1500); }
}
await shot("02-jarvis-open");
console.log("JARVIS:", await text());

// Offline navigation (applied in the browser before any model call).
if (await input.isVisible().catch(() => false)) {
  await input.fill("Where can I put my new sofa?");
  await input.press("Enter");
  await page.waitForTimeout(5000);
  await shot("03-jarvis-navigate-sofa");
  console.log("NAVIGATE:", await text());

  await input.fill("/delivery");
  await page.waitForTimeout(600);
  await input.press("Enter");
  await page.waitForTimeout(4000);
  await shot("04-delivery");
  console.log("DELIVERY:", await text());
} else {
  console.log("Jarvis input not found; skipped navigation and delivery shots");
}
if (log.length) console.log(log.join("\n"));
await browser.close();
