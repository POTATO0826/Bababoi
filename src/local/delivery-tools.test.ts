// Jarvis's delivery tools with a MOCKED Lalamove (lalamove-mock.ts), a mocked quote store and Pi's MOCKED faux
// provider. They prove the wiring and refusals, not a live provider.
import { afterEach, describe, expect, test } from "bun:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { runAnalystTurn, setModelResolverForTests, type AgentEvent } from "./agent";
import { deliveryTools, quoteView, type DeliveryBackend, type QuoteRecord } from "./delivery-tools";
import * as lalamove from "./lalamove";
import { MOCK_KEY, MOCK_SECRET, mockLalamove } from "./lalamove-mock";
import { mockedPi, syntheticSnapshot } from "./test-fixtures";
import type { Snapshot } from "./warehouse-tools";

const NOW = Date.UTC(2026, 9, 24, 8);
afterEach(() => { lalamove.setLalamoveFetchForTests(null); setModelResolverForTests(null); });

function world(opts: { cargo?: boolean; complete?: boolean } = {}) {
  const s = syntheticSnapshot(NOW) as Snapshot;
  const batch = s.batches.find((b) => b.skuCode === "SOFA-NORDE-3301")!;
  const deal = {
    _id: "deal1", _creationTime: NOW, code: "D-1001", batchId: batch._id, skuCode: batch.skuCode, assignee: "Presenter", status: opts.complete === false ? "finding_buyer" : "offer_ready",
    brief: { ageDays: 10, qty: 2, bays: [], guideSen: 100_000 }, qty: 1, priceSen: 150_000,
    ...(opts.complete === false ? {} : { buyer: { name: "Synthetic buyer" }, destination: { label: "PJ", address: "SS2, 47300 Petaling Jaya", lat: 3.1185, lng: 101.6223, confirmedBy: "Presenter" }, collectAt: NOW + 86_400_000 }),
    access: { floor: 0, lift: true }, unloading: "not_needed", freightPayer: "merchant", packingSen: 0, version: 4, stateVersion: 1,
    ...(opts.cargo ? { cargo: { packages: [{ lCm: 120, wCm: 80, hCm: 60, kg: 40 }], source: "staff", confirmedBy: "Presenter", confirmedAt: NOW } } : {}),
    createdBy: { role: "owner", name: "Presenter" }, createdAt: NOW, updatedAt: NOW,
  };
  (s as unknown as { deals: unknown[] }).deals = [deal];
  const stored: QuoteRecord[] = [];
  const requests: unknown[] = [];
  const backend: DeliveryBackend = {
    snapshot: async () => s,
    quotes: async () => stored,
    receipt: async () => null,
    requestQuotes: async (dealId, expectedVersion, services) => {
      requests.push({ dealId, expectedVersion, services });
      // What the Convex mutation + bridge would store for a MOCKED provider answer.
      for (const sv of services) stored.push({ _id: `q${stored.length}`, dealVersion: expectedVersion, source: "lalamove_sandbox", carrier: "Lalamove", service: sv.key, status: "ok", requestedAt: NOW, expiresAt: NOW + 300_000, currency: "MYR", totalSen: 5050, breakdownRaw: "{\"base\":\"38\",\"extraMileage\":\"12.5\",\"total\":\"50.5\",\"currency\":\"MYR\"}", unloading: "included" });
      return { requested: services.length, reused: 0, inFlight: 0 };
    },
    lalamove: { status: lalamove.lalamoveStatus, services: () => lalamove.lalamoveServices() },
  };
  const tools = deliveryTools(backend, () => NOW, async () => {});
  const run = async (name: string, args: unknown) => (await tools.find((t) => t.name === name)!.execute("id", args as never, undefined, undefined, undefined as never)).details as Record<string, unknown>;
  return { deal, stored, requests, run };
}

async function connect() {
  lalamove.setLalamoveFetchForTests(mockLalamove().fetch);
  expect((await lalamove.connectLalamove(MOCK_KEY, MOCK_SECRET)).ok).toBe(true);
}

