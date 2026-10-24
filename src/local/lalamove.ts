// Lalamove sandbox connection for the local presentation demo. The API key and secret are entered in the page
// and kept only in this server's memory (never on disk, in Convex, the browser, chat or logs). Only two signed
// sandbox endpoints for Malaysia are allowed: GET /v3/cities and POST /v3/quotations. No orders, ever.
import { headers as signedHeaders, mapError, parseQuotation, parseServices, quotationBody, type LalamoveError, type ParsedQuote } from "../domain/lalamove";
import { inMalaysia } from "../domain/places";
import { fit, piecesFor, type VehicleSpec } from "../domain/vehicle";

export const SANDBOX_URL = "https://rest.sandbox.lalamove.com";
export const MARKET = "MY";
/** The complete list of provider calls this app may make. */
export const ALLOWED_CALLS = ["GET /v3/cities", "POST /v3/quotations"] as const;
const TIMEOUT_MS = 10_000;
const SERVICES_TTL_MS = 24 * 3_600_000;

export type Service = VehicleSpec & { specialRequests: string[] };
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

interface Connection {
  key: string;
  secret: string;
  connectedAt: number;
  services: Service[];
  servicesAt: number;
  /** Generation of this connection; work started under an older one is discarded. */
  generation: number;
  lastCheck: { ok: boolean; at: number; error?: string };
}

let connection: Connection | null = null;
let generation = 0;
/** Bumped by every connect attempt and disconnect: a slower, older attempt never applies. */
let attempt = 0;
let fetchImpl: Fetch = (url, init) => fetch(url, init);

/** Tests only: replace the network with a labelled mock, and reset the connection. */
export function setLalamoveFetchForTests(f: Fetch | null) {
  fetchImpl = f ?? ((url, init) => fetch(url, init));
  connection = null;
  generation++;
  attempt++;
}

export interface LalamoveStatus {
  connected: boolean;
  environment: "sandbox";
  market: typeof MARKET;
  connectedAt?: number;
  serviceCount?: number;
  servicesAt?: number;
  lastCheck?: { ok: boolean; at: number; error?: string };
  reason?: string;
}

export function lalamoveStatus(): LalamoveStatus {
  if (!connection) return { connected: false, environment: "sandbox", market: MARKET, reason: "Lalamove isn't connected. Enter the sandbox API key and secret in Delivery." };
  return { connected: true, environment: "sandbox", market: MARKET, connectedAt: connection.connectedAt, serviceCount: connection.services.length, servicesAt: connection.servicesAt, lastCheck: connection.lastCheck };
}

/** Never let a credential appear in a message. */
function redact(text: string, ...secrets: (string | undefined)[]) {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  return out.replace(/\b(pk|sk)_(test|live)_[A-Za-z0-9]{6,}/g, "$1_$2_[redacted]");
}

/** Plain explanation and next step for a provider error. */
export function explain(err: LalamoveError): string {
  switch (err.kind) {
    case "auth": return "Lalamove rejected the API key or secret (sandbox, Malaysia). Check both values, then connect again.";
    case "rate_limited": return `Lalamove is limiting requests right now. Wait about ${Math.ceil((err.retryAfterMs ?? 10_000) / 1000)} seconds and try again.`;
    case "unsupported": return "Lalamove does not serve this route. Check the pickup and destination.";
    case "invalid": return `Lalamove refused the request (${err.message}). Check the destination, collection time and vehicle.`;
    default: return `The Lalamove sandbox is unavailable (${err.message}). Try again shortly.`;
  }
}

