// Local presentation mode: shared by the Convex auth config and the local Bun server.
export const LOCAL_DEMO_ISSUER = "https://wareorb.local-demo";
export const LOCAL_DEMO_AUDIENCE = "wareorb-local-demo";
export const LOCAL_DEMO_PRESENTER = { subject: "demo-presenter", name: "Demo presenter", email: "presenter@wareorb.local" } as const;

export const localDemoTokenIdentifier = (subject: string) => `${LOCAL_DEMO_ISSUER}|${subject}`;

// Hosted public demo: its own cloud deployment with synthetic data, where every visitor is the demo owner.
export const PUBLIC_DEMO_ISSUER = "https://wareorb.public-demo";
export const PUBLIC_DEMO_AUDIENCE = "wareorb-public-demo";
export const PUBLIC_DEMO_VISITOR = { subject: "demo-visitor", name: "Demo visitor", email: "visitor@wareorb.demo" } as const;

export const publicDemoTokenIdentifier = (subject: string) => `${PUBLIC_DEMO_ISSUER}|${subject}`;

/**
 * The only deployments that may run the login-free public demo (Convex project wareorb-demo, production).
 * Opening another deployment takes a code change; environment variables alone cannot do it.
 */
export const PUBLIC_DEMO_DEPLOYMENTS = ["hidden-newt-834"] as const;

export const isPublicDemoDeployment = (url: string | undefined) => {
  let host = "";
  try { host = new URL(url ?? "").hostname; } catch { return false; }
  return PUBLIC_DEMO_DEPLOYMENTS.some((name) => host === `${name}.convex.cloud` || host === `${name}.convex.site`);
};
