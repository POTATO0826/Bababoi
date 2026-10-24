/// <reference types="vite/client" />
// Delivery quotes in local demo mode: confirmed cargo, versioning and the loopback bridge to the local Lalamove
// connection. The bridge is a stubbed fetch (labelled MOCKED); no real Lalamove request is made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const actor = { role: "owner" as const, name: "Client-supplied" };
const ownerToken = "https://wareorb.local-demo|demo-presenter";
const AGENT = "http://127.0.0.1:3999";
const SECRET = "cd".repeat(32);
type Line = Doc<"receipts">["lines"][number];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 24, 8));
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
  vi.stubEnv("WAREORB_LOCAL_AGENT_URL", AGENT);
  vi.stubEnv("WAREORB_LOCAL_AGENT_SECRET", SECRET);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** A business with one received batch whose receipt line has measurements, and a sale of 2 units. */
async function setup(lines: Partial<Line>[] = [{}]) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier: ownerToken, email: "presenter@wareorb.local", name: "Demo presenter" });
  const owner = t.withIdentity({ tokenIdentifier: ownerToken, issuer: "https://wareorb.local-demo", subject: "demo-presenter" });
  await owner.mutation(api.seed.ensure, {});
  await t.run(async (ctx) => { const s = await ctx.db.query("settings").first(); await ctx.db.patch("settings", s!._id, { demoMode: true }); });
  await owner.mutation(api.receiving.createCatalogItem, {
    actor, code: "SOFA-LUMA-2000", category: "sofas", kind: "sofa", cap: 4, doors: 0, model: "Luma sofa", variant: "Oat", color: "#aabbcc",
    homeFloor: 1, homeZone: "A", packages: [{ lCm: 200, wCm: 90, hCm: 80, kg: 45 }], price: { listSen: 200000, clearanceSen: 150000, unitCostSen: 90000 },
  });
  const receiptId = await owner.mutation(api.receiving.create, { actor });
  let v = await owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: 1, receivedAt: Date.UTC(2026, 9, 20), supplier: "Luma", docRef: "DN-1" });
  const all = lines.map((over, i): Line => ({ key: `l${i}`, rawText: `Sofa line ${i}`, skuCode: "SOFA-LUMA-2000", candidates: [], qty: 2, locations: [{ slot: `1A0${i}`, qty: 2 }], condition: "good", confidence: 1, questions: [], verified: true, source: "staff", packageCount: 2, packageDimsCm: { lCm: 120, wCm: 80, hCm: 60 }, packageWeightKg: 40, ...over }));
  v = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: v, lines: all });
  await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: v });
  const batch = (await t.run(async (ctx) => ctx.db.query("batches").first()))!;
  const dealId = await owner.mutation(api.deals.create, { actor, batchId: batch._id, assignee: "Presenter" });
  let dv = await owner.mutation(api.deals.update, { actor, dealId, expectedVersion: 1, patch: { buyer: { name: "Synthetic buyer" }, qty: 2, priceSen: 300000, collectAt: Date.now() + 86_400_000, destination: { label: "PJ", address: "SS2, 47300 Petaling Jaya", lat: 3.1185, lng: 101.6223 } } });
  await owner.mutation(api.deals.confirmDestination, { actor, dealId, expectedVersion: dv });
  dv = (await t.run(async (ctx) => ctx.db.get("deals", dealId)))!.version;
  return { t, owner, dealId, receiptId, batch, version: dv };
}

const deal = (t: ReturnType<typeof convexTest>, id: Id<"deals">) => t.run(async (ctx) => (await ctx.db.get("deals", id))!);
const okQuote = { quotationId: "MOCK-Q-1", expiresAt: Date.UTC(2026, 9, 24, 8, 5), currency: "MYR", totalSen: 5050, breakdownRaw: "{\"base\":\"38\",\"total\":\"50.5\",\"currency\":\"MYR\"}" };

describe("shipment measurements", () => {
  it("must be confirmed before quotes; confirming the receipt line is a new version that clears the fit check", async () => {
    const { t, owner, dealId, receiptId, version } = await setup();
    await expect(owner.mutation(api.quotes.request, { actor, dealId, expectedVersion: version, services: [{ key: "VAN", specialRequests: [] }] })).rejects.toThrow("Confirm the shipment measurements");
    await owner.mutation(api.deals.confirmFit, { actor, dealId, expectedVersion: version });
    const v2 = await owner.mutation(api.deals.setCargo, { actor, dealId, expectedVersion: version, packages: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }], source: "receipt", receiptId, lineKey: "l0" });
    expect(v2).toBe(version + 1);
    expect((await deal(t, dealId)).fitConfirmedBy).toBeUndefined();
    expect(await deal(t, dealId)).toMatchObject({ version: v2, cargo: { source: "receipt", receiptId, lineKey: "l0", confirmedBy: "Demo presenter", packages: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }] } });
  });

  it("refuses unknown/zero measurements and receipt lines that do not belong to this stock", async () => {
    const { owner, dealId, receiptId, version } = await setup();
    const set = (over: Record<string, unknown>) => owner.mutation(api.deals.setCargo, { actor, dealId, expectedVersion: version, packages: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }], source: "staff", ...over } as never);
    await expect(set({ packages: [] })).rejects.toThrow("1–20 packages");
    await expect(set({ packages: [{ lCm: 0, wCm: 80, hCm: 60, kg: 40 }] })).rejects.toThrow("positive length");
    await expect(set({ packages: [{ lCm: 120, wCm: 80, hCm: 60, kg: Number.NaN }] })).rejects.toThrow("positive length");
    await expect(set({ source: "receipt", receiptId, lineKey: "nope" })).rejects.toThrow("not for this item");
    await expect(set({ source: "receipt" })).rejects.toThrow("this stock's own receipt");
    await expect(set({ source: "staff", receiptId, lineKey: "l0" })).rejects.toThrow("Only receipt measurements");
    await expect(set({ expectedVersion: version - 1 })).rejects.toThrow("This deal changed");
  });
});

