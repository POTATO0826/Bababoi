// Lalamove API v3 calls. Quotations only — WareOrb never places Lalamove orders (booking is simulated).
// Local presentation mode: the credentials live only in the local WareOrb server's memory, so quote requests
// go through its authenticated loopback bridge (like receipt reading); the secret never enters Convex.
import type { FunctionArgs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalAction } from "./_generated/server";
import { headers, mapError, parseQuotation, parseServices, quotationBody } from "../src/domain/lalamove";
import type { VehicleSpec } from "../src/domain/vehicle";
import { getActionActor } from "./access";
import { localAgent } from "./localDemo";

type QuoteResult = FunctionArgs<typeof internal.quotes.save>;

/** Local mode: ask the local server (which holds the Lalamove connection) for one sandbox quotation. */
async function quoteViaLocalServer(agent: { url: string; secret: string }, job: { service: string; specialRequests: string[]; collectAt?: number; qty: number; cargo: { lCm: number; wCm: number; hCm: number; kg: number }[] | null; stops: { lat: number; lng: number; address: string }[] }): Promise<Omit<QuoteResult, "quoteId">> {
  let res: Response;
  try {
    res = await timed(`${agent.url}/internal/lalamove/quote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agent.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(job),
    }, 25_000);
  } catch {
    return { error: { kind: "unavailable", message: "The WareOrb server on this computer did not answer. Check that the demo is still running, then try again." } };
  }
  const body = (await res.json().catch(() => null)) as { ok?: QuoteResult["ok"]; error?: QuoteResult["error"] } | null;
  if (res.ok && body?.ok) return { ok: body.ok };
  if (body?.error && typeof body.error.message === "string") return { error: body.error };
  return { error: { kind: "unavailable", message: `The quote could not be requested (error ${res.status}). Try again.` } };
}

const BASE = () => env.LALAMOVE_BASE_URL || "https://rest.sandbox.lalamove.com";
const CITIES_KEY = "lalamove:cities:MY";

async function timed(url: string, init: RequestInit, ms = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const fetchQuote = internalAction({
  args: { quoteId: v.id("quotes"), specialRequests: v.array(v.string()) },
  handler: async (ctx, { quoteId, specialRequests }) => {
    const job = await ctx.runQuery(internal.quotes.forFetch, { quoteId });
    if (!job) return null;
    const agent = localAgent();
    if (agent) {
      const slot = await ctx.runMutation(internal.quotes.takeSlot, { name: "lalamoveQuote" });
      if (!slot.ok) {
        await ctx.runMutation(internal.quotes.save, { quoteId, error: { kind: "rate_limited", message: "Too many quote requests right now. Wait a moment and try again.", retryAfterMs: slot.retryAfter } });
        return null;
      }
      // Real failures stay failures: no saved demo price is substituted in local mode.
      const r = await quoteViaLocalServer(agent, { service: job.service, specialRequests, collectAt: job.collectAt, qty: job.qty, cargo: job.cargo, stops: job.stops });
      await ctx.runMutation(internal.quotes.save, { quoteId, ...r, fallback: false });
      return null;
    }
    const key = env.LALAMOVE_API_KEY;
    const secret = env.LALAMOVE_API_SECRET;
    if (!key || !secret) {
      await ctx.runMutation(internal.quotes.save, { quoteId, error: { kind: "auth", message: "Lalamove keys not set" }, fallback: true });
      return null;
    }
    const slot = await ctx.runMutation(internal.quotes.takeSlot, { name: "lalamoveQuote" });
    if (!slot.ok) {
      await ctx.runMutation(internal.quotes.save, {
        quoteId,
        error: { kind: "rate_limited", message: "Rate limited", retryAfterMs: slot.retryAfter },
      });
      return null;
    }
    const path = "/v3/quotations";
    const body = quotationBody({ service: job.service, specialRequests, scheduleAt: job.collectAt, stops: job.stops });
    try {
      const res = await timed(BASE() + path, { method: "POST", headers: await headers(key, secret, "POST", path, body), body });
      const json: unknown = await res.json().catch(() => null);
      const parsed = res.ok ? parseQuotation(json) : null;
      if (parsed) {
        await ctx.runMutation(internal.quotes.save, { quoteId, ok: parsed });
        return null;
      }
      const err = res.ok ? { kind: "invalid" as const, message: "Unexpected response" } : mapError(res.status, json, res.headers);
      console.log("lalamove quote failed", res.status, JSON.stringify(json)?.slice(0, 300));
      await ctx.runMutation(internal.quotes.save, {
        quoteId,
        error: err,
        fallback: err.kind === "auth" || err.kind === "unavailable",
      });
    } catch (e) {
      await ctx.runMutation(internal.quotes.save, {
        quoteId,
        error: { kind: "unavailable", message: e instanceof Error ? e.message : "Network error" },
        fallback: true,
      });
    }
    return null;
  },
});

type Service = VehicleSpec & { specialRequests: string[] };

/** Illustrative vehicle sizes, used only until the live city list loads. */
const FIXTURE: Service[] = [
  { key: "VAN", label: "Van", loadKg: 500, lengthCm: 210, widthCm: 120, heightCm: 120, specialRequests: [] },
  { key: "TRUCK330", label: "Lorry 10ft", loadKg: 1000, lengthCm: 300, widthCm: 160, heightCm: 160, specialRequests: [] },
  { key: "TRUCK550", label: "Lorry 14ft", loadKg: 2000, lengthCm: 420, widthCm: 190, heightCm: 190, specialRequests: [] },
];

/** Vehicle types for Malaysia from GET /v3/cities, cached for 24 h. */
export const services = action({
  args: {},
  handler: async (ctx): Promise<{ source: "live" | "fixture"; services: Service[] }> => {
    await getActionActor(ctx, "owner", "sales");
    const cached = await ctx.runQuery(internal.quotes.kvGet, { key: CITIES_KEY });
    if (cached && Date.now() - cached.updatedAt < 86_400_000) {
      return { source: "live", services: JSON.parse(cached.value) as Service[] };
    }
    const key = env.LALAMOVE_API_KEY;
    const secret = env.LALAMOVE_API_SECRET;
    if (!key || !secret) return { source: "fixture", services: FIXTURE };
    const slot = await ctx.runMutation(internal.quotes.takeSlot, { name: "lalamoveCities" });
    if (!slot.ok) return { source: "fixture", services: FIXTURE };
    const path = "/v3/cities";
    try {
      const res = await timed(BASE() + path, { method: "GET", headers: await headers(key, secret, "GET", path, "") });
      const json: unknown = await res.json().catch(() => null);
      const list = res.ok ? parseServices(json).filter((s) => s.key) : [];
      if (!list.length) {
        console.log("lalamove cities failed", res.status, JSON.stringify(json)?.slice(0, 300));
        return { source: "fixture", services: FIXTURE };
      }
      await ctx.runMutation(internal.quotes.kvSet, { key: CITIES_KEY, value: JSON.stringify(list) });
      return { source: "live", services: list };
    } catch {
      return { source: "fixture", services: FIXTURE };
    }
  },
});