describe("Jarvis delivery tools", () => {
  test("an incomplete shipment lists what is missing and quotes are refused without a request", async () => {
    await connect();
    const w = world({ complete: false });
    const brief = await w.run("get_delivery", { deal: "D-1001" });
    expect(brief.missing).toEqual(expect.arrayContaining(["Buyer", "Destination", "Collection time", "Confirmed shipment measurements"]));
    expect(brief.cargo).toMatchObject({ status: "suggested", source: "Catalogue (not measured)" });
    expect(await w.run("request_delivery_quotes", { deal: "D-1001", services: ["VAN"] })).toMatchObject({ refused: true });
    expect(w.requests).toEqual([]);
  });

  test("unconfirmed cargo or a disconnected Lalamove is refused", async () => {
    const w = world({ cargo: false });
    expect(await w.run("request_delivery_quotes", { deal: "D-1001", services: ["VAN"] })).toMatchObject({ refused: true, missing: ["Confirmed shipment measurements"] });
    const w2 = world({ cargo: true });
    expect(await w2.run("request_delivery_quotes", { deal: "D-1001", services: ["VAN"] })).toMatchObject({ refused: true, reason: expect.stringContaining("Lalamove isn't connected") });
    expect([...w.requests, ...w2.requests]).toEqual([]);
  });

  test("route, cargo, vehicle fit and the stored quote are reported exactly; only eligible vehicles are requested", async () => {
    await connect();
    const w = world({ cargo: true });
    const brief = await w.run("get_delivery", { deal: "sofa" });
    expect(brief).toMatchObject({
      deal: "D-1001", missing: [], stock: { quantity: 1 },
      pickup: { lat: 3.0733, lng: 101.5185 }, destination: { lat: 3.1185, lng: 101.6223, confirmedWithBuyer: true },
      cargo: { status: "confirmed", source: "Entered by staff", packages: 1, totalKg: 40 },
      lalamove: { connected: true, vehiclesFrom: "cache" },
    });
    const vehicles = brief.vehicles as { key: string; fit: string; eligibleForQuote: boolean }[];
    expect(vehicles.find((v) => v.key === "VAN")).toMatchObject({ fit: "fits", eligibleForQuote: true });
    expect(vehicles.find((v) => v.key === "MOTORCYCLE")).toMatchObject({ fit: "no", eligibleForQuote: false });
    expect(vehicles.find((v) => v.key === "NOCAPACITY")).toMatchObject({ fit: "unknown", eligibleForQuote: false });
    expect(await w.run("request_delivery_quotes", { deal: "D-1001", services: ["MOTORCYCLE"] })).toMatchObject({ refused: true });
    const done = await w.run("request_delivery_quotes", { deal: "D-1001", services: ["VAN"] });
    expect(w.requests).toEqual([{ dealId: "deal1", expectedVersion: 4, services: [{ key: "VAN", specialRequests: [] }] }]);
    // The same stored record the Delivery screen shows, in the same shape.
    expect(done.quotes).toEqual([quoteView(w.stored[0]!, w.deal as never, NOW)]);
    expect(done.quotes).toEqual([expect.objectContaining({ source: "Lalamove sandbox", totalRM: 50.5, currency: "MYR", breakdown: [{ item: "base", rm: 38 }, { item: "extraMileage", rm: 12.5 }], expiresAt: new Date(NOW + 300_000).toISOString(), state: "current" })]);
    expect(await w.run("get_delivery_quotes", { deal: "D-1001" })).toMatchObject({ quotes: done.quotes });
  });

  test("Jarvis (mocked provider) shows the quote request as a tool card with its real result", async () => {
    await connect();
    const w = world({ cargo: true });
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("request_delivery_quotes", { deal: "D-1001", services: ["VAN"] })], { stopReason: "toolUse" }),
      fauxAssistantMessage("MOCKED PROVIDER: the Lalamove sandbox quote is RM50.50."),
    ]);
    const events: AgentEvent[] = [];
    const tools = () => deliveryTools({ snapshot: async () => (await w.run("list_delivery_deals", {}), syntheticSnapshot(NOW)), quotes: async () => w.stored, receipt: async () => null, requestQuotes: async () => ({ requested: 0, reused: 0, inFlight: 0 }), lalamove: { status: lalamove.lalamoveStatus, services: () => lalamove.lalamoveServices() } }, () => NOW, async () => {});
    await runAnalystTurn("delivery-tool-session", "Get a van quote for D-1001", tools, (e) => events.push(e));
    expect(events.find((e) => e.type === "tool_start")).toMatchObject({ name: "request_delivery_quotes", args: { deal: "D-1001", services: ["VAN"] } });
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ name: "request_delivery_quotes", isError: false });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });
});
