// The local Lalamove sandbox connection against a MOCKED Lalamove (see lalamove-mock.ts). No live provider.
import { afterEach, describe, expect, test } from "bun:test";
import { ALLOWED_CALLS, connectLalamove, disconnectLalamove, lalamoveServices, lalamoveStatus, parseQuoteJob, requestLalamoveQuote, SANDBOX_URL, setLalamoveFetchForTests, testLalamove, type QuoteJob } from "./lalamove";
import { MOCK_KEY, MOCK_SECRET, mockLalamove, mockQuotation } from "./lalamove-mock";

afterEach(() => setLalamoveFetchForTests(null));

const stops = [{ lat: 3.0733, lng: 101.5185, address: "Seksyen 15, 40200 Shah Alam, Selangor" }, { lat: 3.1185, lng: 101.6223, address: "SS2, 47300 Petaling Jaya, Selangor" }];
const sofa = [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }];
const job = (over: Partial<QuoteJob> = {}): QuoteJob => ({ service: "VAN", specialRequests: [], qty: 2, cargo: sofa, stops, ...over });
const neverOrders = (calls: { path: string; url: string }[]) => {
  for (const c of calls) {
    expect(c.url.startsWith(`${SANDBOX_URL}/`)).toBe(true);
    expect((ALLOWED_CALLS as readonly string[]).some((a) => a.endsWith(c.path))).toBe(true);
    expect(c.path).not.toContain("/orders");
  }
};

