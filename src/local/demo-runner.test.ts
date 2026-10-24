// The local demo start-up uses mocked CLI / fetch / file spies. One regression builds the real browser bundle.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DemoError, runDemo, type DemoDeps } from "./demo-runner";
import { IsolationError } from "./isolation";

const LOCAL_ENV = "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_URL=http://127.0.0.1:3210\nCONVEX_SITE_URL=http://127.0.0.1:3211\n";

interface Harness {
  deps: DemoDeps;
  files: Map<string, string>;
  runs: { cmd: string[]; env: Record<string, string> }[];
  starts: { cmd: string[]; env: Record<string, string>; log?: string }[];
  fetches: { url: string; init: RequestInit }[];
  writes: string[];
  secretFiles: string[];
  logs: string[];
  /** Total observable side effects other than reading files. */
  effects(): number;
}

function harness(opts: {
  files?: Record<string, string>;
  ambient?: Record<string, string>;
  argv?: string[];
  /** What the CLI writes into .env.local when it creates the deployment. */
  created?: string;
  skus?: unknown[];
  busyPorts?: number[];
  node?: () => string;
} = {}): Harness {
  const files = new Map(Object.entries(opts.files ?? {}));
  const h: Harness = {
    files, runs: [], starts: [], fetches: [], writes: [], secretFiles: [], logs: [],
    effects: () => h.runs.length + h.starts.length + h.fetches.length + h.writes.length + h.secretFiles.length,
    deps: undefined as unknown as DemoDeps,
  };
  h.deps = {
    root: "/demo",
    ambient: { PATH: "/usr/bin", HOME: "/home/presenter", ...opts.ambient },
    argv: opts.argv ?? [],
    read: (f) => files.get(f) ?? null,
    writePrivate: (f, text) => { h.writes.push(f); files.set(f, text); },
    run: async (cmd, env) => {
      h.runs.push({ cmd, env });
      if (cmd.includes("dev") && cmd.includes("--once") && !/CONVEX_DEPLOYMENT=/.test(files.get(".env.local") ?? "")) {
        files.set(".env.local", `${files.get(".env.local") ?? ""}\n${opts.created ?? LOCAL_ENV}`);
      }
      return { code: 0, output: "ok" };
    },
    start: (cmd, env, log) => { h.starts.push({ cmd, env, log }); return { kill: () => {}, exited: Promise.resolve(0) }; },
    fetch: async (url, init) => {
      h.fetches.push({ url, init });
      const body = JSON.parse(String(init.body)) as { path: string };
      if (body.path === "ledger:snapshot") return Response.json({ status: "success", value: { skus: opts.skus ?? [] } });
      return Response.json({ status: "success", value: null });
    },
    portFree: async (p) => !(opts.busyPorts ?? []).includes(p),
    convexNodeDir: opts.node ?? (() => "/opt/node22/bin"),
    withSecretFile: async (text, use) => { h.secretFiles.push(text); return await use("/tmp/wareorb-env-test/backend.env"); },
    log: (m) => h.logs.push(m),
    sleep: async () => {},
    agentStatus: async () => ({ ready: false, reason: "No agent provider is configured (mocked status)" }),
  };
  return h;
}

