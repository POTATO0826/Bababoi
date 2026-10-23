import { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";

const url = process.env.BUN_PUBLIC_CONVEX_URL;
if (!url) console.error("BUN_PUBLIC_CONVEX_URL is not set — add it to .env.local (same value as CONVEX_URL).");

export const convex = new ConvexReactClient(url ?? "https://missing-convex-url.convex.cloud");

/** HTTP actions (voice) live on the deployment's .site domain. */
export const convexSiteUrl = process.env.BUN_PUBLIC_CONVEX_SITE_URL ?? (url ?? "").replace(".convex.cloud", ".convex.site");

export function errorText(e: unknown) {
  if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : "Request failed";
  return e instanceof Error ? e.message.replace(/^\[CONVEX[^\]]*\]\s*/, "").split("\n")[0]! : "Request failed";
}

/** Run a write and toast any refusal from the server. Returns undefined on failure. */
export async function run<T>(p: Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (ok) toast.success(ok);
    return r;
  } catch (e) {
    toast.error(errorText(e));
    return undefined;
  }
}
