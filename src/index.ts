import { serve } from "bun";
import index from "./index.html";

const port = Number(process.env.PORT ?? 3000);
// Local presentation mode (`bun run demo`): presenter signed in, Pi agent routes, this machine only.
const localDemo = process.env.WAREORB_LOCAL_DEMO === "1" ? await localDemoRoutes() : null;

async function localDemoRoutes() {
  const { localDemoRoutes } = await import("./local/routes");
  const need = (name: string) => process.env[name] || (() => { throw new Error(`${name} is missing. Start the local demo with \`bun run demo\`.`); })();
  return localDemoRoutes({
    port,
    convexUrl: need("BUN_PUBLIC_CONVEX_URL"),
    privateJwk: need("WAREORB_LOCAL_DEMO_PRIVATE_JWK"),
    agentSecret: need("WAREORB_LOCAL_AGENT_SECRET"),
  });
}

const routes = {
  "/*": index,
  // All provider work belongs behind Convex's authenticated staff checks.
  "/api/icon": () => Response.json({ error: "Use the authenticated catalogue workflow." }, { status: 410 }),
  "/healthz": () => Response.json({ service: "wareorb-frontend", status: "ok" }, { headers: { "Cache-Control": "no-store" } }),
};

const server = serve({
  port,
  ...(localDemo ? { hostname: "127.0.0.1" } : {}),
  routes: localDemo ? { ...routes, ...localDemo } : routes,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`WareOrb running at ${server.url}${localDemo ? " (local demo)" : ""}`);
