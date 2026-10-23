// Same-origin JSON client for /api. Never retries mutations on its own and never fabricates data.
import type { ApiErrorBody, ApiErrorCode, ApiSuccess, ReceivingIssue } from "@/shared/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network",
    message: string,
    readonly fields?: Record<string, string>,
    readonly issues?: ReceivingIssue[],
    readonly currentVersion?: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiSuccess<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "The WareOrb server cannot be reached.");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON (proxy error page, etc.)
  }
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? "internal", e?.message ?? `Request failed (${res.status}).`, e?.fields, e?.issues, e?.currentVersion);
  }
  if (!json || typeof json !== "object" || !("data" in json)) throw new ApiError(res.status, "internal", "Malformed server response.");
  return json as ApiSuccess<T>;
}

/** A fresh key for one logical attempt; reuse it when retrying the same attempt. */
export const newIdempotencyKey = (scope: string) => `${scope}-${crypto.randomUUID()}`;
