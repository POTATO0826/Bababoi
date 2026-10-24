import { describe, expect, test } from "bun:test";
import { SseParser, streamAgentChat, type AgentEvent } from "./agent-client";

const wire = [
  ": keep-alive",
  `data: ${JSON.stringify({ type: "status", model: "p/m", provider: "p" })}`,
  "",
  `data: ${JSON.stringify({ type: "text", delta: "Hello\nworld ✓ 你好" })}`,
  "",
  ": keep-alive",
  "",
  `data: ${JSON.stringify({ type: "tool_start", id: "t1", name: "get_inventory", args: { sku: "A" } })}`,
  "",
  `data: ${JSON.stringify({ type: "done", text: "ok" })}`,
  "",
  "",
].join("\n");

const all = (p: SseParser, chunks: string[]) => [...chunks.flatMap((c) => p.feed(c)), ...p.end()];

describe("SSE parsing", () => {
  test("every split point gives the same events (chunks cut mid-line, mid-JSON, mid-UTF-8 text)", () => {
    const expected = all(new SseParser(), [wire]);
    expect(expected.map((e) => e.type)).toEqual(["status", "text", "tool_start", "done"]);
    for (let i = 0; i <= wire.length; i++) expect(all(new SseParser(), [wire.slice(0, i), wire.slice(i)])).toEqual(expected);
    expect(all(new SseParser(), [...wire])).toEqual(expected);
  });

  test("CRLF and lone CR line ends, multi-line data, final event without a blank line", () => {
    expect(all(new SseParser(), ["data: {\"type\":\r\n", "data: \"done\",\"text\":\"x\"}\r", "\n\r\n"])).toEqual([{ type: "done", text: "x" }]);
    expect(all(new SseParser(), ["data: {\"type\":\"cancelled\"}"])).toEqual([{ type: "cancelled" }]);
  });

  test("malformed events become visible errors", () => {
    expect(all(new SseParser(), ["data: {nope\n\ndata: 42\n\n"])).toEqual([
      { type: "error", message: "Jarvis received an unreadable reply. Ask again." },
      { type: "error", message: "Jarvis received an unreadable reply. Ask again." },
    ]);
  });
});

function streamResponse(chunks: string[], { close = true, status = 200, type = "text/event-stream" } = {}) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); if (close) c.close(); } }), { status, headers: { "Content-Type": type } });
}
const run = async (res: Response | (() => Promise<Response>), signal?: AbortSignal) => {
  const events: AgentEvent[] = [];
  const f = (async () => (typeof res === "function" ? res() : res)) as unknown as typeof fetch;
  const outcome = await streamAgentChat({ sessionId: "s-12345678", text: "q", fetchImpl: f, signal }, (e) => events.push(e));
  return { outcome, events };
};

describe("chat stream outcomes", () => {
  test("done", async () => {
    expect(await run(streamResponse([wire]))).toMatchObject({ outcome: "done" });
  });
  test("server refusal and wrong content type", async () => {
    expect(await run(Response.json({ error: "The agent is busy" }, { status: 400 }))).toEqual({ outcome: "error", events: [{ type: "error", message: "The agent is busy" }] });
    expect((await run(new Response("<html>", { headers: { "Content-Type": "text/html" } }))).events).toEqual([{ type: "error", message: "Jarvis isn't responding properly (error 200). Try again; if it keeps happening, restart the demo." }]);
  });
  test("a stream that ends early is an error, never a silent success", async () => {
    const r = await run(streamResponse([`data: ${JSON.stringify({ type: "text", delta: "Half" })}\n\n`]));
    expect(r.outcome).toBe("error");
    expect(r.events.at(-1)).toEqual({ type: "error", message: "Jarvis's answer was cut off before it finished. Ask again." });
  });
  test("network failure and cancellation", async () => {
    expect((await run(async () => { throw new TypeError("fetch failed"); })).events).toEqual([{ type: "error", message: "Jarvis can't reach the WareOrb server on this computer. Check that the demo is still running, then try again." }]);
    const abort = new AbortController();
    abort.abort();
    expect(await run(async () => { throw new DOMException("aborted", "AbortError"); }, abort.signal)).toEqual({ outcome: "cancelled", events: [{ type: "cancelled" }] });
  });
  test("exactly one terminal event even if the server sends more", async () => {
    const r = await run(streamResponse([`data: {"type":"done","text":"a"}\n\ndata: {"type":"error","message":"late"}\n\n`]));
    expect(r.events).toEqual([{ type: "done", text: "a" }]);
  });
});