describe("connecting (mocked Lalamove)", () => {
  test("a signed city request proves the connection; vehicles are parsed with their capacities", async () => {
    const m = mockLalamove();
    setLalamoveFetchForTests(m.fetch);
    expect(lalamoveStatus()).toMatchObject({ connected: false });
    const r = await connectLalamove(` ${MOCK_KEY} `, MOCK_SECRET);
    expect(r).toMatchObject({ ok: true, status: { connected: true, environment: "sandbox", market: "MY", serviceCount: 4 } });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]).toMatchObject({ method: "GET", path: "/v3/cities", market: "MY", signed: true });
    const s = await lalamoveServices();
    expect(s.source).toBe("cache");
    if (s.source === "none") throw new Error("expected services");
    expect(s.services.find((x) => x.key === "VAN")).toMatchObject({ loadKg: 500, lengthCm: 210, widthCm: 120, heightCm: 120, specialRequests: ["DOOR_TO_DOOR_1DRIVER"] });
    expect(s.services.find((x) => x.key === "TRUCK330")).toMatchObject({ lengthCm: 300, loadKg: 1000 });
    expect(s.services.find((x) => x.key === "NOCAPACITY")).toMatchObject({ loadKg: 0, lengthCm: 0 });
    expect(JSON.stringify(lalamoveStatus())).not.toContain(MOCK_SECRET);
    expect(JSON.stringify(r)).not.toContain(MOCK_KEY);
    neverOrders(m.calls);
  });

  test("wrong, missing and malformed credentials fail clearly and never echo them", async () => {
    const m = mockLalamove();
    setLalamoveFetchForTests(m.fetch);
    const wrong = await connectLalamove(MOCK_KEY, "sk_test_WRONGSECRET00000000000000000");
    expect(wrong).toMatchObject({ ok: false, status: { connected: false } });
    if (!wrong.ok) expect(wrong.error).toBe("Lalamove rejected the API key or secret (sandbox, Malaysia). Check both values, then connect again.");
    expect(JSON.stringify(wrong)).not.toContain("WRONGSECRET");
    expect(await connectLalamove("", MOCK_SECRET)).toMatchObject({ ok: false, error: "Enter both the Lalamove API key and the API secret." });
    expect(await connectLalamove("pk test with spaces", MOCK_SECRET)).toMatchObject({ ok: false, error: expect.stringContaining("does not look like") });
    expect(m.calls).toHaveLength(1);
  });

  test("network failure, timeout, rate limit and an empty city list are failures, not a connection", async () => {
    for (const [reply, message] of [
      ["network-error", "Could not reach the Lalamove sandbox"],
      [{ status: 429, json: {}, headers: { "RateLimit-Reset": "20" } }, "Wait about 20 seconds"],
      [{ status: 200, json: { data: [] } }, "listed no vehicle types for Malaysia"],
      [{ status: 503, json: { message: "ERR_SERVICE_UNAVAILABLE" } }, "sandbox is unavailable (ERR_SERVICE_UNAVAILABLE)"],
    ] as const) {
      setLalamoveFetchForTests(mockLalamove(() => reply as never).fetch);
      const r = await connectLalamove(MOCK_KEY, MOCK_SECRET);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(message);
      expect(lalamoveStatus().connected).toBe(false);
    }
  });

  test("a cancelled or failed replacement keeps the working connection; a newer attempt wins over an older one", async () => {
    let slow = () => {};
    const m = mockLalamove(async (path) => {
      if (path === "/v3/cities" && m.calls.length === 3) await new Promise<void>((r) => (slow = r));
      return { status: 200, json: (await import("./lalamove-mock")).MOCK_CITIES };
    });
    setLalamoveFetchForTests(m.fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    const connectedAt = lalamoveStatus().connectedAt;
    expect((await connectLalamove(MOCK_KEY, "sk_test_BADREPLACEMENT0000000000000")).ok).toBe(false);
    expect(lalamoveStatus()).toMatchObject({ connected: true, connectedAt });
    const abort = new AbortController();
    const older = connectLalamove(MOCK_KEY, MOCK_SECRET, abort.signal);
    await Bun.sleep(5);
    const newer = await connectLalamove(MOCK_KEY, MOCK_SECRET);
    slow();
    abort.abort();
    expect(newer.ok).toBe(true);
    expect((await older).ok).toBe(false);
    expect(lalamoveStatus().connected).toBe(true);
  });

  test("disconnect refuses later requests without a network call; reconnect works", async () => {
    const m = mockLalamove();
    setLalamoveFetchForTests(m.fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    expect(disconnectLalamove()).toMatchObject({ connected: false });
    const before = m.calls.length;
    expect(await requestLalamoveQuote(job())).toEqual({ error: { kind: "auth", message: expect.stringContaining("Lalamove isn't connected") } });
    expect(await lalamoveServices()).toMatchObject({ source: "none", services: [] });
    expect(m.calls.length).toBe(before);
    expect((await connectLalamove(MOCK_KEY, MOCK_SECRET)).ok).toBe(true);
  });

  test("Test connection refreshes the list; a revoked key disconnects; a network blip is reported", async () => {
    let mode: "ok" | "revoked" | "down" = "ok";
    setLalamoveFetchForTests(mockLalamove(async () => (mode === "ok" ? { status: 200, json: (await import("./lalamove-mock")).MOCK_CITIES } : mode === "down" ? "network-error" : { status: 401, json: {} })).fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    expect((await lalamoveServices({ refresh: true })).source).toBe("lalamove");
    mode = "down";
    expect((await testLalamove()).ok).toBe(false);
    expect(lalamoveStatus()).toMatchObject({ connected: true, lastCheck: { ok: false, error: expect.stringContaining("Could not reach") } });
    mode = "revoked";
    await testLalamove();
    expect(lalamoveStatus().connected).toBe(false);
  });
});

describe("sandbox quotations (mocked Lalamove)", () => {
  test("signed POST /v3/quotations; the returned price, currency, breakdown and expiry are kept exactly", async () => {
    const m = mockLalamove();
    setLalamoveFetchForTests(m.fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    const r = await requestLalamoveQuote(job({ collectAt: Date.now() + 86_400_000 }));
    expect(r).toEqual({ ok: { quotationId: "1514140994227007571", expiresAt: Date.parse("2026-10-24T08:05:00.00Z"), currency: "MYR", totalSen: 5050, breakdownRaw: JSON.stringify(mockQuotation().data.priceBreakdown) } });
    const call = m.calls.at(-1)!;
    expect(call).toMatchObject({ method: "POST", path: "/v3/quotations", market: "MY", signed: true });
    const body = JSON.parse(call.body).data;
    expect(body).toMatchObject({ serviceType: "VAN", language: "en_MY", stops: [{ coordinates: { lat: "3.0733", lng: "101.5185" } }, { coordinates: { lat: "3.1185", lng: "101.6223" } }] });
    expect(body.scheduleAt).toBeString();
    expect(body.item).toBeUndefined();
    neverOrders(m.calls);
  });

  test("no expiry or currency returned → none invented", async () => {
    setLalamoveFetchForTests(mockLalamove((p) => (p === "/v3/cities" ? { status: 200, json: { data: [{ name: "Kuala Lumpur", services: [{ key: "VAN", dimensions: { length: { value: "2.1", unit: "m" }, width: { value: "1.2", unit: "m" }, height: { value: "1.2", unit: "m" } }, load: { value: "500", unit: "kg" } }] }] } } : { status: 201, json: { data: { quotationId: "q1", priceBreakdown: { total: "50" } } } })).fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    const r = await requestLalamoveQuote(job());
    expect(r).toEqual({ ok: { quotationId: "q1", totalSen: 5000, breakdownRaw: "{\"total\":\"50\"}" } });
  });

  test.each([
    [{ status: 422, json: { errors: [{ id: "ERR_OUT_OF_SERVICE_AREA" }] } }, "unsupported", "does not serve this route"],
    [{ status: 401, json: {} }, "auth", "rejected the API key"],
    [{ status: 403, json: {} }, "auth", "rejected the API key"],
    [{ status: 429, json: {}, headers: { "RateLimit-Reset": "8" } }, "rate_limited", "Wait about 8 seconds"],
    [{ status: 422, json: { errors: [{ id: "ERR_INVALID_SCHEDULE_TIME" }] } }, "invalid", "ERR_INVALID_SCHEDULE_TIME"],
    [{ status: 201, json: { data: { nonsense: true } } }, "invalid", "could not read"],
    ["network-error", "unavailable", "Could not reach"],
    ["hang", "unavailable", "did not answer in time"],
  ] as const)("provider answer %j → %s", async (reply, kind, text) => {
    setLalamoveFetchForTests(mockLalamove(async (p) => (p === "/v3/cities" ? { status: 200, json: (await import("./lalamove-mock")).MOCK_CITIES } : (reply as never))).fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    const r = await requestLalamoveQuote(job());
    expect("error" in r && r.error.kind).toBe(kind);
    if ("error" in r) expect(r.error.message).toContain(text);
  }, 15_000);

  test("ineligible requests are refused before any network call", async () => {
    const m = mockLalamove();
    setLalamoveFetchForTests(m.fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    const n = m.calls.length;
    expect(await requestLalamoveQuote(job({ service: "SPACESHIP" }))).toMatchObject({ error: { kind: "invalid", message: expect.stringContaining("not offered") } });
    expect(await requestLalamoveQuote(job({ service: "MOTORCYCLE" }))).toMatchObject({ error: { message: expect.stringContaining("does not fit a Motorcycle") } });
    expect(await requestLalamoveQuote(job({ service: "VAN", qty: 20 }))).toMatchObject({ error: { message: expect.stringContaining("800 kg > 500 kg") } });
    expect(await requestLalamoveQuote(job({ service: "NOCAPACITY" }))).toMatchObject({ error: { message: expect.stringContaining("Vehicle capacity not provided") } });
    expect(await requestLalamoveQuote(job({ cargo: null }))).toMatchObject({ error: { message: expect.stringContaining("not confirmed") } });
    expect(await requestLalamoveQuote(job({ cargo: [{ lCm: 0, wCm: 80, hCm: 60, kg: 40 }] }))).toMatchObject({ error: { message: expect.stringContaining("unknown") } });
    expect(await requestLalamoveQuote(job({ specialRequests: ["FLYING"] }))).toMatchObject({ error: { message: expect.stringContaining("does not offer: FLYING") } });
    expect(m.calls.length).toBe(n);
  });

  test("a disconnect during a quotation discards the result", async () => {
    let release = () => {};
    setLalamoveFetchForTests(mockLalamove(async (p) => {
      if (p === "/v3/cities") return { status: 200, json: (await import("./lalamove-mock")).MOCK_CITIES };
      await new Promise<void>((r) => (release = r));
      return { status: 201, json: mockQuotation() };
    }).fetch);
    await connectLalamove(MOCK_KEY, MOCK_SECRET);
    const pending = requestLalamoveQuote(job());
    await Bun.sleep(5);
    disconnectLalamove();
    release();
    expect(await pending).toMatchObject({ error: { kind: "auth", message: expect.stringContaining("disconnected while quoting") } });
  });

  test("bridge bodies are validated", () => {
    expect(parseQuoteJob(job())).toEqual(job());
    for (const bad of [null, { ...job(), service: "van; rm -rf" }, { ...job(), qty: 0 }, { ...job(), stops: [stops[0]] }, { ...job(), stops: [stops[0], { lat: 51.5, lng: -0.1, address: "London" }] }, { ...job(), cargo: [{ lCm: "1" }] }, { ...job(), specialRequests: Array(11).fill("X") }]) {
      expect(parseQuoteJob(bad)).toBeNull();
    }
  });
});
