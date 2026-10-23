import { serve } from "bun";
import index from "./index.html";
import { createApp, type App } from "./server/app";
import { readConfig } from "./server/config";
import { seedState } from "./server/db/database";

const config = readConfig();

// Reuse one database connection across `bun --hot` reloads.
const g = globalThis as unknown as { __wareorbApp?: App };
const app = (g.__wareorbApp ??= createApp(config));

const server = serve({
  port: config.port,
  routes: {
    ...app.routes,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

const seeded = seedState(app.db).seeded;
console.log(`WareOrb running at ${server.url}`);
console.log(`  database: ${config.databasePath}${seeded ? "" : "  (not initialized — run `bun run db:seed`)"}`);
console.log(`  demo personas: ${config.demoAuth ? "on (synthetic, DEMO_AUTH=1)" : "off — set DEMO_AUTH=1 for the labelled demo"}`);
