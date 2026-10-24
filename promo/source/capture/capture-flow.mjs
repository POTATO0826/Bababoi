// Drives the REAL WareOrb frontend (Vince @ 781687f, running against a local Convex backend seeded with the
// app's own synthetic demo data) through the §8 demo path and saves:
//   - UI crops (2x DPR) used as the glass UI panels in the promo
//   - full-frame 1920x1080 reference screenshots of every state
//   - the app's own ledger snapshot (window.__ware) at each state, used to drive the 3D scene harness
// Usage: node capture-flow.mjs <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const PHASES = process.argv[3] ?? "ABCDEF";
const SKIP_REF = process.env.SKIP_REF === "1";
fs.mkdirSync(path.join(OUT, "ui"), { recursive: true });
fs.mkdirSync(path.join(OUT, "ref"), { recursive: true });
fs.mkdirSync(path.join(OUT, "ledger"), { recursive: true });

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
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1500 }, deviceScaleFactor: 2 });
// Keep the WebGL map at 1x so SwiftShader stays responsive; the DOM (the UI we crop) still renders at 2x.
if (process.env.MAP_DPR1 === "1") await ctx.addInitScript(() => Object.defineProperty(window, "devicePixelRatio", { get: () => 1 }));
const log = (...a) => console.log(...a);

