import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import path from "node:path";

// Release bundles never include the login-free local presentation mode (`bun run demo` serves its own page).
if (process.env.BUN_PUBLIC_WAREORB_LOCAL_DEMO) {
  throw new Error("BUN_PUBLIC_WAREORB_LOCAL_DEMO is set: refusing to build a release bundle in local demo mode.");
}

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

// Bun inlines only the BUN_PUBLIC_* variables that exist. An unset one would stay `process.env.…` and
// crash in the browser, so optional switches that are unset are built as empty (off).
const optionalPublic = ["BUN_PUBLIC_WAREORB_LOCAL_DEMO", "BUN_PUBLIC_WAREORB_PUBLIC_DEMO", "BUN_PUBLIC_CLERK_PUBLISHABLE_KEY"];
const unsetOptional = Object.fromEntries(optionalPublic.filter((name) => process.env[name] === undefined).map((name) => [`process.env.${name}`, JSON.stringify("")]));

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  splitting: true,
  target: "browser",
  sourcemap: "linked",
  env: "BUN_PUBLIC_*",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    ...unsetOptional,
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("Frontend build failed; no release should be published.");
}

// Static-host liveness only; this does not assert that authentication or the ledger is healthy.
await Bun.write(path.join(outdir, "health.json"), JSON.stringify({ service: "wareorb-frontend", status: "ok" }));

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
