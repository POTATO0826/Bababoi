#!/usr/bin/env bun
// Browser test (Chromium via Playwright): the real Jarvis chat streams a turn from the real local demo
// routes — Pi agent → warehouse tool → presenter-authorised (fake) local Convex query — and the receipt
// measurement inputs show honest totals. `bun run test:browser`.
// Default: Pi's MOCKED faux provider (labelled). WAREORB_E2E_LIVE=1 uses the operator's real provider login
// or ANTHROPIC_API_KEY from the shell (synthetic data only; never written anywhere).
import tailwind from "bun-plugin-tailwind";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { agentStatus, readDeliveryEvidence, runAnalystTurn, setModelResolverForTests } from "../../src/local/agent";
import { generateDemoKeys } from "../../src/local/demo-identity";
import { localDemoRoutes } from "../../src/local/routes";
import { mockedPi, syntheticSnapshot } from "../../src/local/test-fixtures";

const live = process.env.WAREORB_E2E_LIVE === "1";
const shots = process.env.WAREORB_E2E_SHOTS ?? join(tmpdir(), "wareorb-e2e-shots");
let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

// Playwright is optional (not a project dependency): it is loaded from the machine if present.
type Browser = { newPage(o: object): Promise<any>; close(): Promise<void> };
let playwright: { chromium: { launch(): Promise<Browser> } };
const pwModule = "playwright";
try { playwright = await import(pwModule); } catch {
  console.log("SKIP  Playwright is not installed here. Install it once (`bunx playwright install chromium` in a scratch folder) or run this on a machine that has it.");
  process.exit(0);
}

const keys = await generateDemoKeys();
const snapshot = syntheticSnapshot(Date.now());
const convexServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async () => Response.json({ status: "success", value: JSON.parse(JSON.stringify(snapshot)), logLines: [] }) });
const convex = { port: convexServer.port!, stop: (force: boolean) => convexServer.stop(force) };

if (!live) {
  const { faux, resolved } = await mockedPi();
  setModelResolverForTests(async () => resolved);
  const script = () => [
    fauxAssistantMessage([fauxText("Checking the shared reorder plan. "), fauxToolCall("analyze_reorder", {})], { stopReason: "toolUse" }),
    fauxAssistantMessage("MOCKED PROVIDER: the plan recommends 12 units for RM5100 using 6 bays."),
  ];
  faux.setResponses([...script(), ...script()]);
}

// Build the harness page with the same browser settings the demo server uses.
const out = mkdtempSync(join(tmpdir(), "wareorb-harness-"));
const publicEnv = { BUN_PUBLIC_WAREORB_LOCAL_DEMO: "1", BUN_PUBLIC_CONVEX_URL: `http://127.0.0.1:${convex.port}`, BUN_PUBLIC_CONVEX_SITE_URL: `http://127.0.0.1:${convex.port + 1}`, BUN_PUBLIC_CLERK_PUBLISHABLE_KEY: "" };
const define = Object.fromEntries(Object.entries(publicEnv).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]));
const build = await Bun.build({ entrypoints: [join(import.meta.dir, "harness.html")], outdir: out, plugins: [tailwind], target: "browser", define: { ...define, "process.env.NODE_ENV": JSON.stringify("production") } });
if (!build.success) { for (const l of build.logs) console.error(l); process.exit(1); }

