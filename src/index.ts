import { serve } from "bun";
import index from "./index.html";

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/*": index,
    // All provider work belongs behind Convex's authenticated staff checks.
    "/api/icon": () => Response.json({ error: "Use the authenticated catalogue workflow." }, { status: 410 }),
    "/healthz": () => Response.json({ service: "wareorb-frontend", status: "ok" }, { headers: { "Cache-Control": "no-store" } }),
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`WareOrb running at ${server.url}`);
