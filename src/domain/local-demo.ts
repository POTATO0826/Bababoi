// Local presentation mode: shared by the Convex auth config and the local Bun server.
export const LOCAL_DEMO_ISSUER = "https://wareorb.local-demo";
export const LOCAL_DEMO_AUDIENCE = "wareorb-local-demo";
export const LOCAL_DEMO_PRESENTER = { subject: "demo-presenter", name: "Demo presenter", email: "presenter@wareorb.local" } as const;

export const localDemoTokenIdentifier = (subject: string) => `${LOCAL_DEMO_ISSUER}|${subject}`;
