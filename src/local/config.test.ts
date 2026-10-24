// Production builds and the web server refuse the login-free demo mode outside `bun run demo` on this computer.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const base = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };

function run(args: string[], env: Record<string, string>) {
  const p = Bun.spawnSync(["bun", "--no-env-file", ...args], { cwd: root, env: { ...base, ...env }, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  return { code: p.exitCode, out: `${p.stdout}${p.stderr}` };
}

describe("release builds never include local demo mode", () => {
  test("bun run build refuses BUN_PUBLIC_WAREORB_LOCAL_DEMO", () => {
    const r = run(["build.ts"], { BUN_PUBLIC_WAREORB_LOCAL_DEMO: "1" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("refusing to build a release bundle in local demo mode");
  });
  for (const name of ["BUN_PUBLIC_WAREORB_LOCAL_DEMO", "WAREORB_LOCAL_DEMO", "WAREORB_LOCAL_DEMO_PRIVATE_JWK", "WAREORB_LOCAL_AGENT_SECRET"]) {
    test(`hosting build refuses ${name}`, () => {
      const r = run(["scripts/build-production.ts"], { [name]: "1", BUN_PUBLIC_CONVEX_URL: "https://x.convex.cloud", BUN_PUBLIC_CONVEX_SITE_URL: "https://x.convex.site", BUN_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(`${name} is set: local demo mode is never allowed in a production build`);
    });
  }
});

describe("the web server refuses unsafe demo configurations", () => {
  const demo = {
    NODE_ENV: "production", PORT: "3999", WAREORB_LOCAL_DEMO: "1", BUN_PUBLIC_WAREORB_LOCAL_DEMO: "1",
    BUN_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210", BUN_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211",
    WAREORB_LOCAL_DEMO_PRIVATE_JWK: "{}", WAREORB_LOCAL_AGENT_SECRET: "ab".repeat(32),
  };
  test.each([
    ["a cloud Convex URL", { BUN_PUBLIC_CONVEX_URL: "https://admired-swordfish-390.convex.cloud" }, /must point at 127\.0\.0\.1/],
    ["a cloud site URL", { BUN_PUBLIC_CONVEX_SITE_URL: "https://descriptive-lemur-152.convex.site" }, /must point at 127\.0\.0\.1/],
    ["a hosted platform", { VERCEL: "1" }, /refusing to start on a hosted platform \(VERCEL is set\)/],
    ["a page flag without the demo server", { WAREORB_LOCAL_DEMO: "" }, /would serve a login-free page/],
  ])("%s", (_name, over, message) => {
    const r = run(["src/index.ts"], { ...demo, ...over });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(message);
  });
});
