import { describe, expect, test } from "bun:test";
import { childEnv, CLOUD_SELECTORS, demoPorts, IsolationError, localTarget, loopbackUrl, parseEnvFile, preflight } from "./isolation";

const ports = { web: 3000, convex: 3210, convexSite: 3211 };
const refuses = (f: () => unknown, text: string | RegExp) => {
  let err: unknown;
  try { f(); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(IsolationError);
  expect((err as IsolationError).message).toMatch(text);
};

describe("loopback URL validation (exact, not prefix)", () => {
  test("accepts only http://127.0.0.1:<expected port>", () => {
    expect(loopbackUrl("http://127.0.0.1:3210", "CONVEX_URL", 3210)).toBe("http://127.0.0.1:3210");
    expect(loopbackUrl("http://127.0.0.1:3210/", "CONVEX_URL", 3210)).toBe("http://127.0.0.1:3210");
  });

  test.each([
    ["https://admired-swordfish-390.convex.cloud", /127\.0\.0\.1/],
    ["https://descriptive-lemur-152.convex.cloud", /127\.0\.0\.1/],
    ["https://wareorb.vercel.app", /127\.0\.0\.1/],
    ["http://127.0.0.1.attacker.example:3210", /not 127\.0\.0\.1\.attacker/],
    ["http://127.0.0.1:3210@attacker.example", /attacker\.example/],
    ["http://user:pass@127.0.0.1:3210", /credentials/],
    ["http://127.0.0.1:3210/api", /path/],
    ["http://127.0.0.1:3210?x=1", /query/],
    ["http://127.0.0.1:3210#frag", /fragment/],
    ["https://127.0.0.1:3210", /http on this computer/],
    ["http://localhost:3210", /not localhost/],
    ["http://[::1]:3210", /not \[::1\]/],
    ["http://127.0.0.1", /port explicitly/],
    ["http://127.0.0.1:3299", /expects 3210/],
    ["", /missing/],
    ["not a url", /not a URL/],
  ])("refuses %s", (value, why) => refuses(() => loopbackUrl(value, "CONVEX_URL", 3210), why));
});

describe("preflight over every source the Convex CLI reads", () => {
  const clean = "CONVEX_DEPLOYMENT=anonymous:anonymous-agent\nCONVEX_URL=http://127.0.0.1:3210\nCONVEX_SITE_URL=http://127.0.0.1:3211\n";

  test("accepts the accountless local deployment and a fresh checkout", () => {
    expect(preflight({ ambient: {}, envLocal: clean, dotEnv: null, ports })).toEqual({ droppedAmbient: [], deployment: "anonymous:anonymous-agent" });
    expect(preflight({ ambient: {}, envLocal: null, dotEnv: null, ports })).toEqual({ droppedAmbient: [], deployment: null });
  });

  for (const key of CLOUD_SELECTORS) {
    test(`refuses ${key} in .env.local or .env`, () => {
      refuses(() => preflight({ ambient: {}, envLocal: `${clean}${key}=prod:secret-value|abc\n`, dotEnv: null, ports }), new RegExp(`\\.env\\.local sets ${key}`));
      refuses(() => preflight({ ambient: {}, envLocal: clean, dotEnv: `export ${key}="x"\n`, ports }), new RegExp(`\\.env sets ${key}`));
    });
  }

  test.each(["prod:descriptive-lemur-152", "dev:admired-swordfish-390", "local:local-team-project", "preview:branch", "anonymous:"])("refuses CONVEX_DEPLOYMENT=%s", (value) => {
    refuses(() => preflight({ ambient: {}, envLocal: `CONVEX_DEPLOYMENT=${value}\n`, dotEnv: null, ports }), /accountless local deployment/);
  });

  test("refuses cloud or mismatched Convex URLs stored next to a local selector", () => {
    refuses(() => preflight({ ambient: {}, envLocal: "CONVEX_DEPLOYMENT=anonymous:a\nCONVEX_URL=https://admired-swordfish-390.convex.cloud\n", dotEnv: null, ports }), /CONVEX_URL must point at 127\.0\.0\.1/);
    refuses(() => preflight({ ambient: {}, envLocal: "CONVEX_DEPLOYMENT=anonymous:a\nCONVEX_SITE_URL=http://127.0.0.1:9999\n", dotEnv: null, ports }), /expects 3211/);
  });

  test("never prints secret values in refusals", () => {
    try { preflight({ ambient: {}, envLocal: "CONVEX_DEPLOY_KEY=prod:super-secret-token\nCONVEX_DEPLOYMENT=prod:lemur|secretsuffix\n", dotEnv: null, ports }); } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-token");
      expect((e as Error).message).not.toContain("secretsuffix");
    }
  });

  test("reports ambient selectors by name; they are dropped from child processes", () => {
    const ambient = { CONVEX_DEPLOY_KEY: "prod:abc", CONVEX_SELF_HOSTED_URL: "https://x", CONVEX_DEPLOYMENT: "prod:x", PATH: "/bin", HOME: "/home/p", CLERK_SECRET_KEY: "sk_live", ANTHROPIC_API_KEY: "sk-ant" };
    expect(preflight({ ambient, envLocal: null, dotEnv: null, ports }).droppedAmbient).toEqual(["CONVEX_DEPLOY_KEY", "CONVEX_SELF_HOSTED_URL"]);
    const env = childEnv(ambient, { CONVEX_AGENT_MODE: "anonymous" });
    expect(Object.keys(env).sort()).toEqual(["CONVEX_AGENT_MODE", "HOME", "NO_PROXY", "PATH", "no_proxy"]);
    expect(env.NO_PROXY).toContain("127.0.0.1");
  });
});

describe("ports and the local target", () => {
  test("ports are configurable and must differ", () => {
    expect(demoPorts({})).toEqual(ports);
    expect(demoPorts({ WAREORB_DEMO_PORT: "4100", WAREORB_CONVEX_PORT: "4210" })).toEqual({ web: 4100, convex: 4210, convexSite: 4211 });
    refuses(() => demoPorts({ WAREORB_DEMO_PORT: "3210" }), /must differ/);
    refuses(() => demoPorts({ WAREORB_CONVEX_PORT: "80" }), /1024 to 65535/);
    refuses(() => demoPorts({ WAREORB_DEMO_PORT: "3000abc" }), /not a port/);
  });

  test("localTarget requires the CLI to have written loopback URLs for the configured ports", () => {
    expect(localTarget("CONVEX_DEPLOYMENT='anonymous:anonymous-agent'\nCONVEX_URL=http://127.0.0.1:3210\nCONVEX_SITE_URL=\"http://127.0.0.1:3211\"", ports)).toEqual({ deployment: "anonymous:anonymous-agent", convexUrl: "http://127.0.0.1:3210", siteUrl: "http://127.0.0.1:3211" });
    refuses(() => localTarget("CONVEX_DEPLOYMENT=anonymous:a\n", ports), /CONVEX_URL is missing/);
    refuses(() => localTarget("CONVEX_DEPLOYMENT=anonymous:a\nCONVEX_URL=http://127.0.0.1:3212\nCONVEX_SITE_URL=http://127.0.0.1:3211", ports), /expects 3210/);
  });

  test("dotenv parsing handles quotes, export and comments", () => {
    const m = parseEnvFile("# c\nexport A='1 2'\nB=\"x\"\nC=plain # trailing\n  D = spaced  \n");
    expect([...m]).toEqual([["A", "1 2"], ["B", "x"], ["C", "plain"], ["D", "spaced"]]);
  });
});
