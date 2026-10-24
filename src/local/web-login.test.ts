// Web /login and /logout for the local agent. Keys here are labelled fakes; providers are Pi's MOCKED faux
// provider and the key check is a mocked verifier unless stated otherwise. Nothing contacts a real model.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  agentStatus, createWebRuntime, LOGGED_OUT, readDeliveryEvidence, redact, resolveModel, runAnalystTurn,
  setModelResolverForTests, setWebLoginForTests, verifyAnthropicKey, webLogin, webLogout, type AgentEvent, type KeyVerifier, type WebRuntimeFactory,
} from "./agent";
import { syntheticSnapshot } from "./test-fixtures";
import { warehouseTools } from "./warehouse-tools";

const VALID = "sk-ant-api03-MOCK-VALID-KEY-for-tests-only-0001";
const OTHER = "sk-ant-api03-MOCK-OTHER-KEY-for-tests-only-0002";
const BAD = "sk-ant-api03-MOCK-REVOKED-KEY-for-tests-only-9999";
const snapshot = syntheticSnapshot(Date.now());
const tools = () => warehouseTools(async () => snapshot, () => Date.now());
afterEach(() => setModelResolverForTests(null));

/** A labelled mocked provider standing in for "the provider this key unlocks". */
async function mockedProvider(name: string) {
  const faux = fauxProvider({ provider: name, models: [{ id: "mocked-model", name: `${name} (mocked)`, input: ["text", "image"] }] });
  const runtime = await ModelRuntime.create({ authPath: join(mkdtempSync(join(tmpdir(), "wareorb-weblogin-")), "auth.json"), modelsPath: null, refreshOnCreate: false });
  runtime.registerNativeProvider(faux.provider);
  return { faux, runtime, model: faux.getModel() as never };
}

/** Mocked key check: only VALID and OTHER are accepted; each maps to its own mocked provider. */
async function webMocks() {
  const providers = { [VALID]: await mockedProvider("mocked-claude-a"), [OTHER]: await mockedProvider("mocked-claude-b") };
  const runtime: WebRuntimeFactory = async (key) => {
    const p = providers[key as keyof typeof providers] ?? (await mockedProvider("mocked-claude-x"));
    return { runtime: p.runtime, model: p.model };
  };
  const verify: KeyVerifier = async (key) => (key in providers ? { ok: true } : { ok: false, error: `Claude rejected this API key (invalid or revoked): ${key}` });
  setWebLoginForTests({ runtime, verify });
  return providers;
}

async function ask(text = "Stock?", session = `s-${crypto.randomUUID()}`, signal?: AbortSignal) {
  const events: AgentEvent[] = [];
  await runAnalystTurn(session, text, tools, (e) => events.push(e), signal);
  return events;
}

describe("web login", () => {
  test("a valid key connects immediately and takes precedence over a preconfigured provider", async () => {
    const fallback = await mockedProvider("preconfigured-codex");
    fallback.faux.setResponses([fauxAssistantMessage("from the preconfigured provider")]);
    setModelResolverForTests(async () => ({ runtime: fallback.runtime, model: fallback.model }));
    expect(await agentStatus()).toMatchObject({ ready: true, connection: "preconfigured", provider: "preconfigured-codex" });
    const p = await webMocks();
    const r = await webLogin(`  ${VALID}  `);
    expect(r).toMatchObject({ ok: true, status: { ready: true, connection: "web", provider: "mocked-claude-a" } });
    // A page refresh asks for status again: still connected while the server runs.
    expect(await agentStatus()).toMatchObject({ connection: "web", provider: "mocked-claude-a" });
    p[VALID].faux.setResponses([fauxAssistantMessage("from the web login")]);
    expect((await ask()).at(-1)).toEqual({ type: "done", text: "from the web login" });
    expect(fallback.faux.state.callCount).toBe(0);
  });

  test("wrong keys, malformed input, errors and timeouts fail clearly, never echo the key, and change nothing", async () => {
    await webMocks();
    const bad = await webLogin(BAD);
    expect(bad).toMatchObject({ ok: false, status: { ready: false, connection: "none" } });
    if (!bad.ok) {
      expect(bad.error).toContain("Claude rejected this API key");
      expect(bad.error).not.toContain(BAD);
      expect(JSON.stringify(bad)).not.toContain("REVOKED-KEY");
    }
    expect(await webLogin("")).toMatchObject({ ok: false, error: "Enter a Claude API key." });
    expect(await webLogin("short")).toMatchObject({ ok: false, error: expect.stringContaining("does not look like a Claude API key") });
    expect(await webLogin("sk-ant-api03 with spaces inside it ok")).toMatchObject({ ok: false });
    expect(await webLogin(42)).toMatchObject({ ok: false });
    setWebLoginForTests({ verify: async (key) => { throw new TypeError(`fetch failed for ${key}`); } });
    const net = await webLogin(VALID);
    expect(net.ok).toBe(false);
    expect(JSON.stringify(net)).not.toContain("MOCK-VALID-KEY");
    expect(await agentStatus()).toMatchObject({ ready: false, connection: "none" });
  });

  test("the real key check is bounded: an aborted/timed-out check is a clear error (no network)", async () => {
    const model = (await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false })).getModel("anthropic", "claude-sonnet-5-5")!;
    const abort = new AbortController();
    abort.abort();
    expect(await verifyAnthropicKey(VALID, model, abort.signal)).toEqual({ ok: false, error: "Checking the key timed out. Check the internet connection and try again." });
    expect(redact(`bad key ${VALID} and sk-ant-oat01-something-else`, VALID)).toBe("bad key [redacted] and sk-ant-[redacted]");
  });

  test("an invalid or cancelled replacement keeps the existing connection", async () => {
    await webMocks();
    await webLogin(VALID);
    expect(await webLogin(BAD)).toMatchObject({ ok: false, status: { connection: "web", provider: "mocked-claude-a" } });
    const abort = new AbortController();
    setWebLoginForTests({ verify: async (_k, _m, signal) => await new Promise((resolve) => signal.addEventListener("abort", () => resolve({ ok: false, error: "Cancelled" }))) });
    const pending = webLogin(OTHER, abort.signal);
    abort.abort();
    expect(await pending).toMatchObject({ ok: false, status: { connection: "web", provider: "mocked-claude-a" } });
  });

  test("a different key creates fresh sessions with the new provider", async () => {
    const p = await webMocks();
    await webLogin(VALID);
    p[VALID].faux.setResponses([fauxAssistantMessage("A")]);
    expect((await ask("q", "session-switch-1")).at(-1)).toEqual({ type: "done", text: "A" });
    await webLogin(OTHER);
    p[OTHER].faux.setResponses([fauxAssistantMessage("B")]);
    const after = await ask("q", "session-switch-1");
    expect(after[0]).toMatchObject({ type: "status", provider: "mocked-claude-b" });
    expect(after.at(-1)).toEqual({ type: "done", text: "B" });
  });
});

