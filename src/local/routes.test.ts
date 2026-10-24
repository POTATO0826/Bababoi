// The local demo HTTP routes over real loopback sockets: a fake local Convex endpoint serves the synthetic
// snapshot (and checks the presenter's signed token); the agent uses Pi's MOCKED faux provider.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { LOCAL_DEMO_AUDIENCE, LOCAL_DEMO_ISSUER, LOCAL_DEMO_PRESENTER } from "../domain/local-demo";
import { readDeliveryEvidence, runAnalystTurn, setModelResolverForTests, setWebLoginForTests, agentStatus, webLogin, webLogout, type AgentEvent } from "./agent";
import { streamAgentChat } from "./agent-client";
import { generateDemoKeys } from "./demo-identity";
import * as lalamove from "./lalamove";
import { MOCK_KEY, MOCK_SECRET, mockLalamove } from "./lalamove-mock";
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
      expect(await bad.json()).toEqual({ error: "Jarvis couldn't turn this evidence into receipt lines. Try a clearer photo or note, or enter the counted lines by hand." });
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

describe("Lalamove sandbox routes (MOCKED Lalamove; not live evidence)", () => {
  const post = (base: string, path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, ...headers }, body });
  const creds = JSON.stringify({ environment: "sandbox", market: "MY", apiKey: MOCK_KEY, apiSecret: MOCK_SECRET });
  afterEach(() => { lalamove.disconnectLalamove(); lalamove.setLalamoveFetchForTests(null); });

  test("only this exact page, with JSON and small bodies, may connect, test, list or disconnect", async () => {
    const m = mockLalamove();
    lalamove.setLalamoveFetchForTests(m.fetch);
    const { server, base } = serve();
    const port = new URL(base).port;
    try {
      const refused: Record<string, string>[] = [
        { Origin: "https://evil.example" },
        { Origin: `https://127.0.0.1:${port}` },
        { Origin: `http://127.0.0.1:${Number(port) + 1}` },
        { Origin: `http://localhost:${port}` },
        { Host: "evil.example" },
        { "Content-Type": "text/plain" },
      ];
      for (const headers of refused) {
        for (const path of ["/api/lalamove/connect", "/api/lalamove/test", "/api/lalamove/services", "/api/lalamove/disconnect"]) expect((await post(base, path, creds, headers)).status).toBe(403);
      }
      expect((await fetch(`${base}/api/lalamove/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: creds })).status).toBe(403);
      expect((await fetch(`${base}/api/lalamove/status`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
      expect((await post(base, "/api/lalamove/connect", JSON.stringify({ apiKey: MOCK_KEY, apiSecret: MOCK_SECRET, pad: "x".repeat(5000) }))).status).toBe(413);
      expect((await post(base, "/api/lalamove/connect", JSON.stringify({ environment: "production", apiKey: MOCK_KEY, apiSecret: MOCK_SECRET }))).status).toBe(400);
      expect((await post(base, "/api/lalamove/connect", JSON.stringify({ market: "SG", apiKey: MOCK_KEY, apiSecret: MOCK_SECRET }))).status).toBe(400);
      expect((await post(base, "/api/lalamove/connect", "not json")).status).toBe(400);
      // Nothing reached Lalamove and nothing connected.
      expect(m.calls).toEqual([]);
      expect(lalamove.lalamoveStatus().connected).toBe(false);
    } finally { server.stop(true); }
  });

  test("connect, test, services and disconnect over HTTP; responses never contain the key or secret and are not cached", async () => {
    const m = mockLalamove();
    lalamove.setLalamoveFetchForTests(m.fetch);
    const { server, base } = serve();
    try {
      const wrong = await post(base, "/api/lalamove/connect", JSON.stringify({ apiKey: MOCK_KEY, apiSecret: "sk_test_MOCKWRONGSECRET000000000000000000000" }));
      expect(wrong.status).toBe(422);
      expect(wrong.headers.get("cache-control")).toBe("no-store");
      const wrongText = await wrong.text();
      expect(wrongText).not.toContain("MOCKWRONGSECRET");
      expect(wrongText).not.toContain(MOCK_KEY);
      expect(JSON.parse(wrongText)).toMatchObject({ ok: false, error: expect.stringContaining("rejected"), status: { connected: false } });

      const ok = await post(base, "/api/lalamove/connect", creds);
      expect(ok.status).toBe(200);
      const okText = await ok.text();
      for (const secret of [MOCK_KEY, MOCK_SECRET]) expect(okText).not.toContain(secret);
      expect(JSON.parse(okText)).toMatchObject({ ok: true, status: { connected: true, environment: "sandbox", market: "MY" } });

      const status = await fetch(`${base}/api/lalamove/status`);
      expect(status.headers.get("cache-control")).toBe("no-store");
      const statusText = await status.text();
      for (const secret of [MOCK_KEY, MOCK_SECRET]) expect(statusText).not.toContain(secret);
      expect(JSON.parse(statusText)).toMatchObject({ connected: true });

      const tested = await post(base, "/api/lalamove/test", "{}");
      expect(await tested.json()).toMatchObject({ ok: true, status: { connected: true } });
      const services = await (await post(base, "/api/lalamove/services", JSON.stringify({ refresh: true }))).json() as { source: string; services: { key: string }[] };
      expect(services.source).toBe("lalamove");
      expect(services.services.map((x) => x.key)).toContain("VAN");

      const out = await post(base, "/api/lalamove/disconnect", "{}");
      expect(await out.json()).toMatchObject({ ok: true, status: { connected: false } });
      expect(await (await post(base, "/api/lalamove/services", "{}")).json()).toMatchObject({ source: "none", services: [] });
      // Only the allowlisted sandbox endpoints were called, each one signed.
      for (const c of m.calls) {
        expect(c.url.startsWith(`${lalamove.SANDBOX_URL}/v3/`)).toBe(true);
        expect(c.path).not.toContain("/orders");
      }
    } finally { server.stop(true); }
  });

  test("the Convex quote bridge requires the bridge secret and a valid job; a disconnected Lalamove is a failure, not a price", async () => {
    lalamove.setLalamoveFetchForTests(mockLalamove().fetch);
    const { server, base } = serve();
    const job = { service: "VAN", specialRequests: [], qty: 1, cargo: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }], stops: [{ lat: 3.0733, lng: 101.5185, address: "Seksyen 15, 40200 Shah Alam" }, { lat: 3.1185, lng: 101.6223, address: "SS2, 47300 Petaling Jaya" }] };
    const bridge = (auth: string, body: unknown, host?: string) => fetch(`${base}/internal/lalamove/quote`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", ...(host ? { Host: host } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
    try {
      expect((await bridge("Bearer wrong", job)).status).toBe(401);
      expect((await bridge(`Bearer ${SECRET}`, job, "evil.example")).status).toBe(401);
      expect((await bridge(`Bearer ${SECRET}`, { ...job, service: "../v3/orders" })).status).toBe(400);
      expect((await bridge(`Bearer ${SECRET}`, "not json")).status).toBe(400);
      expect((await bridge(`Bearer ${SECRET}`, { ...job, pad: "x".repeat(20_000) })).status).toBe(413);
      const disconnected = await bridge(`Bearer ${SECRET}`, job);
      expect(disconnected.status).toBe(422);
      expect(await disconnected.json()).toMatchObject({ error: { kind: "auth" } });
      expect((await lalamove.connectLalamove(MOCK_KEY, MOCK_SECRET)).ok).toBe(true);
      const quoted = await bridge(`Bearer ${SECRET}`, job);
      expect(quoted.status).toBe(200);
      expect(await quoted.json()).toMatchObject({ ok: { quotationId: "1514140994227007571", totalSen: 5050, currency: "MYR" } });
    } finally { server.stop(true); }
  });

  test("the Claude and Lalamove connections are independent", async () => {
    const KEY = "sk-ant-api03-MOCK-INDEPENDENT-KEY-for-tests-0001";
    const { resolved } = await mockedPi();
    setModelResolverForTests(async () => ({ error: "No agent provider is configured. (mocked)" }));
    setWebLoginForTests({ runtime: async () => resolved, verify: async (key) => (key === KEY ? { ok: true } : { ok: false, error: "rejected" }) });
    lalamove.setLalamoveFetchForTests(mockLalamove().fetch);
    const { server, base } = serve();
    try {
      expect((await post(base, "/api/agent/login", JSON.stringify({ provider: "anthropic", apiKey: KEY }))).status).toBe(200);
      expect((await post(base, "/api/lalamove/connect", creds)).status).toBe(200);
      await post(base, "/api/agent/logout", "{}");
      expect(await (await fetch(`${base}/api/agent/status`)).json()).toMatchObject({ ready: false });
      expect(await (await fetch(`${base}/api/lalamove/status`)).json()).toMatchObject({ connected: true });
      expect((await post(base, "/api/agent/login", JSON.stringify({ provider: "anthropic", apiKey: KEY }))).status).toBe(200);
      await post(base, "/api/lalamove/disconnect", "{}");
      expect(await (await fetch(`${base}/api/lalamove/status`)).json()).toMatchObject({ connected: false });
      expect(await (await fetch(`${base}/api/agent/status`)).json()).toMatchObject({ ready: true });
      await post(base, "/api/agent/logout", "{}");
    } finally { server.stop(true); }
  });
});