async function call(creds: { key: string; secret: string }, method: "GET" | "POST", path: string, body: string, signal?: AbortSignal) {
  if (!(ALLOWED_CALLS as readonly string[]).includes(`${method} ${path}`)) throw new Error(`Lalamove call not allowed: ${method} ${path}`);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetchImpl(`${SANDBOX_URL}${path}`, {
    method,
    headers: await signedHeaders(creds.key, creds.secret, method, path, body, MARKET),
    ...(method === "POST" ? { body } : {}),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const json: unknown = await res.json().catch(() => null);
  return { res, json };
}

type Fetched = { ok: true; services: Service[] } | { ok: false; error: string; kind: LalamoveError["kind"] | "network" };

/** Signed GET /v3/cities: the real connection check and the vehicle list for Malaysia. */
async function fetchServices(creds: { key: string; secret: string }, signal?: AbortSignal): Promise<Fetched> {
  try {
    const { res, json } = await call(creds, "GET", "/v3/cities", "", signal);
    if (!res.ok) { const e = mapError(res.status, json, res.headers); return { ok: false, kind: e.kind, error: explain(e) }; }
    const services = parseServices(json).filter((s) => s.key);
    if (!services.length) return { ok: false, kind: "invalid", error: "Lalamove answered but listed no vehicle types for Malaysia. Check that the key is for the Malaysia sandbox." };
    return { ok: true, services };
  } catch (e) {
    if (signal?.aborted) return { ok: false, kind: "network", error: "Cancelled." };
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(`[lalamove] cities request failed: ${redact(e instanceof Error ? e.message : String(e), creds.key, creds.secret)}`);
    return { ok: false, kind: "network", error: timedOut ? "Lalamove did not answer in time. Check the internet connection and try again." : "Could not reach the Lalamove sandbox. Check the internet connection and try again." };
  }
}

const printable = (s: string) => /^[\x21-\x7e]+$/.test(s);
export type ConnectResult = { ok: true; status: LalamoveStatus } | { ok: false; error: string; status: LalamoveStatus };

/** Check the key and secret with a signed request; only then replace the current connection. */
export async function connectLalamove(rawKey: unknown, rawSecret: unknown, signal?: AbortSignal): Promise<ConnectResult> {
  const fail = (error: string): ConnectResult => ({ ok: false, error, status: lalamoveStatus() });
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  const secret = typeof rawSecret === "string" ? rawSecret.trim() : "";
  if (!key || !secret) return fail("Enter both the Lalamove API key and the API secret.");
  if (key.length < 8 || key.length > 200 || secret.length < 8 || secret.length > 400 || !printable(key) || !printable(secret)) return fail("That does not look like a Lalamove API key and secret (they usually start with pk_test_ and sk_test_).");
  const my = ++attempt;
  const r = await fetchServices({ key, secret }, signal);
  if (my !== attempt) return fail("This connection attempt was replaced by a newer one or a disconnect.");
  if (!r.ok) return fail(redact(r.error, key, secret));
  const now = Date.now();
  connection = { key, secret, connectedAt: now, services: r.services, servicesAt: now, generation: ++generation, lastCheck: { ok: true, at: now } };
  return { ok: true, status: lalamoveStatus() };
}

/** Forget the credentials. Requests already running are discarded; later ones are refused. */
export function disconnectLalamove(): LalamoveStatus {
  attempt++;
  generation++;
  connection = null;
  return lalamoveStatus();
}

/** Re-check the current credentials now. A rejected key disconnects; a network problem is reported. */
export async function testLalamove(signal?: AbortSignal): Promise<ConnectResult> {
  const c = connection;
  if (!c) return { ok: false, error: lalamoveStatus().reason!, status: lalamoveStatus() };
  const r = await fetchServices(c, signal);
  if (connection !== c) return { ok: false, error: "The connection changed during the check.", status: lalamoveStatus() };
  const now = Date.now();
  if (r.ok) {
    c.services = r.services;
    c.servicesAt = now;
    c.lastCheck = { ok: true, at: now };
    return { ok: true, status: lalamoveStatus() };
  }
  if (r.kind === "auth") disconnectLalamove();
  else c.lastCheck = { ok: false, at: now, error: r.error };
  return { ok: false, error: r.error, status: lalamoveStatus() };
}

export type ServicesResult =
  | { source: "lalamove" | "cache"; fetchedAt: number; services: Service[] }
  | { source: "none"; services: []; error: string };

/** Vehicle types: fresh from Lalamove, or this connection's cached list (with its time). Never a silent sample. */
export async function lalamoveServices(opts: { refresh?: boolean } = {}): Promise<ServicesResult> {
  const c = connection;
  if (!c) return { source: "none", services: [], error: lalamoveStatus().reason! };
  if (!opts.refresh && Date.now() - c.servicesAt < SERVICES_TTL_MS) return { source: "cache", fetchedAt: c.servicesAt, services: c.services };
  const r = await testLalamove();
  if (!r.ok || !connection) return { source: "none", services: [], error: r.ok ? "Lalamove was disconnected." : r.error };
  return { source: "lalamove", fetchedAt: connection.servicesAt, services: connection.services };
}

export interface QuoteJob {
  service: string;
  specialRequests: string[];
  collectAt?: number;
  qty: number;
  cargo: { lCm: number; wCm: number; hCm: number; kg: number }[] | null;
  stops: { lat: number; lng: number; address: string }[];
}

export type QuoteOutcome = { ok: ParsedQuote } | { error: LalamoveError };

const refuse = (kind: LalamoveError["kind"], message: string): QuoteOutcome => ({ error: { kind, message } });

/** Validate an untrusted bridge body into a quote job (null when malformed). */
export function parseQuoteJob(body: unknown): QuoteJob | null {
  const b = body as Partial<QuoteJob> | null;
  if (!b || typeof b.service !== "string" || !/^[A-Z0-9_]{2,40}$/.test(b.service)) return null;
  if (!Array.isArray(b.specialRequests) || b.specialRequests.length > 10 || b.specialRequests.some((r) => typeof r !== "string" || r.length > 80)) return null;
  if (!Number.isSafeInteger(b.qty) || b.qty! < 1 || b.qty! > 1000) return null;
  if (b.collectAt != null && !Number.isFinite(b.collectAt)) return null;
  if (b.cargo !== null && (!Array.isArray(b.cargo) || b.cargo.length > 20 || b.cargo.some((p) => [p?.lCm, p?.wCm, p?.hCm, p?.kg].some((n) => typeof n !== "number" || !Number.isFinite(n))))) return null;
  if (!Array.isArray(b.stops) || b.stops.length !== 2 || b.stops.some((s) => typeof s?.lat !== "number" || typeof s?.lng !== "number" || !inMalaysia(s.lat, s.lng) || typeof s.address !== "string" || !s.address.trim() || s.address.length > 300)) return null;
  return { service: b.service, specialRequests: b.specialRequests, ...(b.collectAt != null ? { collectAt: b.collectAt } : {}), qty: b.qty!, cargo: b.cargo ?? null, stops: b.stops };
}

/**
 * One signed POST /v3/quotations for an eligible service. The service must come from this connection's live
 * vehicle list and the confirmed cargo must fit it; otherwise nothing is sent.
 */
export async function requestLalamoveQuote(job: QuoteJob): Promise<QuoteOutcome> {
  const c = connection;
  if (!c) return refuse("auth", "Lalamove isn't connected. Connect the sandbox in Delivery, then request the quote again.");
  const service = c.services.find((s) => s.key === job.service);
  if (!service) return refuse("invalid", `${job.service} is not offered by Lalamove for this market. Refresh the vehicle list and choose again.`);
  const unsupported = job.specialRequests.filter((r) => !service.specialRequests.includes(r));
  if (unsupported.length) return refuse("invalid", `${service.label} does not offer: ${unsupported.join(", ")}.`);
  if (!job.cargo?.length) return refuse("invalid", "The shipment measurements are not confirmed. Confirm the packages before quoting.");
  const f = fit(piecesFor(job.cargo, job.qty), service);
  if (f.status === "unknown") return refuse("invalid", `Cannot check ${service.label}: ${f.reasons[0]}.`);
  if (f.status === "no") return refuse("invalid", `The cargo does not fit a ${service.label}: ${f.reasons[0]}.`);
  try {
    const body = quotationBody({ service: job.service, specialRequests: job.specialRequests, scheduleAt: job.collectAt, stops: job.stops });
    const { res, json } = await call(c, "POST", "/v3/quotations", body);
    if (connection !== c || c.generation !== generation) return refuse("auth", "Lalamove was disconnected while quoting; this result was discarded.");
    if (!res.ok) { const e = mapError(res.status, json, res.headers); return { error: { ...e, message: explain(e) } }; }
    const parsed = parseQuotation(json);
    return parsed ? { ok: parsed } : refuse("invalid", "Lalamove returned a quotation WareOrb could not read. Try again.");
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(`[lalamove] quotation failed: ${redact(e instanceof Error ? e.message : String(e), c.key, c.secret)}`);
    return refuse("unavailable", timedOut ? "Lalamove did not answer in time. Try again." : "Could not reach the Lalamove sandbox. Check the internet connection and try again.");
  }
}
