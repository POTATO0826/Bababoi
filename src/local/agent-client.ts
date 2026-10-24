// Browser side of the local Pi agent (local demo mode only): status and the streamed chat turn.
// The parser tolerates events split across network chunks, CRLF line ends, comments and heartbeats.
import type { AgentEvent, AgentStatus } from "./agent";

export type { AgentEvent, AgentStatus };

/** User-facing transport messages: what happened and what to do, without implementation details. */
export const UNREACHABLE = "Jarvis can't reach the WareOrb server on this computer. Check that the demo is still running, then try again.";
export const GARBLED = "Jarvis received an unreadable reply. Ask again.";
export const CUT_OFF = "Jarvis's answer was cut off before it finished. Ask again.";
const notResponding = (status: number) => `Jarvis isn't responding properly (error ${status}). Try again; if it keeps happening, restart the demo.`;

/** Incremental `text/event-stream` parser for `data:` JSON events. */
export class SseParser {
  private buffer = "";
  private data: string[] = [];

  /** Feed decoded text; returns the complete events it finished. */
  feed(text: string): AgentEvent[] {
    this.buffer += text;
    const out: AgentEvent[] = [];
    for (;;) {
      const nl = this.buffer.search(/\r\n|\r|\n/);
      if (nl < 0) break;
      const line = this.buffer.slice(0, nl);
      const sep = this.buffer.startsWith("\r\n", nl) ? 2 : 1;
      // A lone "\r" at the very end may be the first half of "\r\n": wait for more input.
      if (sep === 1 && this.buffer[nl] === "\r" && nl === this.buffer.length - 1) break;
      this.buffer = this.buffer.slice(nl + sep);
      this.line(line, out);
    }
    return out;
  }

  /** The stream ended: dispatch a final event that lacked its blank line. */
  end(): AgentEvent[] {
    const out: AgentEvent[] = [];
    if (this.buffer) { this.line(this.buffer, out); this.buffer = ""; }
    this.line("", out);
    return out;
  }

  private line(line: string, out: AgentEvent[]) {
    if (line === "") {
      if (!this.data.length) return;
      const raw = this.data.join("\n");
      this.data = [];
      try {
        const event = JSON.parse(raw) as AgentEvent;
        if (event && typeof event === "object" && typeof (event as { type?: unknown }).type === "string") out.push(event);
        else out.push({ type: "error", message: GARBLED });
      } catch {
        out.push({ type: "error", message: GARBLED });
      }
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
  }
}

export type ChatOutcome = "done" | "error" | "cancelled";

/**
 * POST one question and deliver every event. Always ends with exactly one terminal event
 * (done, error or cancelled), even when the server or network fails mid-stream.
 */
export async function streamAgentChat(
  opts: { sessionId: string; text: string; signal?: AbortSignal; fetchImpl?: typeof fetch },
  onEvent: (e: AgentEvent) => void,
): Promise<ChatOutcome> {
  const f = opts.fetchImpl ?? fetch;
  let terminal: ChatOutcome | null = null;
  const deliver = (e: AgentEvent) => {
    if (terminal) return;
    if (e.type === "done" || e.type === "error" || e.type === "cancelled") terminal = e.type;
    onEvent(e);
  };
  try {
    const res = await f("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: opts.sessionId, text: opts.text }),
      signal: opts.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      deliver({ type: "error", message: typeof body?.error === "string" ? body.error : notResponding(res.status) });
      return terminal!;
    }
    if (!res.headers.get("content-type")?.startsWith("text/event-stream") || !res.body) {
      deliver({ type: "error", message: notResponding(res.status) });
      return terminal!;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const e of parser.feed(decoder.decode(value, { stream: true }))) deliver(e);
      if (terminal) { void reader.cancel().catch(() => {}); break; }
    }
    if (!terminal) for (const e of [...parser.feed(decoder.decode()), ...parser.end()]) deliver(e);
    if (!terminal) deliver({ type: "error", message: CUT_OFF });
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) deliver({ type: "cancelled" });
    else deliver({ type: "error", message: UNREACHABLE });
  }
  return terminal!;
}

const unreachable: AgentStatus = { ready: false, connection: "none", reason: UNREACHABLE };

export async function fetchAgentStatus(fetchImpl: typeof fetch = fetch): Promise<AgentStatus> {
  try {
    const res = await fetchImpl("/api/agent/status", { cache: "no-store" });
    if (!res.ok) return { ready: false, connection: "none", reason: notResponding(res.status) };
    return (await res.json()) as AgentStatus;
  } catch {
    return unreachable;
  }
}

export type AuthOutcome = { ok: true; status: AgentStatus } | { ok: false; error: string; status?: AgentStatus };

async function postAuth(path: string, body: unknown, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<AuthOutcome> {
  try {
    const res = await fetchImpl(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown; status?: AgentStatus } | null;
    if (res.ok && data?.ok && data.status) return { ok: true, status: data.status };
    return { ok: false, error: typeof data?.error === "string" ? data.error : notResponding(res.status), ...(data?.status ? { status: data.status } : {}) };
  } catch {
    if (signal?.aborted) return { ok: false, error: "Cancelled" };
    return { ok: false, error: unreachable.reason!, status: unreachable };
  }
}

/** Send a Claude API key from the masked login form to this computer's server (same origin, POST body only). */
export const loginAgent = (apiKey: string, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) =>
  postAuth("/api/agent/login", { provider: "anthropic", apiKey }, opts.fetchImpl ?? fetch, opts.signal);

/** Disconnect this app's agent on the server. */
export const logoutAgent = (opts: { fetchImpl?: typeof fetch } = {}) => postAuth("/api/agent/logout", {}, opts.fetchImpl ?? fetch);

/** The provider name people know, e.g. "anthropic" → "Claude". */
export function providerLabel(provider: string | undefined): string {
  if (!provider) return "AI provider";
  if (provider === "anthropic") return "Claude";
  if (provider === "openai" || provider === "openai-codex") return "ChatGPT";
  return provider;
}

/** "anthropic/claude-sonnet-5-5" → "claude-sonnet-5-5" (the model, without the provider prefix). */
export const modelLabel = (model: string | undefined) => (model ? model.slice(model.indexOf("/") + 1) : "");
