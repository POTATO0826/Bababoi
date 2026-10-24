import { serve } from "bun";
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);
// Local presentation mode (`bun run demo`): presenter signed in, Pi agent routes, this machine only.
const localDemo = process.env.WAREORB_LOCAL_DEMO === "1" ? await localDemoRoutes() : null;

async function localDemoRoutes() {
  // Hosted platforms never run the presenter mode, whatever their environment says.
  for (const hosted of ["VERCEL", "VERCEL_ENV", "NETLIFY", "RENDER", "RAILWAY_ENVIRONMENT", "DYNO", "FLY_APP_NAME"]) {
    if (process.env[hosted]) throw new Error(`WAREORB_LOCAL_DEMO is only for a presentation computer; refusing to start on a hosted platform (${hosted} is set).`);
  }
  const { localDemoRoutes } = await import("./local/routes");
  const { loopbackUrl } = await import("./local/isolation");
  const need = (name: string) => process.env[name] || (() => { throw new Error(`${name} is missing. Start the local demo with \`bun run demo\`.`); })();
  const convexPort = process.env.WAREORB_CONVEX_PORT ? Number(process.env.WAREORB_CONVEX_PORT) : undefined;
  const sitePort = process.env.WAREORB_CONVEX_SITE_PORT ? Number(process.env.WAREORB_CONVEX_SITE_PORT) : undefined;
  // The browser bundle also embeds these; both must be this computer's local backend.
  loopbackUrl(process.env.BUN_PUBLIC_CONVEX_SITE_URL, "BUN_PUBLIC_CONVEX_SITE_URL", sitePort);
  if (process.env.BUN_PUBLIC_WAREORB_LOCAL_DEMO !== "1") throw new Error("BUN_PUBLIC_WAREORB_LOCAL_DEMO=1 must accompany WAREORB_LOCAL_DEMO=1.");
  return localDemoRoutes({
    port,
    convexUrl: need("BUN_PUBLIC_CONVEX_URL"),
    convexPort,
    privateJwk: need("WAREORB_LOCAL_DEMO_PRIVATE_JWK"),
    agentSecret: need("WAREORB_LOCAL_AGENT_SECRET"),
  });
}
if (!localDemo && process.env.BUN_PUBLIC_WAREORB_LOCAL_DEMO === "1") {
  throw new Error("BUN_PUBLIC_WAREORB_LOCAL_DEMO=1 without the local demo server would serve a login-free page. Start it with `bun run demo`.");
}

const routes = {
  "/*": index,
  // All provider work belongs behind Convex's authenticated staff checks.
  "/api/icon": () => Response.json({ error: "Use the authenticated catalogue workflow." }, { status: 410 }),
  // Unknown API paths (including the local demo's agent and auth routes in hosted mode) do not exist.
  "/api/*": () => Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } }),
  "/healthz": () => Response.json({ service: "wareorb-frontend", status: "ok" }, { headers: { "Cache-Control": "no-store" } }),
};

const server = serve({
  port,
  ...(localDemo ? {
    hostname: "127.0.0.1",
    // Agent answers and photo reading can be quiet for longer than Bun's 10 s default; loopback only.
    idleTimeout: 0,
  } : {}),
  routes: localDemo ? { ...routes, ...localDemo } : routes,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`WareOrb running at ${server.url}${localDemo ? " (local demo)" : ""}`);
