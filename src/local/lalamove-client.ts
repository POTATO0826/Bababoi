// Browser side of the local Lalamove sandbox connection (local demo only). The key and secret go once, as a
// same-origin POST body, to this computer's WareOrb server; nothing secret is kept in the browser.
import type { LalamoveStatus, Service, ServicesResult } from "./lalamove";

export type { LalamoveStatus, Service, ServicesResult };

export const LALAMOVE_UNREACHABLE = "The WareOrb server on this computer did not answer. Check that the demo is still running, then try again.";
const offline: LalamoveStatus = { connected: false, environment: "sandbox", market: "MY", reason: LALAMOVE_UNREACHABLE };

export type LalamoveOutcome = { ok: true; status: LalamoveStatus } | { ok: false; error: string; status?: LalamoveStatus };

async function post<T>(path: string, body: unknown, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ status: number; data: T | null }> {
  const res = await fetchImpl(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal });
  return { status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

async function outcome(path: string, body: unknown, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<LalamoveOutcome> {
  try {
    const { status, data } = await post<{ ok?: boolean; error?: unknown; status?: LalamoveStatus }>(path, body, fetchImpl, signal);
    if (data?.ok && data.status) return { ok: true, status: data.status };
    return { ok: false, error: typeof data?.error === "string" ? data.error : `The request failed (error ${status}). Try again.`, ...(data?.status ? { status: data.status } : {}) };
  } catch {
    if (signal?.aborted) return { ok: false, error: "Cancelled." };
    return { ok: false, error: LALAMOVE_UNREACHABLE, status: offline };
  }
}

export async function fetchLalamoveStatus(fetchImpl: typeof fetch = fetch): Promise<LalamoveStatus> {
  try {
    const res = await fetchImpl("/api/lalamove/status", { cache: "no-store" });
    return res.ok ? ((await res.json()) as LalamoveStatus) : offline;
  } catch {
    return offline;
  }
}

/** Sandbox, Malaysia only. */
export const connectLalamove = (apiKey: string, apiSecret: string, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) =>
  outcome("/api/lalamove/connect", { environment: "sandbox", market: "MY", apiKey, apiSecret }, opts.fetchImpl ?? fetch, opts.signal);
export const testLalamove = (opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) => outcome("/api/lalamove/test", {}, opts.fetchImpl ?? fetch, opts.signal);
export const disconnectLalamove = (opts: { fetchImpl?: typeof fetch } = {}) => outcome("/api/lalamove/disconnect", {}, opts.fetchImpl ?? fetch);

export async function fetchLalamoveServices(refresh = false, fetchImpl: typeof fetch = fetch): Promise<ServicesResult> {
  try {
    const { data } = await post<ServicesResult>("/api/lalamove/services", { refresh }, fetchImpl);
    return data ?? { source: "none", services: [], error: LALAMOVE_UNREACHABLE };
  } catch {
    return { source: "none", services: [], error: LALAMOVE_UNREACHABLE };
  }
}
