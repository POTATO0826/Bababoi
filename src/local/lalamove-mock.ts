// MOCKED Lalamove sandbox for tests only. It checks each request's HMAC signature like the real API, records
// every URL called, and answers with representative v3 payloads. Passing tests are not live Lalamove evidence.
import { signature } from "../domain/lalamove";

export const MOCK_KEY = "pk_test_MOCKKEY000000000000000000001";
export const MOCK_SECRET = "sk_test_MOCKSECRET0000000000000000000000000001";

/** Shaped like GET /v3/cities for Malaysia: units in m/cm, load in kg, one service without capacities. */
export const MOCK_CITIES = {
  data: [
    {
      locode: "MY KUL",
      name: "Kuala Lumpur",
      services: [
        { key: "MOTORCYCLE", description: "Motorcycle", dimensions: { length: { value: "0.5", unit: "m" }, width: { value: "0.4", unit: "m" }, height: { value: "0.5", unit: "m" } }, load: { value: "10", unit: "kg" }, specialRequests: [] },
        {
          key: "VAN", description: "Van", dimensions: { length: { value: "2.1", unit: "m" }, width: { value: "1.2", unit: "m" }, height: { value: "1.2", unit: "m" } }, load: { value: "500", unit: "kg" },
          specialRequests: [{ name: "DOOR_TO_DOOR_1DRIVER", description: "Door-to-door", effective_time: "2020-01-01T00:00:00Z", offline_time: "" }],
        },
        { key: "TRUCK330", description: "1-ton lorry", dimensions: { length: { value: "300", unit: "cm" }, width: { value: "160", unit: "cm" }, height: { value: "160", unit: "cm" } }, load: { value: "1000", unit: "kg" }, specialRequests: [] },
        { key: "NOCAPACITY", description: "Service without published capacity", specialRequests: [] },
      ],
    },
    { locode: "MY JHB", name: "Johor Bahru", services: [] },
  ],
};

export const mockQuotation = (over: Record<string, unknown> = {}) => ({
  data: {
    quotationId: "1514140994227007571",
    scheduleAt: "2026-10-25T09:00:00.00Z",
    expiresAt: "2026-10-24T08:05:00.00Z",
    serviceType: "VAN",
    priceBreakdown: { base: "38", extraMileage: "12.5", priorityFee: "0", total: "50.5", currency: "MYR" },
    ...over,
  },
});

export interface MockCall { url: string; method: string; path: string; body: string; market: string | null; signed: boolean }

type Reply = { status: number; json: unknown; headers?: Record<string, string> } | "network-error" | "hang";

/**
 * A fetch replacement. `reply` decides each answer; every call is recorded and its signature verified against
 * the mock secret (a request signed with another secret is answered 401, like the real API).
 */
export function mockLalamove(reply: (path: string, call: MockCall) => Reply | Promise<Reply> = (path) => (path === "/v3/cities" ? { status: 200, json: MOCK_CITIES } : { status: 201, json: mockQuotation() })) {
  const calls: MockCall[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const h = new Headers(init.headers);
    const auth = h.get("authorization") ?? "";
    const m = auth.match(/^hmac ([^:]+):(\d+):([0-9a-f]{64})$/);
    const body = typeof init.body === "string" ? init.body : "";
    const signed = !!m && m[1] === MOCK_KEY && m[3] === (await signature(MOCK_SECRET, m[2]!, init.method ?? "GET", u.pathname, body));
    const call = { url, method: init.method ?? "GET", path: u.pathname, body, market: h.get("market"), signed };
    calls.push(call);
    const r = signed ? await reply(u.pathname, call) : { status: 401, json: { errors: [{ id: "ERR_UNAUTHORIZED", message: "Unauthorized" }] } };
    if (r === "network-error") throw new TypeError("fetch failed");
    if (r === "hang") return await new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("The operation timed out.", "TimeoutError")), { once: true }));
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "Content-Type": "application/json", ...(r.headers ?? {}) } });
  };
  return { fetch, calls };
}
