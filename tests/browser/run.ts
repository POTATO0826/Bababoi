#!/usr/bin/env bun
// Browser test (Chromium via Playwright): the real Jarvis chat streams a turn from the real local demo
// routes — Pi agent → warehouse tool → presenter-authorised (fake) local Convex query — and the receipt
// measurement inputs show honest totals. `bun run test:browser`.
// The page starts disconnected and connects through the real Jarvis /login form.
// Default: MOCKED key check + Pi's MOCKED faux provider (labelled). WAREORB_E2E_LIVE=1 types the key from
// WAREORB_E2E_CLAUDE_KEY (or ANTHROPIC_API_KEY) into the form and checks it with the real Anthropic API
// (synthetic data only; the key is never written anywhere).
import tailwind from "bun-plugin-tailwind";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { agentStatus, readDeliveryEvidence, runAnalystTurn, setModelResolverForTests, setWebLoginForTests, webLogin, webLogout } from "../../src/local/agent";
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

const MOCK_KEY = "sk-ant-api03-MOCKED-BROWSER-TEST-KEY-not-real-0001";
const liveKey = process.env.WAREORB_E2E_CLAUDE_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
if (live && !liveKey) { console.log("SKIP  WAREORB_E2E_LIVE=1 needs WAREORB_E2E_CLAUDE_KEY or ANTHROPIC_API_KEY in this shell."); process.exit(0); }
const validKey = live ? liveKey : MOCK_KEY;
const wrongKey = "sk-ant-api03-WRONG-browser-test-key-000000000000000000";
// Start disconnected: no preconfigured provider, so only the web login can connect the agent.
setModelResolverForTests(async () => ({ error: "No agent provider is configured. Use Log in in Jarvis (or type /login) to connect a Claude API key." }));
if (!live) {
  const { faux, resolved } = await mockedPi();
  setWebLoginForTests({ runtime: async () => resolved, verify: async (key) => (key === MOCK_KEY ? { ok: true } : { ok: false, error: "Claude rejected this API key (invalid or revoked). Check the key and try again." }) });
  const script = () => [
    fauxAssistantMessage([fauxText("Checking the shared reorder plan. "), fauxToolCall("analyze_reorder", {})], { stopReason: "toolUse" }),
    fauxAssistantMessage("MOCKED PROVIDER: the plan recommends 12 units for RM5100 using 6 bays."),
  ];
  faux.setResponses([...script(), ...script(), ...script()]);
}

// Build the harness page with the same browser settings the demo server uses.
const out = mkdtempSync(join(tmpdir(), "wareorb-harness-"));
const publicEnv = { BUN_PUBLIC_WAREORB_LOCAL_DEMO: "1", BUN_PUBLIC_CONVEX_URL: `http://127.0.0.1:${convex.port}`, BUN_PUBLIC_CONVEX_SITE_URL: `http://127.0.0.1:${convex.port + 1}`, BUN_PUBLIC_CLERK_PUBLISHABLE_KEY: "" };
const define = Object.fromEntries(Object.entries(publicEnv).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]));
const build = await Bun.build({ entrypoints: [join(import.meta.dir, "harness.html")], outdir: out, plugins: [tailwind], target: "browser", define: { ...define, "process.env.NODE_ENV": JSON.stringify("production") } });
if (!build.success) { for (const l of build.logs) console.error(l); process.exit(1); }
// The complete app bundle too (served under /app/): it must boot with the demo settings.
const appOut = join(out, "app");
const appBuild = await Bun.build({ entrypoints: [join(import.meta.dir, "../../src/index.html")], outdir: appOut, plugins: [tailwind], target: "browser", define: { ...define, "process.env.NODE_ENV": JSON.stringify("production") } });
if (!appBuild.success) { for (const l of appBuild.logs) console.error(l); process.exit(1); }