describe("sandbox quotes through the local server bridge (MOCKED)", () => {
  async function ready() {
    const s = await setup();
    const v = await s.owner.mutation(api.deals.setCargo, { actor, dealId: s.dealId, expectedVersion: s.version, packages: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }], source: "staff" });
    return { ...s, version: v };
  }
  const requestAndFetch = async (s: Awaited<ReturnType<typeof ready>>, services = ["VAN"]) => {
    const r = await s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: s.version, services: services.map((key) => ({ key, specialRequests: [] })) });
    const pending = (await s.owner.query(api.quotes.forDeal, { dealId: s.dealId })).filter((q) => q.status === "pending");
    for (const q of pending) await s.t.action(internal.lalamove.fetchQuote, { quoteId: q._id, specialRequests: [] });
    return { r, quotes: await s.owner.query(api.quotes.forDeal, { dealId: s.dealId }) };
  };

  it("sends the confirmed cargo and route to the local server, and stores the returned quote exactly", async () => {
    const bridge = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ ok: okQuote }));
    vi.stubGlobal("fetch", bridge);
    const s = await ready();
    const { quotes } = await requestAndFetch(s);
    expect(bridge).toHaveBeenCalledTimes(1);
    const [url, init] = bridge.mock.calls[0]!;
    expect(url).toBe(`${AGENT}/internal/lalamove/quote`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ service: "VAN", qty: 2, cargo: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }], stops: [{ lat: 3.0733, lng: 101.5185 }, { lat: 3.1185, lng: 101.6223 }] });
    expect(quotes).toMatchObject([{ status: "ok", source: "lalamove_sandbox", service: "VAN", dealVersion: s.version, ...okQuote }]);
    expect(String(init.body)).not.toMatch(/sk_test|pk_test/);
    for (const [u] of bridge.mock.calls) expect(u).not.toContain("/v3/orders");
  });

  it("a provider failure is stored as a failure; no saved demo price is substituted, even in demo mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { kind: "auth", message: "Lalamove rejected the API key or secret (sandbox, Malaysia). Check both values, then connect again." } }, { status: 422 })));
    const s = await ready();
    const { quotes } = await requestAndFetch(s);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ status: "error", error: { kind: "auth", message: expect.stringContaining("rejected the API key") } });
    expect(quotes.some((q) => q.source === "demo_fallback")).toBe(false);
  });

  it("an unreachable local server is a clear failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const s = await ready();
    const { quotes } = await requestAndFetch(s);
    expect(quotes[0]).toMatchObject({ status: "error", error: { kind: "unavailable", message: expect.stringContaining("did not answer") } });
  });

  it("repeat clicks reuse a valid quote or join the one in flight; a shipment change makes old quotes stale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: okQuote })));
    const s = await ready();
    const services = [{ key: "VAN", specialRequests: [] }];
    const first = await s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: s.version, services });
    const second = await s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: s.version, services });
    expect([first, second]).toEqual([{ requested: 1, reused: 0, inFlight: 0 }, { requested: 0, reused: 0, inFlight: 1 }]);
    const q = (await s.owner.query(api.quotes.forDeal, { dealId: s.dealId }))[0]!;
    await s.t.action(internal.lalamove.fetchQuote, { quoteId: q._id, specialRequests: [] });
    expect(await s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: s.version, services })).toEqual({ requested: 0, reused: 1, inFlight: 0 });
    // Changing the cargo (or route, quantity, time) is a new version: the stored quote is now stale.
    const v2 = await s.owner.mutation(api.deals.setCargo, { actor, dealId: s.dealId, expectedVersion: s.version, packages: [{ lCm: 130, wCm: 80, hCm: 60, kg: 45 }], source: "staff" });
    await expect(s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: s.version, services })).rejects.toThrow("This deal changed");
    expect(await s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: v2, services })).toEqual({ requested: 1, reused: 0, inFlight: 0 });
    // A quote whose deal changed before the provider answered is not fetched at all.
    const v3 = await s.owner.mutation(api.deals.update, { actor, dealId: s.dealId, expectedVersion: v2, patch: { collectAt: Date.now() + 2 * 86_400_000 } });
    const pending = (await s.owner.query(api.quotes.forDeal, { dealId: s.dealId })).find((x) => x.status === "pending")!;
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await s.t.action(internal.lalamove.fetchQuote, { quoteId: pending._id, specialRequests: [] });
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);
    expect(v3).toBe(v2 + 1);
  });

  it("refuses invalid or duplicate vehicle choices", async () => {
    const s = await ready();
    for (const services of [[], [{ key: "VAN", specialRequests: [] }, { key: "VAN", specialRequests: [] }], [{ key: "van; DROP", specialRequests: [] }]]) {
      await expect(s.owner.mutation(api.quotes.request, { actor, dealId: s.dealId, expectedVersion: s.version, services })).rejects.toThrow();
    }
  });

  it("a hosted (cloud) deployment never calls the local bridge", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://descriptive-lemur-152.convex.cloud");
    vi.stubEnv("LALAMOVE_API_KEY", "");
    const bridge = vi.fn();
    vi.stubGlobal("fetch", bridge);
    const s = await ready();
    const { quotes } = await requestAndFetch(s);
    expect(bridge).not.toHaveBeenCalled();
    expect(quotes.find((q) => q.source === "lalamove_sandbox")).toMatchObject({ status: "error" });
  });
});
