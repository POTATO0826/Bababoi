// The local demo HTTP routes over real loopback sockets: a fake local Convex endpoint serves the synthetic
// snapshot (and checks the presenter's signed token); the agent uses Pi's MOCKED faux provider.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { LOCAL_DEMO_AUDIENCE, LOCAL_DEMO_ISSUER, LOCAL_DEMO_PRESENTER } from "../domain/local-demo";
import { readDeliveryEvidence, runAnalystTurn, setModelResolverForTests, setWebLoginForTests, agentStatus, webLogin, webLogout, type AgentEvent } from "./agent";
import { streamAgentChat } from "./agent-client";
import { generateDemoKeys } from "./demo-identity";
import { localDemoRoutes, type AgentOps } from "./routes";
import { mockedPi, syntheticSnapshot } from "./test-fixtures";

const SECRET = "ab".repeat(32);
const snapshot = syntheticSnapshot(Date.now());
let keys: Awaited<ReturnType<typeof generateDemoKeys>>;
let convex: ReturnType<typeof Bun.serve>;
const convexCalls: { path: string; claims: Record<string, unknown> | null }[] = [];

async function verify(token: string): Promise<Record<string, unknown> | null> {
  const jwks = JSON.parse(atob(keys.jwksDataUri.split(",")[1]!)) as { keys: JsonWebKey[] };
  const key = await crypto.subtle.importKey("jwk", jwks.keys[0]!, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const [h, p, sig] = token.split(".");
  const raw = Uint8Array.from(atob(sig!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, raw, new TextEncoder().encode(`${h}.${p}`));
  return ok ? JSON.parse(atob(p!.replace(/-/g, "+").replace(/_/g, "/"))) : null;
}

beforeAll(async () => {
  keys = await generateDemoKeys();
  // Stand-in for the local Convex backend's HTTP query API (what ConvexHttpClient calls).
  convex = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: async (req) => {
      const body = (await req.json()) as { path: string };
      const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const claims = token ? await verify(token) : null;
      convexCalls.push({ path: body.path, claims });
      if (claims?.sub !== LOCAL_DEMO_PRESENTER.subject) return Response.json({ status: "error", errorMessage: "Sign in" });
      return Response.json({ status: "success", value: JSON.parse(JSON.stringify(snapshot)), logLines: [] });
    },
  });
});
afterAll(() => convex.stop(true));
afterEach(() => setModelResolverForTests(null));

const realOps: AgentOps = { agentStatus, runAnalystTurn, readDeliveryEvidence, login: webLogin, logout: webLogout };

function serve(ops: AgentOps = realOps) {
  const port = 40_000 + Math.floor(Math.random() * 10_000);
  const routes = localDemoRoutes({ port, convexUrl: `http://127.0.0.1:${convex.port}`, convexPort: convex.port, privateJwk: keys.privateJwk, agentSecret: SECRET }, ops);
  const server = Bun.serve({ hostname: "127.0.0.1", port, idleTimeout: 0, routes, fetch: () => new Response("not found", { status: 404 }) });
  const base = `http://127.0.0.1:${port}`;
  const local: typeof fetch = ((input: string, init?: RequestInit) => fetch(`${base}${input}`, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: base } })) as typeof fetch;
  return { server, base, local };
}

describe("configuration refuses anything but this computer", () => {
  test.each([
    ["https://descriptive-lemur-152.convex.cloud", /127\.0\.0\.1/],
    ["http://127.0.0.1:3210@admired-swordfish-390.convex.cloud", /admired-swordfish/],
    ["http://localhost:3210", /not localhost/],
  ])("Convex URL %s", (convexUrl, why) => {
    expect(() => localDemoRoutes({ port: 3000, convexUrl, privateJwk: "{}", agentSecret: SECRET }, realOps)).toThrow(why);
  });
  test("port mismatch and a weak bridge secret", () => {
    expect(() => localDemoRoutes({ port: 3000, convexUrl: "http://127.0.0.1:3210", convexPort: 3999, privateJwk: "{}", agentSecret: SECRET }, realOps)).toThrow(/expects 3999/);
    expect(() => localDemoRoutes({ port: 3000, convexUrl: "http://127.0.0.1:3210", privateJwk: "{}", agentSecret: "short" }, realOps)).toThrow(/64-character hex/);
  });
});