const port = 41_000 + Math.floor(Math.random() * 5_000);
const routes = localDemoRoutes({ port, convexUrl: `http://127.0.0.1:${convex.port}`, convexPort: convex.port, privateJwk: keys.privateJwk, agentSecret: "ef".repeat(32) }, { agentStatus, runAnalystTurn, readDeliveryEvidence });
const web = Bun.serve({
  hostname: "127.0.0.1", port, idleTimeout: 0, routes,
  fetch: async (req) => {
    const path = new URL(req.url).pathname;
    const file = Bun.file(join(out, path === "/" ? "harness.html" : path));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});

const browser = await playwright.chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 860, height: 700 } });
  const consoleErrors: string[] = [];
  page.on("pageerror", (e: Error) => consoleErrors.push(process.env.WAREORB_E2E_DEBUG ? `${e.message} ${e.stack?.slice(0, 600)}` : e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  console.log(`INFO  provider: ${live ? "LIVE (operator credentials)" : "MOCKED faux provider (scripted, not a live model)"}`);

  // Agent status bar.
  await page.waitForTimeout(1500).catch(() => {});
  if (process.env.WAREORB_E2E_DEBUG) console.log("DEBUG", consoleErrors, (await page.content()).slice(0, 1500));
  await page.getByText(live ? "Pi agent" : /Agent not connected|Pi agent/).first().waitFor({ timeout: 15_000 });

  // Ask a question → streamed answer with a visible tool call and its result.
  const input = page.getByPlaceholder(/Ask, or type/);
  await input.fill("What should we reorder and how much?");
  await input.press("Enter");
  const tool = page.locator("details", { hasText: "analyze_reorder" }).first();
  await tool.waitFor({ timeout: live ? 120_000 : 15_000 });
  await page.locator("text=/Pi · /").first().waitFor({ timeout: live ? 120_000 : 15_000 });
  await page.getByRole("button", { name: "Send" }).waitFor({ timeout: live ? 180_000 : 15_000 });
  check(await tool.isVisible(), "tool call analyze_reorder is shown");
  await tool.locator("summary").click();
  const toolText = await tool.innerText();
  check(/Arguments/.test(toolText) && /sharedLimits/.test(toolText) && /budgetLeftBeforePlanRM/.test(toolText), "tool arguments and the real tool result (shared plan) are visible");
  const answer = await page.locator("[data-slot='bubble'], .whitespace-pre-wrap").allInnerTexts();
  const answered = answer.join("\n");
  check(live ? /\d/.test(answered) : answered.includes("MOCKED PROVIDER: the plan recommends 12 units"), "the streamed answer text is rendered");
  check(await page.locator("text=/Pi · (mocked-provider|anthropic|openai)/").first().isVisible(), "the answering provider/model is labelled");
  await page.screenshot({ path: join(shots, "jarvis-agent.png") });

  // Measurements: unreadable input is an error, valid input gives labelled totals.
  const weight = page.getByLabel("Dining chair oak x2 Weight per item kg");
  await weight.fill("6kg");
  check(await page.getByText("Enter a number such as 12.5").first().isVisible(), "'6kg' is refused with a reason, not stored as unknown");
  check(await page.getByText("Fix the highlighted value before saving").isVisible(), "totals are withheld while input is unreadable");
  await weight.fill("6");
  check(await page.getByText("12 kg").first().isVisible() && await page.getByText(/per item: 2 × 6 kg per item/).isVisible(), "line weight 12 kg with its per-item working");
  const totals = await page.getByRole("status", { name: "Receipt totals" }).innerText();
  check(/Weight\s+52 kg/.test(totals) && /2 of 2 lines \(1 per item, 1 stated total\)/.test(totals), "receipt total 52 kg with its bases");
  check(/Volume unknown/.test(totals), "unknown volume stays unknown (no zero)");
  await page.getByLabel("Sofa x1 Weight per item kg").fill("30");
  check(await page.getByText(/Document states 40 kg total; counted values give 30 kg/).isVisible(), "a stated/calculated mismatch is shown");
  await page.screenshot({ path: join(shots, "measurements.png") });
  check(consoleErrors.filter((e) => !/WebSocket|convex|fetch/i.test(e)).length === 0, `no page errors (${consoleErrors.join(" | ") || "none"})`);
  console.log(`INFO  screenshots in ${shots}`);
} finally {
  await browser.close();
  web.stop(true);
  convex.stop(true);
  if (process.env.WAREORB_E2E_DEBUG) console.log("OUT", out); else rmSync(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} browser check(s) failed` : "All browser checks passed");
process.exit(failures ? 1 : 0);