describe("web logout", () => {
  test("disables chat and extraction without silently falling back to a preconfigured provider", async () => {
    const fallback = await mockedProvider("preconfigured-codex");
    let fallbackUsed = 0;
    setModelResolverForTests(async () => { fallbackUsed++; return { runtime: fallback.runtime, model: fallback.model }; });
    await webMocks();
    await webLogin(VALID);
    fallbackUsed = 0;
    expect(await webLogout()).toEqual({ ready: false, connection: "none", reason: LOGGED_OUT, loggedOut: true });
    expect(await ask()).toEqual([{ type: "error", message: LOGGED_OUT, setup: true }]);
    expect(await readDeliveryEvidence({ catalogue: [], evidence: [{ kind: "note", text: "2 chairs" }] })).toEqual({ error: LOGGED_OUT });
    expect(await resolveModel()).toEqual({ error: LOGGED_OUT });
    expect(fallbackUsed).toBe(0);
  });

  test("stops an answer in progress and retires its session", async () => {
    const p = await webMocks();
    await webLogin(VALID);
    let release = () => {};
    p[VALID].faux.setResponses([async () => { await new Promise<void>((r) => (release = r)); return fauxAssistantMessage("late answer with the old key"); }]);
    const turn = ask("slow", "session-logout-busy");
    await Bun.sleep(30);
    await webLogout();
    release();
    const events = await turn;
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("connection changed") });
    // The same browser session cannot reach the old key afterwards.
    expect(await ask("again", "session-logout-busy")).toEqual([{ type: "error", message: LOGGED_OUT, setup: true }]);
  });

  test("stops a photo reading in progress", async () => {
    const p = await webMocks();
    await webLogin(VALID);
    let release = () => {};
    p[VALID].faux.setResponses([async () => { await new Promise<void>((r) => (release = r)); return fauxAssistantMessage("no draft"); }]);
    const reading = readDeliveryEvidence({ catalogue: [], evidence: [{ kind: "note", text: "2 chairs" }] });
    await Bun.sleep(30);
    await webLogout();
    release();
    expect(await reading).toEqual({ error: expect.stringContaining("connection changed") });
  });

  test("a logout during a pending login wins; concurrent logins never restore an older one", async () => {
    await webMocks();
    let releaseSlow = () => {};
    setWebLoginForTests({ verify: async () => { await new Promise<void>((r) => (releaseSlow = r)); return { ok: true }; } });
    const slow = webLogin(VALID);
    await Bun.sleep(10);
    await webLogout();
    releaseSlow();
    expect(await slow).toMatchObject({ ok: false, error: expect.stringContaining("replaced by a newer login or a logout") });
    expect(await agentStatus()).toMatchObject({ ready: false, loggedOut: true });

    let releaseFirst = () => {};
    let calls = 0;
    setWebLoginForTests({ verify: async () => { if (++calls === 1) await new Promise<void>((r) => (releaseFirst = r)); return { ok: true }; } });
    const first = webLogin(VALID);
    await Bun.sleep(10);
    expect(await webLogin(OTHER)).toMatchObject({ ok: true, status: { provider: "mocked-claude-b" } });
    releaseFirst();
    expect(await first).toMatchObject({ ok: false });
    expect(await agentStatus()).toMatchObject({ connection: "web", provider: "mocked-claude-b" });
  });
});

describe("credential scope", () => {
  test("the real web runtime keeps the key in memory and never touches Pi's shared auth file", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "wareorb-shared-pi-"));
    const shared = JSON.stringify({ "openai-codex": { type: "oauth", access: "shared-operator-token" } });
    writeFileSync(join(agentDir, "auth.json"), shared);
    const before = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      setWebLoginForTests({ runtime: createWebRuntime, verify: async () => ({ ok: true }) });
      const r = await webLogin(VALID);
      expect(r).toMatchObject({ ok: true, status: { connection: "web", provider: "anthropic", model: "claude-sonnet-5-5", modelName: expect.any(String) } });
      const resolved = await resolveModel();
      if ("error" in resolved) throw new Error(resolved.error);
      expect(JSON.stringify(await resolved.runtime.getAuth("anthropic"))).toContain(VALID);
      expect(JSON.stringify(r)).not.toContain(VALID);
      await webLogout();
      expect(readFileSync(join(agentDir, "auth.json"), "utf8")).toBe(shared);
      expect(readdirSync(agentDir)).toEqual(["auth.json"]);
    } finally {
      if (before === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = before;
    }
  });
});