describe("presenter identity and agent routes", () => {
  test("token only for this page (Host and Origin checked)", async () => {
    const { server, base } = serve();
    try {
      const ok = await fetch(`${base}/api/demo/token`);
      const { token } = (await ok.json()) as { token: string };
      expect(await verify(token)).toMatchObject({ iss: LOCAL_DEMO_ISSUER, aud: LOCAL_DEMO_AUDIENCE, sub: LOCAL_DEMO_PRESENTER.subject });
      expect((await fetch(`${base}/api/demo/token`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
      expect((await fetch(`${base}/api/demo/token`, { headers: { Host: "evil.example" } })).status).toBe(403);
      expect((await fetch(`${base}/api/agent/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" })).status).toBe(403);
      expect((await fetch(`${base}/api/agent/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ sessionId: "x", text: "" }) })).status).toBe(400);
    } finally { server.stop(true); }
  });

  test("status reports a missing login without calling a provider", async () => {
    setModelResolverForTests(async () => ({ error: "No agent provider is configured. (mocked)" }));
    const { server, base } = serve();
    try {
      expect(await (await fetch(`${base}/api/agent/status`)).json()).toEqual({ ready: false, connection: "none", reason: "No agent provider is configured. (mocked)" });
    } finally { server.stop(true); }
  });

  test("end to end over HTTP: SSE → Pi (mocked provider) → warehouse tool → presenter-authorised local Convex query", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([
      fauxAssistantMessage([fauxText("Looking. "), fauxToolCall("get_inventory", { search: "sofa" })], { stopReason: "toolUse" }),
      fauxAssistantMessage("Sofas are in stock."),
    ]);
    const { server, local } = serve();
    convexCalls.length = 0;
    try {
      const events: AgentEvent[] = [];
      const outcome = await streamAgentChat({ sessionId: "http-e2e-session", text: "Which sofas do we have?", fetchImpl: local }, (e) => events.push(e));
      expect(outcome).toBe("done");
      expect(events.map((e) => e.type).filter((t, i, all) => t !== all[i - 1])).toEqual(["status", "text", "tool_start", "tool_end", "text", "done"]);
      const result = (events.find((e) => e.type === "tool_end") as { result: { items: { sku: string }[] } }).result;
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((i) => i.sku.startsWith("SOFA"))).toBe(true);
      expect(convexCalls).toEqual([{ path: "ledger:snapshot", claims: expect.objectContaining({ sub: LOCAL_DEMO_PRESENTER.subject, aud: LOCAL_DEMO_AUDIENCE }) }]);
    } finally { server.stop(true); }
  });

  test("closing the stream (Stop) aborts the agent turn on the server", async () => {
    let seen: AbortSignal | undefined;
    const ops: AgentOps = {
      ...realOps,
      runAnalystTurn: async (_id, _text, _tools, emit, signal) => {
        seen = signal;
        emit({ type: "status", model: "mocked/slow", provider: "mocked" });
        await new Promise<void>((r) => signal!.addEventListener("abort", () => r(), { once: true }));
      },
    };
    const { server, local } = serve(ops);
    try {
      const abort = new AbortController();
      const events: AgentEvent[] = [];
      const done = streamAgentChat({ sessionId: "http-cancel-session", text: "slow", signal: abort.signal, fetchImpl: local }, (e) => { events.push(e); if (e.type === "status") abort.abort(); });
      expect(await done).toBe("cancelled");
      for (let i = 0; i < 50 && !seen?.aborted; i++) await Bun.sleep(10);
      expect(seen?.aborted).toBe(true);
    } finally { server.stop(true); }
  });
});

describe("extraction bridge (Convex action → local agent service)", () => {
  const post = (base: string, auth: string, body: unknown, host?: string) => fetch(`${base}/internal/extract-receipt`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", ...(host ? { Host: host } : {}) }, body: JSON.stringify(body) });

  test("requires the bridge secret and a valid body", async () => {
    const { server, base } = serve();
    try {
      expect((await post(base, "Bearer wrong", { catalogue: [], evidence: [] })).status).toBe(401);
      expect((await post(base, `Bearer ${SECRET}`, { catalogue: [], evidence: [] }, "evil.example")).status).toBe(401);
      expect((await post(base, `Bearer ${SECRET}`, { catalogue: "x" })).status).toBe(400);
    } finally { server.stop(true); }
  });

  test("returns the structured draft, or the reading error as 422 (mocked provider)", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    const { server, base } = serve();
    try {
      faux.setResponses([fauxAssistantMessage([fauxToolCall("submit_receipt_draft", { supplier: "S", docRef: null, lines: [{ rawText: "2 chairs", skuCode: null, candidates: [], qty: 2, unit: null, condition: null, packageCount: null, packageDimsCm: null, itemWeightKg: null, packageWeightKg: null, statedTotalWeightKg: null, confidence: 0.5, questions: [] }], unreadable: [] })], { stopReason: "toolUse" }), fauxAssistantMessage("ok")]);
      const ok = await post(base, `Bearer ${SECRET}`, { catalogue: [], evidence: [{ kind: "note", text: "2 chairs" }] });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ supplier: "S", model: "mocked-provider/mocked-model", lines: [{ rawText: "2 chairs", qty: 2 }] });
      faux.setResponses([fauxAssistantMessage("I cannot read this.")]);
      const bad = await post(base, `Bearer ${SECRET}`, { catalogue: [], evidence: [{ kind: "note", text: "??" }] });
      expect(bad.status).toBe(422);
      expect(await bad.json()).toEqual({ error: "The model returned no structured draft. Enter the counted lines by hand." });
    } finally { server.stop(true); }
  });
});

