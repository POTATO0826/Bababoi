// Used by the hosting build after Convex supplies its deployed URL.
const required = ["BUN_PUBLIC_CONVEX_URL", "BUN_PUBLIC_CONVEX_SITE_URL", "BUN_PUBLIC_CLERK_PUBLISHABLE_KEY"] as const;
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}. Configure hosting before building a release.`);
}
for (const name of ["BUN_PUBLIC_CONVEX_URL", "BUN_PUBLIC_CONVEX_SITE_URL"] as const) {
  const value = new URL(process.env[name]!);
  if (value.protocol !== "https:" || value.username || value.password || value.search || value.hash) {
    throw new Error(`${name} must be a public HTTPS deployment URL.`);
  }
}
const cloud = new URL(process.env.BUN_PUBLIC_CONVEX_URL!);
const site = new URL(process.env.BUN_PUBLIC_CONVEX_SITE_URL!);
if (cloud.hostname.endsWith(".convex.cloud") && site.hostname !== cloud.hostname.replace(/\.convex\.cloud$/, ".convex.site")) {
  throw new Error("Convex cloud and site URLs belong to different deployments.");
}
if (!/^pk_(test|live)_/.test(process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY!)) {
  throw new Error("Use a Clerk publishable key for the browser; never a secret key.");
}
if (process.env.VERCEL_ENV === "production") {
  if (!process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY!.startsWith("pk_live_")) {
    throw new Error("Production requires the Clerk production application's publishable key.");
  }
  if (cloud.hostname === "admired-swordfish-390.convex.cloud") {
    throw new Error("This is the shared demonstration deployment. Select the separate business deployment.");
  }
}
await import("../build.ts");