async function openAs(role) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => log("[pageerror]", e.message));
  await page.goto(`http://localhost:3000/?role=${role}&ai=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ware?.getState().ledgerReady, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  return page;
}
const wait = (page, ms) => page.waitForTimeout(ms);
const set = (page, p) => page.evaluate((x) => window.__ware.setState(x), p);
const openStage = async (page, s) => { await set(page, { stage: s, detail: null, panelOpen: false }); await wait(page, 900); };
const dealId = (page) => page.evaluate(() => window.__ware.getState().ledger.deals.find((d) => d.code === "D-1001")?._id);

async function dump(page, name) {
  const json = await page.evaluate(() => JSON.stringify({ now: Date.now(), ledger: window.__ware.getState().ledger }));
  fs.writeFileSync(path.join(OUT, "ledger", `${name}.json`), json);
  log("ledger", name, json.length);
}
async function ref(page, name) {
  if (SKIP_REF) return;
  // reference at the app's normal 1920x1080 / DPR 1 framing
  await page.setViewportSize({ width: 1920, height: 1080 });
  await wait(page, 1600);
  await page.screenshot({ path: path.join(OUT, "ref", `${name}.png`), scale: "css" });
  await page.setViewportSize({ width: 1920, height: 1500 });
  await wait(page, 1600);
  log("ref", name);
}
const detailEl = (page) => page.locator('main[aria-label="Warehouse 3D view"] section').first();
const sectionEl = (page, label) =>
  page.locator(`xpath=//main[@aria-label="Warehouse 3D view"]//section//span[contains(@class,"uppercase") and normalize-space()="${label}"]/../..`).first();
async function crop(loc, name, pad = 0) {
  const bb = await loc.boundingBox();
  if (!bb) throw new Error("no bbox for " + name);
  await loc.page().screenshot({
    path: path.join(OUT, "ui", `${name}.png`),
    clip: { x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2 },
  });
  log("crop", name, Math.round(bb.width), "x", Math.round(bb.height));
}
const clickBtn = async (page, name, exact = true, after = 1500) => {
  await page.getByRole("button", { name, exact }).first().click({ timeout: 120000 });
  await wait(page, after);
};

// ── A · Receiving (warehouse: J. Lim) ────────────────────────────────────
if (PHASES.includes("A"))
{
  const page = await openAs("warehouse");
  await dump(page, "L0-seed");
  await ref(page, "r00-overview");
  await openStage(page, "receive");
  const rid = await page.evaluate(() => window.__ware.getState().ledger.receipts.find((r) => r.status === "needs_review")?._id);
  await set(page, { detail: { kind: "receipt", id: rid }, floor: 1, zone: null, selected: null });
  await wait(page, 2500);
  await crop(detailEl(page), "c01-receipt-review");
  await crop(page.locator("aside [data-slot=card]").first(), "c01b-receive-list");
  await ref(page, "r01-receipt-review");
  await page.getByText("Counted and checked").first().click();
  await wait(page, 1200);
  await crop(detailEl(page), "c02-receipt-checked");
  await ref(page, "r02-receipt-checked");
  await clickBtn(page, "Post to stock", true, 3500);
  await crop(detailEl(page), "c03-receipt-posted");
  await ref(page, "r03-receipt-posted");
  await dump(page, "L1-posted");
  await page.close();
}

// ── B · Ageing (owner: Mei) ──────────────────────────────────────────────
if (PHASES.includes("B"))
{
  const page = await openAs("owner");
  await openStage(page, "ageing");
  await page.locator("aside button").filter({ hasText: "B-2140-A" }).first().click();
  await wait(page, 3500);
  await crop(page.locator("aside [data-slot=card]").first(), "c04-ageing-list");
  await crop(detailEl(page), "c05-ageing-batch");
  await ref(page, "r04-ageing-batch");
  await dump(page, "L2a-ageing");
  await clickBtn(page, "Hand to Arif", true, 3500);
  await crop(detailEl(page), "c05b-handed");
  await crop(page.locator("aside [data-slot=card]").first(), "c04b-ageing-list-handed");
  await ref(page, "r05-handed");
  await dump(page, "L2-handed");
  await page.close();
}

// ── C · Deal + delivery quotes (sales: Arif) ─────────────────────────────
if (PHASES.includes("C"))
{
  const page = await openAs("sales");
  await openStage(page, "deals");
  await crop(page.locator("aside [data-slot=card]").first(), "c06a-deals-task");
  await ref(page, "r06-deals-task");
  const id = await dealId(page);
  await set(page, { detail: { kind: "deal", id } });
  await wait(page, 2500);
  await page.getByPlaceholder("Name").fill("Demo buyer · PJ");
  const nums = page.locator('main input[type=number]');
  await nums.nth(0).fill("2");
  await nums.nth(1).fill("1200");
  await clickBtn(page, "Save", true, 2500);
  await clickBtn(page, "Confirm location with buyer", true, 2500);
  await clickBtn(page, "Demo", true, 3500);
  await crop(sectionEl(page, "Buyer"), "c06-buyer", 6);
  await crop(sectionEl(page, "Delivery"), "c07-delivery-quotes", 6);
  await crop(detailEl(page), "c07b-deal-full");
  await ref(page, "r07-quotes");
  await page.getByText("Carrier A").first().click();
  await wait(page, 800);
  await clickBtn(page, "Send to Mei", true, 3000);
  await page.close();
}

// ── D · Owner approval ───────────────────────────────────────────────────
if (PHASES.includes("D"))
{
  const page = await openAs("owner");
  await openStage(page, "approve");
  const id = await dealId(page);
  await set(page, { detail: { kind: "deal", id } });
  await wait(page, 3000);
  await crop(sectionEl(page, "Approval"), "c08-approval", 6);
  await crop(detailEl(page), "c08b-approval-full");
  await ref(page, "r08-approval");
  await dump(page, "L3a-pending");
  await clickBtn(page, "Approve", true, 3500);
  await crop(sectionEl(page, "Decision"), "c09-decision", 6);
  await crop(sectionEl(page, "Collection"), "c09b-collection-booked", 6);
  await ref(page, "r09-approved");
  await dump(page, "L3-approved");
  await page.close();
}

// ── E · Confirmed collection (warehouse) ─────────────────────────────────
if (PHASES.includes("E"))
{
  const page = await openAs("warehouse");
  await openStage(page, "collect");
  const id = await dealId(page);
  await set(page, { detail: { kind: "deal", id } });
  await wait(page, 3000);
  await crop(sectionEl(page, "Collection"), "c10a-collect", 6);
  await clickBtn(page, "Goods collected", true, 1200);
  await crop(sectionEl(page, "Collection"), "c10b-collect-confirm", 6);
  await ref(page, "r10-collect-confirm");
  await page.getByRole("button", { name: /left the warehouse/ }).first().click();
  await wait(page, 3500);
  await crop(sectionEl(page, "Collection"), "c10c-collected", 6);
  await ref(page, "r11-collected");
  await dump(page, "L4-collected");
  await page.close();
}

// ── F · Replenishment + brand chrome (owner) ─────────────────────────────
if (PHASES.includes("F"))
{
  const page = await openAs("owner");
  await crop(page.locator("header").first(), "c12-header");
  await crop(page.locator("header > div").first(), "c12b-brand", 4);
  await openStage(page, "replenish");
  await page.locator("aside button").filter({ hasText: "3-Seater Sofa" }).first().click();
  await wait(page, 3500);
  await crop(page.locator("aside [data-slot=card]").first(), "c11-replenish");
  await ref(page, "r12-replenish");
  await dump(page, "L5-replenish");
  await page.close();
}

await browser.close();
log("done");