describe("web login routes (mocked key check and provider)", () => {
  const KEY = "sk-ant-api03-MOCK-ROUTE-KEY-for-tests-only-0001";
  async function mockLogin() {
    const { resolved } = await mockedPi();
    setModelResolverForTests(async () => ({ error: "No agent provider is configured. (mocked)" }));
    setWebLoginForTests({ runtime: async () => resolved, verify: async (key) => (key === KEY ? { ok: true } : { ok: false, error: `rejected ${key}` }) });
  }
  const post = (base: string, path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, ...headers }, body });

  test("only this exact page (protocol, host, port), with JSON, small bodies, may log in or out", async () => {
    await mockLogin();
    const { server, base } = serve();
    const port = new URL(base).port;
    try {
      const body = JSON.stringify({ provider: "anthropic", apiKey: KEY });
      const refused: [Record<string, string>, number][] = [
        [{ Origin: "https://evil.example" }, 403],
        [{ Origin: `https://127.0.0.1:${port}` }, 403],
        [{ Origin: `http://127.0.0.1:${Number(port) + 1}` }, 403],
        [{ Origin: `http://127.0.0.1.evil.example:${port}` }, 403],
        [{ Origin: `http://localhost:${port}` }, 403], // origin must match the Host it was sent to
        [{ Host: "evil.example" }, 403],
        [{ "Content-Type": "text/plain" }, 403],
      ];
      for (const [headers, status] of refused) {
        for (const path of ["/api/agent/login", "/api/agent/logout"]) expect((await post(base, path, body, headers)).status).toBe(status);
      }
      const noOrigin = await fetch(`${base}/api/agent/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      expect(noOrigin.status).toBe(403);
      expect((await post(base, "/api/agent/login", JSON.stringify({ apiKey: KEY, pad: "x".repeat(5000) }))).status).toBe(413);
      expect((await post(base, "/api/agent/login", JSON.stringify({ provider: "openai", apiKey: KEY }))).status).toBe(400);
      expect((await post(base, "/api/agent/login", "not json")).status).toBe(400);
      expect(await agentStatus()).toMatchObject({ ready: false });
    } finally { server.stop(true); }
  });

  test("login, refresh and logout over HTTP; responses never contain the key and are not cached", async () => {
    await mockLogin();
    const { server, base } = serve();
    try {
      const bad = await post(base, "/api/agent/login", JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-api03-MOCK-WRONG-KEY-for-tests-0000" }));
      expect(bad.status).toBe(422);
      expect(bad.headers.get("cache-control")).toBe("no-store");
      const badText = await bad.text();
      expect(badText).not.toContain("MOCK-WRONG-KEY");
      expect(JSON.parse(badText)).toMatchObject({ ok: false, status: { ready: false } });

      const ok = await post(base, "/api/agent/login", JSON.stringify({ provider: "anthropic", apiKey: KEY }));
      expect(ok.status).toBe(200);
      const okText = await ok.text();
      expect(okText).not.toContain(KEY);
      expect(JSON.parse(okText)).toMatchObject({ ok: true, status: { ready: true, connection: "web", provider: "mocked-provider" } });
      expect(await (await fetch(`${base}/api/agent/status`)).json()).toMatchObject({ ready: true, connection: "web" });

      const out = await post(base, "/api/agent/logout", "{}");
      expect(await out.json()).toMatchObject({ ok: true, status: { ready: false, loggedOut: true } });
      expect(await (await fetch(`${base}/api/agent/status`)).json()).toMatchObject({ ready: false, loggedOut: true });
      const events: AgentEvent[] = [];
      await streamAgentChat({ sessionId: "after-logout-session", text: "stock?", fetchImpl: (((i: string, init?: RequestInit) => fetch(`${base}${i}`, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: base } })) as typeof fetch) }, (e) => events.push(e));
      expect(events).toEqual([{ type: "error", message: expect.stringContaining("logged out"), setup: true }]);
    } finally { server.stop(true); }
  });
});
