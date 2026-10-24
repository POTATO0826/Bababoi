// The assistant is presented as Jarvis: no Pi / SDK names in user-facing strings, and provider errors are
// explained without raw provider payloads. (Code identifiers, imports and comments may still name Pi.)
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CREDENTIAL_REJECTED, friendlyProviderError, LOGGED_OUT, SETUP_HINT } from "./agent";
import { CUT_OFF, GARBLED, modelLabel, providerLabel, UNREACHABLE } from "./agent-client";

const root = join(import.meta.dir, "../..");
const files = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
});
/** String literals and JSX text, with comments removed. */
function visibleText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
  const literals = [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
  const jsx = [...code.matchAll(/[>}]([^<>{}\n]+)(?=[<{])/g)].map((m) => m[1]!);
  return [...literals, ...jsx];
}
const PI = /\bPi\b(?!\w)|Pi agent|Pi ·|pi\.dev|\bSDK\b|pi-coding-agent|ModelRuntime/;
const UI_SOURCES = [
  ...files("src/components"), "src/actions.ts", "src/commands.ts", "src/roles.ts", "src/voice/voice-note.ts",
  "src/local/agent-client.ts", "src/local/routes.ts",
];

describe("Jarvis branding in user-facing text", () => {
  test.each(UI_SOURCES)("%s has no Pi or SDK names in visible strings", (file) => {
    const hits = visibleText(readFileSync(join(root, file), "utf8")).filter((t) => PI.test(t) && !/^@|^\.\/|^@\//.test(t));
    expect(hits).toEqual([]);
  });

  test("messages the agent server sends to the screen", () => {
    const agent = readFileSync(join(root, "src/local/agent.ts"), "utf8");
    const messages = [...agent.matchAll(/(?:error|message|reason):\s*(`[^`]*`|"[^"]*")/g)].map((m) => m[1]!);
    expect(messages.length).toBeGreaterThan(15);
    expect(messages.filter((m) => PI.test(m))).toEqual([]);
    for (const m of [SETUP_HINT, LOGGED_OUT, CREDENTIAL_REJECTED, UNREACHABLE, GARBLED, CUT_OFF]) expect(m).not.toMatch(PI);
  });

  test("the receipt button and the answer footer say Jarvis", () => {
    expect(readFileSync(join(root, "src/components/detail/receipt-detail.tsx"), "utf8")).toContain('"Read with Jarvis"');
    expect(readFileSync(join(root, "src/components/jarvis/jarvis-chat.tsx"), "utf8")).toContain("Jarvis · {providerLabel(");
    expect([providerLabel("anthropic"), providerLabel("openai-codex"), modelLabel("anthropic/claude-sonnet-5-5")]).toEqual(["Claude", "ChatGPT", "claude-sonnet-5-5"]);
  });
});

describe("provider errors explain the problem and the next step", () => {
  test.each([
    ['401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_123"}', CREDENTIAL_REJECTED],
    ['429 {"type":"error","error":{"type":"rate_limit_error"}}', "Claude is rate-limiting this key right now. Wait a moment and ask again."],
    ['529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', "Claude is temporarily unavailable. Try again in a moment."],
    ["fetch failed: getaddrinfo ENOTFOUND api.anthropic.com", "Jarvis couldn't reach Claude. Check the internet connection and try again."],
    ["prompt is too long: 210000 tokens > 200000 maximum", "This conversation is too long for Claude. Start a new conversation and ask again."],
    ["something unexpected in pi-coding-agent", "Claude couldn't answer this time. Try again, or start a new conversation."],
  ])("%s", (raw, expected) => {
    const friendly = friendlyProviderError(raw);
    expect(friendly).toBe(expected);
    expect(friendly).not.toMatch(/request_id|req_|_error|x-api-key|pi-coding-agent|ENOTFOUND/);
  });
});
