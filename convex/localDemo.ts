// Local presentation mode. Every switch here also requires the backend itself to run on this machine,
// so copying these variables to a cloud deployment cannot open it up.
import { env } from "./_generated/server";
import { isPublicDemoDeployment } from "../src/domain/local-demo";

export { LOCAL_DEMO_AUDIENCE, LOCAL_DEMO_ISSUER, PUBLIC_DEMO_AUDIENCE, PUBLIC_DEMO_ISSUER, isPublicDemoDeployment } from "../src/domain/local-demo";

export const isLocalBackend = (cloudUrl: string | undefined) => !!cloudUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(cloudUrl);

/** The local agent service (Pi) that reads evidence for this backend, when the presenter runs one. */
export function localAgent(): { url: string; secret: string } | null {
  if (!isLocalBackend(env.CONVEX_CLOUD_URL)) return null;
  const url = env.WAREORB_LOCAL_AGENT_URL?.replace(/\/$/, "");
  const secret = env.WAREORB_LOCAL_AGENT_SECRET;
  if (!url || !secret || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) return null;
  return { url, secret };
}

/**
 * The hosted public demo, where every visitor is signed in as the demo owner. Like the local mode,
 * it depends on which deployment this is (a fixed list in code), not only on its variables.
 */
export function publicDemo(): { jwks: string; privateJwk: string } | null {
  if (!isPublicDemoDeployment(env.CONVEX_CLOUD_URL)) return null;
  const jwks = env.WAREORB_PUBLIC_DEMO_JWKS;
  const privateJwk = env.WAREORB_PUBLIC_DEMO_PRIVATE_JWK;
  return jwks && privateJwk ? { jwks, privateJwk } : null;
}
