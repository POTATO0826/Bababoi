// Production builds and the web server refuse the login-free demo mode outside `bun run demo` on this computer.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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

describe("hosted mode has no local agent or auth routes", () => {
  test("the agent, login and Lalamove routes are not served", async () => {
    const port = 45_000 + Math.floor(Math.random() * 3_000);
    const p = Bun.spawn(["bun", "--no-env-file", "src/index.ts"], { cwd: root, env: { ...base, NODE_ENV: "production", PORT: String(port) }, stdout: "pipe", stderr: "pipe" });
    try {
      const url = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i++) {
        if (await fetch(`${url}/healthz`).then((r) => r.ok, () => false)) break;
        await Bun.sleep(100);
      }
      for (const path of ["/api/agent/login", "/api/agent/logout"]) {
        const r = await fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: url }, body: JSON.stringify({ apiKey: "sk-ant-api03-MOCK-HOSTED-KEY-0000000" }) });
        expect(r.status).toBe(404);
        expect(await r.json()).toEqual({ error: "Not found" });
      }
      for (const path of ["/api/lalamove/connect", "/api/lalamove/test", "/api/lalamove/disconnect", "/api/lalamove/services", "/internal/lalamove/quote", "/internal/extract-receipt"]) {
        const r = await fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: url }, body: JSON.stringify({ apiKey: "pk_test_MOCKHOSTED00000000", apiSecret: "sk_test_MOCKHOSTED00000000" }) });
        expect(r.status).toBe(404);
      }
      expect((await fetch(`${url}/api/agent/status`)).status).toBe(404);
      expect((await fetch(`${url}/api/lalamove/status`)).status).toBe(404);
      expect((await fetch(`${url}/api/demo/token`)).status).toBe(404);
      expect((await fetch(`${url}/`)).status).toBe(200);
    } finally {
      p.kill();
      await p.exited;
    }
  }, 30_000);
});

describe("demo mode serves the protected auth routes", () => {
  test("the real server refuses a foreign origin and checks the key format without contacting a provider", async () => {
    const port = 48_000 + Math.floor(Math.random() * 1_000);
    const p = Bun.spawn(["bun", "--no-env-file", "src/index.ts"], {
      cwd: root, stdout: "pipe", stderr: "pipe",
      env: { ...base, NODE_ENV: "production", PORT: String(port), WAREORB_LOCAL_DEMO: "1", BUN_PUBLIC_WAREORB_LOCAL_DEMO: "1", BUN_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210", BUN_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211", WAREORB_LOCAL_DEMO_PRIVATE_JWK: "{}", WAREORB_LOCAL_AGENT_SECRET: "ab".repeat(32), PI_CODING_AGENT_DIR: mkdtempSync(join(tmpdir(), "wareorb-no-pi-")) },
    });
    try {
      const url = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i++) {
        if (await fetch(`${url}/healthz`).then((r) => r.ok, () => false)) break;
        await Bun.sleep(100);
      }
      const send = (origin: string, apiKey: string) => fetch(`${url}/api/agent/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ provider: "anthropic", apiKey }) });
      expect((await send("https://evil.example", "sk-ant-api03-MOCK-0000000000000000")).status).toBe(403);
      const short = await send(url, "sk-short");
      expect(short.status).toBe(422);
      expect(await short.json()).toMatchObject({ ok: false, error: expect.stringContaining("does not look like a Claude API key") });
      const out = await fetch(`${url}/api/agent/logout`, { method: "POST", headers: { "Content-Type": "application/json", Origin: url }, body: "{}" });
      expect(await out.json()).toMatchObject({ ok: true, status: { ready: false, loggedOut: true } });
    } finally {
      p.kill();
      await p.exited;
    }
  }, 30_000);
});
