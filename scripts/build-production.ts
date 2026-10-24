// Used by the hosting build after Convex supplies its deployed URL.
// The login-free local presentation mode can never be part of a release build.
import { isPublicDemoDeployment } from "../src/domain/local-demo";

for (const name of ["BUN_PUBLIC_WAREORB_LOCAL_DEMO", "WAREORB_LOCAL_DEMO", "WAREORB_LOCAL_DEMO_PRIVATE_JWK", "WAREORB_LOCAL_AGENT_SECRET"] as const) {
  if (process.env[name]) throw new Error(`${name} is set: local demo mode is never allowed in a production build. Unset it (it belongs only to \`bun run demo\`).`);
}
// The hosted public demo (docs/public-demo.md) signs every visitor in as the demo owner of its own synthetic-data deployment.
const publicDemo = process.env.BUN_PUBLIC_WAREORB_PUBLIC_DEMO === "1";
const required = publicDemo
  ? (["BUN_PUBLIC_CONVEX_URL", "BUN_PUBLIC_CONVEX_SITE_URL"] as const)
  : (["BUN_PUBLIC_CONVEX_URL", "BUN_PUBLIC_CONVEX_SITE_URL", "BUN_PUBLIC_CLERK_PUBLISHABLE_KEY"] as const);
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
if (publicDemo) {
  if (process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new Error("A public demo build has no staff sign-in; unset BUN_PUBLIC_CLERK_PUBLISHABLE_KEY.");
  if (!isPublicDemoDeployment(cloud.href)) throw new Error("A public demo build must target the public demo deployment listed in src/domain/local-demo.ts.");
  console.warn("Public demo build: every visitor is signed in as the demo owner of this deployment.");
} else {
  if (!/^pk_(test|live)_/.test(process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY!)) {
    throw new Error("Use a Clerk publishable key for the browser; never a secret key.");
  }
  if (process.env.VERCEL_ENV === "production") {
    if (!process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY!.startsWith("pk_live_")) {
      // Interim stage until the business domain exists: the site and sign-in screen are labelled, and staff re-register later.
      if (process.env.WAREORB_INTERIM_CLERK_DEVELOPMENT !== "acknowledged") {
        throw new Error("Production requires the Clerk production application's publishable key.");
      }
      console.warn("WARNING: interim release on a Clerk development instance. This is not the production launch.");
    }
    if (cloud.hostname === "admired-swordfish-390.convex.cloud") {
      throw new Error("This is the shared demonstration deployment. Select the separate business deployment.");
    }
  }
}
await import("../build.ts");
