import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// Secrets live only in the Convex deployment (dashboard → Settings → Environment Variables).
// Every one is optional: without it the matching feature falls back (demo quote, keyword Jarvis, browser voice).
const app = defineApp({
  env: {
    ANTHROPIC_API_KEY: v.optional(v.string()),
    CLAUDE_MODEL: v.optional(v.string()),
    LALAMOVE_API_KEY: v.optional(v.string()),
    LALAMOVE_API_SECRET: v.optional(v.string()),
    LALAMOVE_BASE_URL: v.optional(v.string()),
    FISH_API_KEY: v.optional(v.string()),
    FISH_VOICE_ID: v.optional(v.string()),
    FISH_TTS_MODEL: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    CLERK_SECRET_KEY: v.optional(v.string()),
    WAREORB_ALLOW_DEMO_SEED: v.optional(v.string()),
  },
});
app.use(rateLimiter);

export default app;
