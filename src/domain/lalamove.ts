// Lalamove API v3 helpers (quotations only — WareOrb never places orders). Web Crypto, so it runs in Convex and Bun.
import { parseAmount } from "./money";
import type { VehicleSpec } from "./vehicle";

const enc = new TextEncoder();

/** HMAC-SHA256 over `${ts}\r\n${METHOD}\r\n${path}\r\n\r\n${body}`, lowercase hex. */
export async function signature(secret: string, ts: string, method: string, path: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = `${ts}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function headers(key: string, secret: string, method: string, path: string, body: string, market = "MY") {
  const ts = String(Date.now());
  return {
    Authorization: `hmac ${key}:${ts}:${await signature(secret, ts, method, path, body)}`,
    Market: market,
    "Request-ID": crypto.randomUUID(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface Stop {
  lat: number;
  lng: number;
  address: string;
}

export function quotationBody(input: { service: string; specialRequests: string[]; scheduleAt?: number; stops: Stop[] }) {
  return JSON.stringify({
    data: {
      serviceType: input.service,
      specialRequests: input.specialRequests,
      language: "en_MY",
      ...(input.scheduleAt && input.scheduleAt > Date.now() + 60_000 ? { scheduleAt: new Date(input.scheduleAt).toISOString() } : {}),
      stops: input.stops.map((s) => ({ coordinates: { lat: String(s.lat), lng: String(s.lng) }, address: s.address })),
      isRouteOptimized: false,
    },
  });
}

export interface ParsedQuote {
  quotationId: string;
  /** Only the expiry Lalamove returned; a quote without one is treated as expired. */
  expiresAt?: number;
  /** Only the currency Lalamove returned. */
  currency?: string;
  totalSen: number;
  breakdownRaw: string;
}

export function parseQuotation(json: unknown): ParsedQuote | null {
  const d = (json as { data?: Record<string, unknown> } | null)?.data;
  const pb = d?.priceBreakdown as Record<string, unknown> | undefined;
  const total = parseAmount(pb?.total);
  if (!d || !pb || total == null || total <= 0 || typeof d.quotationId !== "string") return null;
  const expires = typeof d.expiresAt === "string" ? Date.parse(d.expiresAt) : Number.NaN;
  return {
    quotationId: d.quotationId,
    ...(Number.isFinite(expires) ? { expiresAt: expires } : {}),
    ...(typeof pb.currency === "string" && pb.currency ? { currency: pb.currency } : {}),
    totalSen: total,
    breakdownRaw: JSON.stringify(pb),
  };
}

/** Price breakdown lines as returned (amounts in sen), for display; unknown keys are kept by name. */
export function breakdownLines(raw: string | undefined): { name: string; sen: number }[] {
  if (!raw) return [];
  try {
    const pb = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(pb).flatMap(([name, v]) => {
      if (name === "currency" || name === "total") return [];
      const sen = parseAmount(v);
      return sen == null ? [] : [{ name, sen }];
    });
  } catch {
    return [];
  }
}

const toCm = (x: unknown) => {
  const o = x as { value?: unknown; unit?: unknown } | undefined;
  const n = parseAmount(o?.value);
  if (n == null) return 0;
  const v = n / 100;
  return o?.unit === "cm" ? v : o?.unit === "mm" ? v / 10 : v * 100;
};

/** Services from GET /v3/cities for the city nearest Kuala Lumpur (or the first city). */
export function parseServices(json: unknown): (VehicleSpec & { specialRequests: string[] })[] {
  const cities = ((json as { data?: unknown[] } | null)?.data ?? []) as Record<string, unknown>[];
  const city = cities.find((c) => /kuala lumpur|klang/i.test(String(c.name ?? ""))) ?? cities[0];
  const services = (city?.services ?? []) as Record<string, unknown>[];
  return services.map((s) => {
    const dim = (s.dimensions ?? {}) as Record<string, unknown>;
    const load = s.load as { value?: unknown; unit?: unknown } | undefined;
    const kg = (parseAmount(load?.value) ?? 0) / 100;
    const now = Date.now();
    const reqs = ((s.specialRequests ?? []) as Record<string, unknown>[])
      .filter((r) => {
        const on = typeof r.effective_time === "string" && r.effective_time ? Date.parse(r.effective_time) : 0;
        const off = typeof r.offline_time === "string" && r.offline_time ? Date.parse(r.offline_time) : Infinity;
        return on <= now && off > now;
      })
      .map((r) => String(r.name ?? r.key ?? ""))
      .filter(Boolean);
    return {
      key: String(s.key ?? ""),
      label: String(s.description ?? s.key ?? "").slice(0, 40) || String(s.key ?? ""),
      loadKg: load?.unit === "g" ? kg / 1000 : kg,
      lengthCm: toCm(dim.length ?? dim.depth),
      widthCm: toCm(dim.width),
      heightCm: toCm(dim.height),
      specialRequests: reqs,
    };
  });
}

export type LalamoveError = { kind: "auth" | "rate_limited" | "unsupported" | "invalid" | "unavailable"; message: string; retryAfterMs?: number };

export function mapError(status: number, body: unknown, hdrs: Headers): LalamoveError {
  const b = body as { message?: unknown; errors?: unknown } | null;
  const errs = Array.isArray(b?.errors) ? b.errors : b?.errors ? [b.errors] : [];
  const id = String((errs[0] as { id?: unknown } | undefined)?.id ?? b?.message ?? `HTTP ${status}`);
  if (status === 429) {
    let reset = 0;
    hdrs.forEach((v, k) => {
      if (/^ratelimit-reset/i.test(k)) reset = Math.max(reset, Number(v) || 0);
    });
    // Reset may be seconds-from-now or an epoch; keep it sensible either way.
    const ms = reset > 1e12 ? reset - Date.now() : reset > 1e9 ? reset * 1000 - Date.now() : reset * 1000;
    return { kind: "rate_limited", message: "Rate limited", retryAfterMs: Math.min(Math.max(ms, 5_000), 60_000) };
  }
  if (status === 401 || status === 403) return { kind: "auth", message: id };
  if (/OUT_OF_SERVICE_AREA|REVERSE_GEOCODE/.test(id)) return { kind: "unsupported", message: "Outside Lalamove service area" };
  if (status === 422 || status === 400) return { kind: "invalid", message: id };
  return { kind: "unavailable", message: id };
}