async function refused(h: Harness, kind: typeof IsolationError | typeof DemoError, text: RegExp) {
  let err: unknown;
  try { await runDemo(h.deps); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(kind);
  expect((err as Error).message).toMatch(text);
}

describe("cloud selectors and URLs stop the demo before any write or request", () => {
  const cases: [string, Record<string, string>][] = [
    ["a deploy key in .env.local", { ".env.local": `${LOCAL_ENV}CONVEX_DEPLOY_KEY=prod:descriptive-lemur-152|key\n` }],
    ["a deployment token in .env", { ".env": "CONVEX_DEPLOYMENT_TOKEN=token\n" }],
    ["a self-hosted URL in .env", { ".env": "CONVEX_SELF_HOSTED_URL=https://convex.example\nCONVEX_SELF_HOSTED_ADMIN_KEY=k\n" }],
    ["the shared cloud deployment", { ".env.local": "CONVEX_DEPLOYMENT=dev:admired-swordfish-390\n" }],
    ["the hosted production deployment", { ".env.local": "CONVEX_DEPLOYMENT=prod:descriptive-lemur-152\n" }],
    ["a cloud URL behind a local selector", { ".env.local": "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_URL=https://admired-swordfish-390.convex.cloud\nCONVEX_SITE_URL=http://127.0.0.1:3211\n" }],
    ["a userinfo URL trick", { ".env.local": "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_URL=http://127.0.0.1:3210@descriptive-lemur-152.convex.cloud\n" }],
  ];
  for (const [name, files] of cases) {
    test(name, async () => {
      const h = harness({ files });
      await refused(h, IsolationError, /refused to start/);
      expect(h.effects()).toBe(0);
    });
  }

  test("a CLI run that records a non-local deployment stops before env set, bearer use, bootstrap or seed", async () => {
    const h = harness({ created: "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_URL=https://admired-swordfish-390.convex.cloud\nCONVEX_SITE_URL=https://admired-swordfish-390.convex.site\n" });
    await refused(h, IsolationError, /CONVEX_URL must point at 127\.0\.0\.1/);
    expect(h.runs.map((r) => r.cmd.slice(2, 4).join(" "))).toEqual(["dev --once"]);
    expect(h.secretFiles).toHaveLength(0);
    expect(h.fetches).toHaveLength(0);
    expect(h.starts).toHaveLength(0);
  });

  test("a busy port or missing Node stops before any write", async () => {
    const busy = harness({ busyPorts: [3210] });
    await refused(busy, DemoError, /Port 3210 \(local Convex\) is already in use.*WAREORB_CONVEX_PORT=3220/);
    expect(busy.effects()).toBe(0);
    const noNode = harness({ node: () => { throw new Error("The local Convex backend needs Node.js 20, 22, 24. Install Node.js 24 (for example `nvm install 24`…)"); } });
    let err: unknown;
    try { await runDemo(noNode.deps); } catch (e) { err = e; }
    expect((err as Error).message).toMatch(/nvm install 24/);
    expect(noNode.effects()).toBe(0);
  });
});

describe("a clean start", () => {
  test("the real frontend bundle has no unresolved public environment references without Clerk", async () => {
    const h = harness();
    await runDemo(h.deps);
    const web = h.starts.find((s) => s.cmd.includes("src/index.ts"))!;
    const script = `
      import tailwind from "bun-plugin-tailwind";
      const result = await Bun.build({ entrypoints: ["src/index.html"], target: "browser", plugins: [tailwind], env: "BUN_PUBLIC_*", minify: true, define: { "process.env.NODE_ENV": JSON.stringify("production") } });
      const js = (await Promise.all(result.outputs.filter(o => o.path.endsWith(".js")).map(o => o.text()))).join("\\n");
      console.log(JSON.stringify({ success: result.success, unresolved: [...new Set(js.match(/process\\.env\\.BUN_PUBLIC_[A-Z_]+/g) ?? [])] }));
    `;
    const built = Bun.spawnSync([process.execPath, "--no-env-file", "-e", script], {
      cwd: join(import.meta.dir, "../.."), env: web.env, stdout: "pipe", stderr: "pipe", timeout: 20_000,
    });
    expect(built.exitCode).toBe(0);
    expect(JSON.parse(built.stdout.toString())).toEqual({ success: true, unresolved: [] });
  }, 25_000);

  test("ambient cloud selectors never reach the CLI or the server, and every request goes to 127.0.0.1", async () => {
    const h = harness({ ambient: { CONVEX_DEPLOY_KEY: "prod:lemur|secret", CONVEX_DEPLOYMENT: "prod:descriptive-lemur-152", CONVEX_SELF_HOSTED_URL: "https://x", CLERK_SECRET_KEY: "sk_test_x", BUN_PUBLIC_CONVEX_URL: "https://admired-swordfish-390.convex.cloud" } });
    const demo = await runDemo(h.deps);
    expect(h.logs[0]).toContain("Ignoring CONVEX_DEPLOY_KEY, CONVEX_SELF_HOSTED_URL from your shell");
    for (const r of [...h.runs, ...h.starts]) {
      for (const key of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT", "CONVEX_SELF_HOSTED_URL", "CLERK_SECRET_KEY"]) expect(r.env[key]).toBeUndefined();
    }
    expect(h.runs.every((r) => r.env.CONVEX_AGENT_MODE === "anonymous" && r.env.PATH!.startsWith("/opt/node22/bin:"))).toBe(true);
    expect(h.fetches.length).toBeGreaterThan(0);
    expect(h.fetches.every((f) => f.url.startsWith("http://127.0.0.1:3210/api/"))).toBe(true);
    const web = h.starts.find((s) => s.cmd.includes("src/index.ts"))!;
    expect(web.cmd).toEqual(["bun", "--no-env-file", "src/index.ts"]);
    expect(web.env).toMatchObject({ BUN_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210", BUN_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211", WAREORB_LOCAL_DEMO: "1", BUN_PUBLIC_WAREORB_LOCAL_DEMO: "1", PORT: "3000", PI_TELEMETRY: "0" });
    expect(demo.webUrl).toBe("http://127.0.0.1:3000");
  });

  test("first run: keys, deployment, env, push, backend, readiness, presenter, ledger check, seed, web — in that order", async () => {
    const h = harness();
    await runDemo(h.deps);
    expect(h.writes).toEqual([".env.local"]);
    const env = h.files.get(".env.local")!;
    expect(env).toMatch(/WAREORB_LOCAL_DEMO_PRIVATE_JWK='\{/);
    expect(env).toMatch(/WAREORB_LOCAL_AGENT_SECRET='[0-9a-f]{64}'/);
    expect(h.runs.map((r) => r.cmd.slice(2).join(" "))).toEqual([
      "dev --once --typecheck disable --tail-logs disable --local-cloud-port 3210 --local-site-port 3211",
      "env set --from-file /tmp/wareorb-env-test/backend.env --force",
      "dev --once --typecheck disable --tail-logs disable --local-cloud-port 3210 --local-site-port 3211",
      expect.stringMatching(/^run access:bootstrapOwner \{"tokenIdentifier":"https:\/\/wareorb\.local-demo\|demo-presenter"/),
      "run seed:run",
    ]);
    expect(h.secretFiles[0]).toContain("WAREORB_LOCAL_AGENT_URL=http://127.0.0.1:3000");
    expect(h.secretFiles[0]).not.toContain("PRIVATE_JWK");
    expect(h.starts.map((s) => s.log ?? "inherit")).toEqual([".convex/demo-backend.log", "inherit"]);
    const ledger = h.fetches.find((f) => String(f.init.body).includes("ledger:snapshot"))!;
    expect((ledger.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer ey/);
    expect(h.logs).toContain("Agent not connected: No agent provider is configured (mocked status)");
  });

  test("restart keeps existing data; --reset reloads it; --setup-only starts no web server", async () => {
    const files = { ".env.local": `${LOCAL_ENV}WAREORB_LOCAL_DEMO_PRIVATE_JWK='${(await import("./demo-identity").then((m) => m.generateDemoKeys())).privateJwk}'\nWAREORB_LOCAL_DEMO_JWKS='data:x'\nWAREORB_LOCAL_AGENT_SECRET='${"a".repeat(64)}'\n` };
    const again = harness({ files, skus: [{ code: "SOFA-1" }] });
    await runDemo(again.deps);
    expect(again.writes).toHaveLength(0);
    expect(again.runs.some((r) => r.cmd.includes("seed:run"))).toBe(false);
    expect(again.logs).toContain("Kept the existing local warehouse data (use --reset to reload the synthetic data).");
    const reset = harness({ files, skus: [{ code: "SOFA-1" }], argv: ["--reset", "--setup-only"] });
    const demo = await runDemo(reset.deps);
    expect(reset.runs.some((r) => r.cmd.includes("seed:run"))).toBe(true);
    expect(reset.starts.map((s) => s.cmd.slice(2, 3)[0])).toEqual(["dev"]);
    expect(demo.web).toBeUndefined();
  });

  test("configurable ports flow to the CLI, the backend env and the server", async () => {
    const h = harness({ ambient: { WAREORB_DEMO_PORT: "4300", WAREORB_CONVEX_PORT: "4310" }, created: "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_URL=http://127.0.0.1:4310\nCONVEX_SITE_URL=http://127.0.0.1:4311\n" });
    await runDemo(h.deps);
    expect(h.runs[0]!.cmd).toContain("4310");
    expect(h.secretFiles[0]).toContain("WAREORB_LOCAL_AGENT_URL=http://127.0.0.1:4300");
    expect(h.fetches.every((f) => f.url.startsWith("http://127.0.0.1:4310/"))).toBe(true);
    expect(h.starts.at(-1)!.env).toMatchObject({ PORT: "4300", WAREORB_CONVEX_PORT: "4310", WAREORB_CONVEX_SITE_PORT: "4311" });
  });
});
