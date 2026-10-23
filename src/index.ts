import { serve } from "bun";
import index from "./index.html";
import { handleIconRequest } from "./server/icon";

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/*": index,
    "/api/icon": { POST: handleIconRequest },
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`WareOrb running at ${server.url}`);