const port = 41_000 + Math.floor(Math.random() * 5_000);
const routes = localDemoRoutes({ port, convexUrl: `http://127.0.0.1:${convex.port}`, convexPort: convex.port, privateJwk: keys.privateJwk, agentSecret: "ef".repeat(32) }, { agentStatus, runAnalystTurn, readDeliveryEvidence, login: webLogin, logout: webLogout });
const web = Bun.serve({
  hostname: "127.0.0.1", port, idleTimeout: 0, routes,
  fetch: async (req) => {
    const path = new URL(req.url).pathname;
    const file = Bun.file(join(out, path === "/" ? "harness.html" : path === "/app/" ? "app/index.html" : path));
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

  const T = live ? 120_000 : 15_000;
  const input = page.getByPlaceholder(/Ask, or type/);
  const dialog = page.getByRole("dialog");
  const keyField = page.getByLabel("Claude API key");
  const secretsVisible = async (...secrets: string[]) => {
    const text = `${await page.content()}${await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))}`;
    return secrets.some((x) => text.includes(x));
  };

  // 1. Disconnected: a visible Log in action and /login in the menu.
  await page.getByText("Jarvis not connected").first().waitFor({ timeout: 15_000 });
  check(await page.getByRole("button", { name: "Log in" }).first().isVisible(), "disconnected status shows a Log in button");
  await input.fill("/");
  check(await page.getByRole("option", { name: /\/login/ }).isVisible(), "typing / suggests /login");
  check(await page.getByRole("option", { name: /\/receive/ }).isVisible(), "warehouse commands are still in the menu");

  // 2. /login + Enter opens the masked form; a wrong key gives a clear error and stays disconnected.
  await input.fill("/login");
  await input.press("Enter");
  await dialog.waitFor({ timeout: 5_000 });
  check(await keyField.getAttribute("type") === "password", "the key field is masked (password input)");
  check(await page.evaluate(() => document.activeElement?.id) === "agent-api-key", "focus moves to the key field");
  await keyField.fill(wrongKey);
  await keyField.press("Enter");
  const alert = dialog.getByRole("alert");
  await alert.waitFor({ timeout: T });
  await page.screenshot({ path: join(shots, "login-form-error.png") });
  check(/rejected|invalid|not allowed/i.test(await alert.innerText()), `a wrong key shows a useful error ("${(await alert.innerText()).slice(0, 80)}")`);
  check(!(await secretsVisible(wrongKey.slice(14))), "the wrong key is not echoed anywhere on the page");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(await page.getByText("Jarvis not connected").first().isVisible(), "cancelling leaves the agent disconnected");

  // 3. Mouse: the Log in button opens an empty form; a valid key connects without a restart.
  await page.getByRole("button", { name: "Log in" }).first().click();
  await dialog.waitFor();
  check(await keyField.inputValue() === "", "the form reopens empty (the key was cleared)");
  await keyField.fill(validKey);
  await dialog.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).waitFor({ timeout: T });
  check(await dialog.waitFor({ state: "hidden", timeout: 5_000 }).then(() => true, () => false), "the form closes after a successful login");
  check(await page.getByRole("button", { name: "Log out", exact: true }).waitFor({ timeout: 5_000 }).then(() => true, () => false), "connected status shows a Log out button");
  check(!(await secretsVisible(validKey)), "the key is not in the page, transcript or browser storage");
  check(await page.getByText(live ? "Connected · Claude" : "Connected · mocked-provider").first().isVisible(), "status shows Connected · <provider> with the model");
  const statusText = await page.locator("text=/Connected · /").first().innerText();
  console.log(`INFO  status: ${statusText}`);

  // 4. Ask a question → streamed answer with a visible tool call and its result.
  await input.fill("What should we reorder and how much?");
  await input.press("Enter");
  const tool = page.locator("details", { hasText: "analyze_reorder" }).first();
  await tool.waitFor({ timeout: T });
  await page.locator("text=/Jarvis · /").first().waitFor({ timeout: T });
  await page.getByRole("button", { name: "Send" }).waitFor({ timeout: live ? 180_000 : 15_000 });
  check(await tool.isVisible(), "tool call analyze_reorder is shown");
  await tool.locator("summary").click();
  const toolText = await tool.innerText();
  check(/Arguments/.test(toolText) && /sharedLimits/.test(toolText) && /budgetLeftBeforePlanRM/.test(toolText), "tool arguments and the real tool result (shared plan) are visible");
  const answer = await page.locator("[data-slot='bubble'], .whitespace-pre-wrap").allInnerTexts();
  const answered = answer.join("\n");
  check(live ? /\d/.test(answered) : answered.includes("MOCKED PROVIDER: the plan recommends 12 units"), "the streamed answer text is rendered");
  check(await page.locator(live ? "text=/Jarvis · Claude · claude-/" : "text=/Jarvis · mocked-provider · mocked-model/").first().isVisible(), "the answer footer names Jarvis, the provider and the model");
  const visible = await page.locator("body").innerText();
  check(!/\bPi\b|Pi agent|pi\.dev|\bSDK\b/.test(visible), "no Pi or SDK wording anywhere on the page");
  await page.screenshot({ path: join(shots, "jarvis-agent.png") });

  // 5. Secrets typed into the chat are never recorded or sent.
  const pasted = "sk-ant-api03-PASTED-INTO-CHAT-by-mistake-1234567890";
  await input.fill(`/login ${pasted}`);
  await input.press("Enter");
  await dialog.waitFor();
  check(!(await secretsVisible(pasted.slice(14))), "'/login <key>' opens the masked form and the text is not recorded");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await input.fill(pasted);
  await input.press("Enter");
  await page.getByText("That looked like an API key").first().waitFor({ timeout: 5_000 });
  check(!(await secretsVisible(pasted.slice(14))), "a pasted key is refused and not shown in the chat");
  if (await dialog.isVisible()) { await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" }); }
  check(await page.getByText(/Connected · /).first().isVisible(), "the connection is intact after cancelling a replacement login");

  // 6. /logout chosen with the mouse disconnects; the next question cannot use the old key.
  await input.fill("/logout");
  await page.getByRole("option", { name: /\/logout/ }).click();
  await page.getByText("Jarvis not connected").first().waitFor({ timeout: 10_000 });
  check(await page.getByText(/Logged out\. Jarvis is disconnected/).waitFor({ timeout: 10_000 }).then(() => true, () => false), "/logout disconnects and says so");
  await input.fill("How many sofas?");
  await input.press("Enter");
  check(await page.getByRole("alert").filter({ hasText: /Jarvis is logged out/i }).last().waitFor({ timeout: 10_000 }).then(() => true, () => false), "after logout a question is refused (no fallback, no old key)");

  // 7. Ordinary warehouse commands still work locally.
  await input.fill("/replenish");
  await input.press("Enter");
  check(await page.getByText("Replenish is open.").last().isVisible(), "/replenish still opens its panel");

  // 8. Reconnect with /login (Enter on the suggestion) and refresh: still connected while the server runs.
  await input.fill("/log");
  await page.getByRole("option", { name: /\/login/ }).waitFor();
  await input.press("Enter");
  await dialog.waitFor();
  await keyField.fill(validKey);
  await keyField.press("Enter");
  // The status bar (not an earlier chat message) must show the new connection before the refresh.
  await dialog.waitFor({ state: "hidden", timeout: T });
  await page.getByRole("button", { name: "Log out", exact: true }).waitFor({ timeout: T });
  await page.reload();
  await page.getByRole("button", { name: "Log out", exact: true }).waitFor({ timeout: 15_000 });
  check(true, "reconnected, and still connected after a page refresh");
  check(!(await secretsVisible(validKey)), "the key is not in the refreshed page or browser storage");

  // The complete app boots (no blank page): without the local Convex sync server it waits at its access screen.
  const app = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const appErrors: string[] = [];
  app.on("pageerror", (e: Error) => appErrors.push(e.message));
  await app.goto(`http://127.0.0.1:${port}/app/`);
  const booted = await app.getByText(/Opening WareOrb|WareOrb/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  check(booted && !appErrors.some((e) => /process is not defined/.test(e)), `the complete app bundle boots in local demo mode (${appErrors.join(" | ") || "no page errors"})`);
  await app.close();

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
} catch (e) {
  failures++;
  console.log(`FAIL  ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  for (const p of (browser as unknown as { contexts(): { pages(): { screenshot(o: object): Promise<unknown> }[] }[] }).contexts().flatMap((c) => c.pages())) await p.screenshot({ path: join(shots, "failure.png") }).catch(() => {});
} finally {
  await browser.close();
  web.stop(true);
  convex.stop(true);
  if (process.env.WAREORB_E2E_DEBUG) console.log("OUT", out); else rmSync(out, { recursive: true, force: true });
}
console.log(failures ? `${failures} browser check(s) failed` : "All browser checks passed");
process.exit(failures ? 1 : 0);
