// Local presentation mode. Every switch here also requires the backend itself to run on this machine,
// so copying these variables to a cloud deployment cannot open it up.
import { env } from "./_generated/server";

export { LOCAL_DEMO_AUDIENCE, LOCAL_DEMO_ISSUER } from "../src/domain/local-demo";

export const isLocalBackend = (cloudUrl: string | undefined) => !!cloudUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(cloudUrl);

/** The local agent service (Pi) that reads evidence for this backend, when the presenter runs one. */
export function localAgent(): { url: string; secret: string } | null {
  if (!isLocalBackend(env.CONVEX_CLOUD_URL)) return null;
  const url = env.WAREORB_LOCAL_AGENT_URL?.replace(/\/$/, "");
  const secret = env.WAREORB_LOCAL_AGENT_SECRET;
  if (!url || !secret || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) return null;
  return { url, secret };
}
