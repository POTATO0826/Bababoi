// The local warehouse agent: Pi (https://pi.dev). It connects in one of two ways:
// - web login (Jarvis → /login): a Claude API key held only in this server's memory, in an app-scoped
//   in-memory Pi runtime. It never touches Pi's shared ~/.pi/agent/auth.json and is gone when the server stops;
// - before any web choice, a preconfigured provider (Pi's own login or the server environment).
// After a web logout no fallback is used. Nothing secret reaches the browser. Sessions get only the tools
// passed in: no shell, files, extensions or skills.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { InMemoryCredentialStore, Type, type ImageContent } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { NavTarget } from "../domain/navigate";
import { RECEIPT_READING_RULES } from "../domain/receipt-reading";

process.env.PI_TELEMETRY ??= "0";
process.env.PI_SKIP_VERSION_CHECK ??= "1";

/** Default models when WAREORB_AGENT_MODEL is not set: the Codex subscription first, then an Anthropic key. */
const PREFERRED = [
  { provider: "openai-codex", id: "gpt-6.1-sol" },
  { provider: "anthropic", id: "claude-sonnet-5-5" },
] as const;

/** Shown to the presenter: the web Log in action, not terminal steps (those live in docs/local-demo.md). */
export const SETUP_HINT = "Use Log in (or type /login) to connect a Claude API key.";

type Model = NonNullable<ReturnType<ModelRuntime["getModel"]>>;
type Resolved = { runtime: ModelRuntime; model: Model } | { error: string };

let runtime: ModelRuntime | null = null;

async function getRuntime(fresh = false) {
  if (!runtime || fresh) runtime = await ModelRuntime.create();
  return runtime;
}

/** Pick the configured model. Re-reads credentials when none were found, so a new login needs no restart. */
async function resolveConfiguredModel(): Promise<Resolved> {
  let rt = await getRuntime();
  const explicit = process.env.WAREORB_AGENT_MODEL?.trim();
  for (const attempt of [0, 1]) {
    if (attempt) rt = await getRuntime(true);
    if (explicit) {
      const slash = explicit.indexOf("/");
      const provider = slash > 0 ? explicit.slice(0, slash) : "";
      const model = provider ? rt.getModel(provider, explicit.slice(slash + 1)) : undefined;
      if (!model) {
        console.warn(`[agent] WAREORB_AGENT_MODEL=${explicit} is not a known provider/model.`);
        return { error: `Jarvis is set to use a model that isn't available. ${SETUP_HINT}` };
      }
      if (rt.hasConfiguredAuth(provider)) return { runtime: rt, model };
      if (attempt) return { error: `Jarvis isn't connected yet. ${SETUP_HINT}` };
      continue;
    }
    for (const c of PREFERRED) {
      const model = rt.getModel(c.provider, c.id);
      if (model && rt.hasConfiguredAuth(c.provider)) return { runtime: rt, model };
    }
  }
  return { error: `Jarvis isn't connected yet. ${SETUP_HINT}` };
}

let resolver: () => Promise<Resolved> = resolveConfiguredModel;

// ── App-scoped connection (web /login and /logout) ───────────────────────

type Connection =
  /** No explicit web choice yet: a preconfigured provider (Pi login / environment) may be used. */
  | { mode: "preconfigured" }
  | { mode: "web"; runtime: ModelRuntime; model: Model }
  /** Explicit web logout: no fallback until the next web login. */
  | { mode: "logged-out" };
let connection: Connection = { mode: "preconfigured" };
/** Bumped by every login attempt and logout; a slower, older attempt can then never apply. */
let authVersion = 0;
/** Bumped whenever the credential in use changes; work started under an older epoch is stopped. */
let credentialEpoch = 0;
const extractions = new Set<AgentSession>();

export const LOGGED_OUT = "Jarvis is logged out. Use Log in (or type /login) to connect a Claude API key.";
const DEFAULT_WEB_MODEL = "claude-sonnet-5-5";
const VERIFY_TIMEOUT_MS = 15_000;

export type KeyCheck = { ok: true } | { ok: false; error: string };
/** Checks a key against the provider; injectable so tests never need a real credential. */
export type KeyVerifier = (apiKey: string, model: Model, signal: AbortSignal) => Promise<KeyCheck>;
/** Builds the app-scoped runtime for a key; injectable so tests can use a labelled mocked provider. */
export type WebRuntimeFactory = (apiKey: string) => Promise<{ runtime: ModelRuntime; model: Model } | { error: string }>;

/** Never let a submitted key appear in a message, even if a provider echoes it. */
export function redact(text: string, apiKey?: string): string {
  let out = text;
  if (apiKey && apiKey.length >= 4) out = out.split(apiKey).join("[redacted]");
  return out.replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "sk-ant-[redacted]");
}

/** The smallest authenticated call: read the model's metadata (no tokens are generated). */
export const verifyAnthropicKey: KeyVerifier = async (apiKey, model, signal) => {
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: VERIFY_TIMEOUT_MS });
  try {
    await client.models.retrieve(model.id, {}, { signal });
    return { ok: true };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "Claude rejected this API key (invalid or revoked). Check the key and try again." };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: `This key is not allowed to use ${model.name ?? model.id}.` };
    if (e instanceof Anthropic.NotFoundError) return { ok: false, error: `The model ${model.id} is not available to this key.` };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude is rate-limiting this key right now. Wait a moment and try again." };
    if (e instanceof Anthropic.APIConnectionTimeoutError || signal.aborted) return { ok: false, error: "Checking the key timed out. Check the internet connection and try again." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "Could not reach api.anthropic.com. Check the internet connection and try again." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Claude answered with an error (${e.status ?? "unknown"}). Try again.` };
    return { ok: false, error: "The key could not be checked. Try again." };
  }
};

const webModelId = () => {
  const explicit = process.env.WAREORB_AGENT_MODEL?.trim();
  return explicit?.startsWith("anthropic/") ? explicit.slice("anthropic/".length) : DEFAULT_WEB_MODEL;
};

/** An in-memory Pi runtime holding only this key: nothing is read from or written to Pi's auth file. */
export const createWebRuntime: WebRuntimeFactory = async (apiKey) => {
  const rt = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
  const model = rt.getModel("anthropic", webModelId());
  if (!model) {
    console.warn(`[agent] anthropic/${webModelId()} is not in the installed model catalogue.`);
    return { error: `The Claude model ${webModelId()} isn't available in this version of WareOrb.` };
  }
  await rt.setRuntimeApiKey("anthropic", apiKey);
  return { runtime: rt, model };
};

let verifier: KeyVerifier = verifyAnthropicKey;
let webRuntime: WebRuntimeFactory = createWebRuntime;

/** Stop and forget every session that may hold the previous credential. */
function retireSessions() {
  credentialEpoch++;
  for (const [id, c] of chats) {
    c.retired = true;
    if (c.session) { void c.session.abort().catch(() => {}); if (!c.busy) c.session.dispose(); }
    chats.delete(id);
  }
  for (const session of extractions) void session.abort().catch(() => {});
  extractions.clear();
}

export type LoginResult = { ok: true; status: AgentStatus } | { ok: false; error: string; status: AgentStatus };

/**
 * Web login with a Claude API key. Verified against the provider before use; on success it replaces any
 * previous connection and retires old sessions. A failed, cancelled or superseded attempt changes nothing.
 */
export async function webLogin(rawKey: unknown, signal?: AbortSignal): Promise<LoginResult> {
  const fail = async (error: string): Promise<LoginResult> => ({ ok: false, error, status: await agentStatus() });
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!apiKey) return fail("Enter a Claude API key.");
  if (apiKey.length < 20 || apiKey.length > 512 || !/^[\x21-\x7e]+$/.test(apiKey)) return fail("That does not look like a Claude API key (it usually starts with sk-ant-).");
  const version = ++authVersion;
  try {
    const made = await webRuntime(apiKey);
    if ("error" in made) return fail(made.error);
    if (signal?.aborted) return fail("Login cancelled.");
    const timeout = AbortSignal.timeout(VERIFY_TIMEOUT_MS + 1_000);
    const check = await verifier(apiKey, made.model, signal ? AbortSignal.any([signal, timeout]) : timeout);
    if (version !== authVersion) return fail("This login was replaced by a newer login or a logout.");
    if (!check.ok) return fail(redact(check.error, apiKey));
    retireSessions();
    connection = { mode: "web", runtime: made.runtime, model: made.model };
    return { ok: true, status: await agentStatus() };
  } catch (e) {
    console.warn(`[agent] key check failed: ${redact(e instanceof Error ? e.message : String(e), apiKey)}`);
    return fail("The key could not be checked. Check the internet connection and try again.");
  }
}

/** Disconnect this app's agent. Shared Pi credentials and the environment are not touched. */
export async function webLogout(): Promise<AgentStatus> {
  authVersion++;
  if (connection.mode === "web") void connection.runtime.removeRuntimeApiKey("anthropic").catch(() => {});
  connection = { mode: "logged-out" };
  retireSessions();
  return await agentStatus();
}

/** The model the agent uses now. */
export async function resolveModel(): Promise<Resolved> {
  if (connection.mode === "web") return { runtime: connection.runtime, model: connection.model };
  if (connection.mode === "logged-out") return { error: LOGGED_OUT };
  return await resolver();
}

/**
 * Tests only: run the agent against a scripted provider instead of the operator's login, and reset the
 * web connection. Passing null restores the real resolver. Never called by the demo server.
 */
export function setModelResolverForTests(fn: (() => Promise<Resolved>) | null) {
  resolver = fn ?? resolveConfiguredModel;
  connection = { mode: "preconfigured" };
  verifier = verifyAnthropicKey;
  webRuntime = createWebRuntime;
  retireSessions();
}

/** Tests only: replace the key check and the runtime factory with labelled mocks. */
export function setWebLoginForTests(opts: { verify?: KeyVerifier; runtime?: WebRuntimeFactory }) {
  if (opts.verify) verifier = opts.verify;
  if (opts.runtime) webRuntime = opts.runtime;
}

export interface AgentStatus {
  ready: boolean;
  /** web = connected from Jarvis /login; preconfigured = Pi login or environment; none = not connected. */
  connection: "web" | "preconfigured" | "none";
  /** True after an explicit web logout (no fallback is used until the next web login). */
  loggedOut?: boolean;
  provider?: string;
  model?: string;
  modelName?: string;
  subscription?: boolean;
  readsPhotos?: boolean;
  reason?: string;
}

/** What is configured, without calling the provider or exposing credentials. */
export async function agentStatus(): Promise<AgentStatus> {
  const r = await resolveModel();
  if ("error" in r) return { ready: false, connection: "none", reason: r.error, ...(connection.mode === "logged-out" ? { loggedOut: true } : {}) };
  return {
    ready: true, connection: connection.mode === "web" ? "web" : "preconfigured", provider: r.model.provider, model: r.model.id, modelName: r.model.name,
    subscription: r.runtime.isUsingSubscription(r.model.provider), readsPhotos: r.model.input.includes("image"),
  };
}

const workdir = () => {
  const dir = join(tmpdir(), "wareorb-agent");
  mkdirSync(dir, { recursive: true });
  return dir;
};

async function newSession(r: { runtime: ModelRuntime; model: Model }, systemPrompt: string, tools: ToolDefinition[]): Promise<AgentSession> {
  const cwd = workdir();
  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  const { session } = await createAgentSession({
    cwd,
    model: r.model,
    thinkingLevel: "low",
    modelRuntime: r.runtime,
    resourceLoader,
    tools: tools.map((t) => t.name),
    customTools: tools,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 1 }, enableInstallTelemetry: false }),
  });
  // Only the tools we pass may exist at all: no shell, file, MCP, codemode or extension tools.
  const allowed = new Set(tools.map((t) => t.name));
  const present = [...new Set([...session.getActiveToolNames(), ...session.getAllTools().map((t) => t.name)])];
  if (present.some((name) => !allowed.has(name))) {
    session.dispose();
    throw new Error(`Refusing to run: unexpected tools available (${present.join(", ")})`);
  }
  return session;
}

/**
 * The last assistant error, if the provider refused or failed the request, as a plain explanation with
 * the next step. The raw provider message goes to the server log only (redacted), never to the screen.
 */
function providerError(session: AgentSession): string | null {
  const last = [...session.messages].reverse().find((m) => m.role === "assistant") as { stopReason?: string; errorMessage?: string } | undefined;
  if (last?.stopReason !== "error") return null;
  const raw = last.errorMessage ?? "";
  console.warn(`[agent] provider error: ${redact(raw).slice(0, 300)}`);
  return friendlyProviderError(raw);
}

export const CREDENTIAL_REJECTED = "Claude rejected the API key (it may have been revoked or lack access). Log out, then use Log in with a valid Claude API key.";

/** Map a provider/network error to what happened and what to do next. */
export function friendlyProviderError(raw: string): string {
  if (/401|403|unauthori[sz]ed|invalid.*(api key|x-api-key|token|credential)|expired|authentication|permission/i.test(raw)) return CREDENTIAL_REJECTED;
  if (/429|rate.?limit/i.test(raw)) return "Claude is rate-limiting this key right now. Wait a moment and ask again.";
  if (/529|overload|5\d\d|internal server error|unavailable/i.test(raw)) return "Claude is temporarily unavailable. Try again in a moment.";
  if (/fetch failed|network|ENOTFOUND|ECONN|ETIMEDOUT|timed? ?out|socket|getaddrinfo/i.test(raw)) return "Jarvis couldn't reach Claude. Check the internet connection and try again.";
  if (/context|too long|max.?tokens|prompt is too long/i.test(raw)) return "This conversation is too long for Claude. Start a new conversation and ask again.";
  return "Claude couldn't answer this time. Try again, or start a new conversation.";
}

// ── Warehouse analyst chat ───────────────────────────────────────────────

export const ANALYST_PROMPT = `You are Jarvis, the WareOrb warehouse analyst in a furniture warehouse console. This presentation uses synthetic demo data.
Refer to yourself only as Jarvis; do not mention the software or SDK you run on.
You see the warehouse only through your tools: get_inventory, get_movements, get_purchase_orders, analyze_reorder and show_in_warehouse. Call tools before giving any number; never invent stock, sales, costs, capacity or prices.
For "what/how much should we reorder": call analyze_reorder (and others as needed), then explain per SKU: available (on hand − reserved), incoming purchase orders, net sales in the window and recorded history, the cover target, and the recommended quantity with its cost and bays. The recommended quantities are already feasible together: one shared remaining budget (after open orders at their own cost) and the free bays (after space kept for incoming orders) are allocated in allocationPriority order. Say when an item gets less than its candidate quantity because the shared budget or bays ran out, and report the plan totals and what is left.
If the data is insufficient (no unit cost, no sales in the window, history shorter than the window), say so plainly and recommend no number for that SKU.
When the user asks where something is, where new stock can go, or to see a stage (receive, ageing, deals, delivery quotes, approvals, collection, replenish), call show_in_warehouse so their screen moves there, then answer.
You cannot post stock, record purchases or dispatch goods. When something should be ordered, say that a person records the confirmed supplier purchase in Replenish.
Reply briefly in the user's language (English or Chinese). Money in RM.`;

export type AgentEvent =
  | { type: "status"; model: string; provider: string; modelName?: string; subscription?: boolean }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; isError: boolean; result: unknown; ms?: number }
  /** show_in_warehouse succeeded: the browser moves to this stage, floor, zone and bays. */
  | ({ type: "navigate" } & NavTarget)
  | { type: "done"; text: string }
  | { type: "cancelled" }
  | { type: "error"; message: string; setup?: boolean };

/** The screen target from a successful show_in_warehouse result, else null. */
export function navigateOf(toolName: string, isError: boolean, result: unknown): NavTarget | null {
  if (toolName !== "show_in_warehouse" || isError || !result || typeof result !== "object") return null;
  const t = (result as { navigate?: NavTarget }).navigate;
  return t && Array.isArray(t.slots) ? t : null;
}

interface Chat { session: AgentSession | null; model: string; provider: string; modelName?: string; subscription?: boolean; at: number; busy: boolean; retired?: boolean }
const chats = new Map<string, Chat>();
const CHAT_IDLE_MS = 30 * 60_000;
const MAX_CHATS = 20;
/** Tool results sent to the browser are capped; the model still receives the full result. */
const MAX_RESULT_CHARS = 200_000;

export function boundedResult(value: unknown): unknown {
  let text: string;
  try { text = JSON.stringify(value) ?? "null"; } catch { return { unserialisable: true }; }
  return text.length <= MAX_RESULT_CHARS ? value : { truncated: true, preview: `${text.slice(0, MAX_RESULT_CHARS)}…`, totalChars: text.length };
}

export async function runAnalystTurn(sessionId: string, text: string, tools: () => ToolDefinition[], emit: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  for (const [id, c] of chats) if (Date.now() - c.at > CHAT_IDLE_MS && !c.busy) { c.session?.dispose(); chats.delete(id); }
  let chat = chats.get(sessionId);
  if (chat?.busy) return emit({ type: "error", message: "Jarvis is still answering the previous question. Wait for it, or press Stop first." });
  if (!chat && chats.size >= MAX_CHATS) return emit({ type: "error", message: "Jarvis has too many conversations open. Start a new conversation, or restart the demo." });
  // Reserve the conversation before any await, so two simultaneous requests cannot both create one.
  if (!chat) { chat = { session: null, model: "", provider: "", at: Date.now(), busy: true }; chats.set(sessionId, chat); }
  chat.busy = true;
  chat.at = Date.now();
  let unsubscribe = () => {};
  const onAbort = () => { void chat!.session?.abort(); };
  const epoch = credentialEpoch;
  /** The connection changed (logout or another login) while this turn ran: it must not continue. */
  const stale = () => chat!.retired || epoch !== credentialEpoch;
  const disconnected = { type: "error" as const, message: "Jarvis was logged out or switched to another key, so this answer was stopped. Ask again after logging in.", setup: true };
  try {
    if (!chat.session) {
      const r = await resolveModel();
      if ("error" in r) { chats.delete(sessionId); return emit({ type: "error", message: r.error, setup: true }); }
      if (stale()) { chats.delete(sessionId); return emit(disconnected); }
      chat.session = await newSession(r, ANALYST_PROMPT, tools());
      if (stale()) { chat.session.dispose(); chats.delete(sessionId); return emit(disconnected); }
      chat.provider = r.model.provider;
      chat.model = `${r.model.provider}/${r.model.id}`;
      chat.modelName = r.model.name;
      chat.subscription = r.runtime.isUsingSubscription(r.model.provider);
    }
    if (signal?.aborted) return emit({ type: "cancelled" });
    signal?.addEventListener("abort", onAbort, { once: true });
    emit({ type: "status", model: chat.model, provider: chat.provider, modelName: chat.modelName, subscription: chat.subscription });
    const session = chat.session;
    unsubscribe = session.subscribe((event) => {
      if (stale()) return;
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") emit({ type: "text", delta: event.assistantMessageEvent.delta });
      else if (event.type === "tool_execution_start") emit({ type: "tool_start", id: event.toolCallId, name: event.toolName, args: boundedResult(event.args) });
      else if (event.type === "tool_execution_end") {
        const result = event.result?.details ?? event.result;
        emit({ type: "tool_end", id: event.toolCallId, name: event.toolName, isError: event.isError, result: boundedResult(result), ms: event.durationMs });
        const target = navigateOf(event.toolName, event.isError, result);
        if (target) emit({ type: "navigate", ...target });
      }
    });
    await session.prompt(text);
    if (signal?.aborted) return emit({ type: "cancelled" });
    if (stale()) return emit(disconnected);
    const failure = providerError(session);
    if (failure) emit({ type: "error", message: failure, ...(failure === CREDENTIAL_REJECTED ? { setup: true } : {}) });
    else emit({ type: "done", text: session.getLastAssistantText() ?? "" });
  } catch (e) {
    if (signal?.aborted) emit({ type: "cancelled" });
    else if (stale()) emit(disconnected);
    else {
      console.warn(`[agent] turn failed: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
      emit({ type: "error", message: friendlyProviderError(e instanceof Error ? e.message : "") });
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
    chat.busy = false;
    if (chat.retired) chat.session?.dispose();
  }
}

// ── Reading delivery evidence ───────────────────────────────────────────

const Num = Type.Union([Type.Number(), Type.Null()]);
const DRAFT = Type.Object({
  supplier: Type.Union([Type.String(), Type.Null()], { description: "Supplier as written, else null" }),
  docRef: Type.Union([Type.String(), Type.Null()], { description: "Delivery note / invoice number as written, else null" }),
  lines: Type.Array(Type.Object({
    rawText: Type.String({ description: "The line as written or said" }),
    skuCode: Type.Union([Type.String(), Type.Null()], { description: "Catalogue code only when clearly matched" }),
    candidates: Type.Array(Type.String(), { description: "Up to 3 plausible catalogue codes" }),
    qty: Type.Union([Type.Integer(), Type.Null()], { description: "Quantity as written; null if unreadable" }),
    unit: Type.Union([Type.String(), Type.Null()]),
    condition: Type.Union([Type.String(), Type.Null()]),
    packageCount: Type.Union([Type.Integer(), Type.Null()]),
    packageDimsCm: Type.Union([Type.Object({ lCm: Num, wCm: Num, hCm: Num }), Type.Null()], { description: "One package, cm" }),
    itemWeightKg: Num,
    packageWeightKg: Num,
    statedTotalWeightKg: Num,
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    questions: Type.Array(Type.String()),
  })),
  unreadable: Type.Array(Type.String(), { description: "Parts that could not be read" }),
});

export interface ReadInput {
  catalogue: { code: string; model: string; variant: string; category: string }[];
  evidence: { kind: string; mime?: string; data?: string; text?: string; note?: string }[];
}

export async function readDeliveryEvidence(input: ReadInput): Promise<{ model: string; draft: unknown } | { error: string }> {
  const epoch = credentialEpoch;
  const changed = { error: "Jarvis was logged out or switched to another key while reading. Log in if needed, then read the evidence again." };
  const r = await resolveModel();
  if ("error" in r) return { error: r.error };
  const images: ImageContent[] = input.evidence.flatMap((e) => (e.data && e.mime?.startsWith("image/") ? [{ type: "image" as const, data: e.data, mimeType: e.mime }] : []));
  if (images.length && !r.model.input.includes("image")) return { error: "The connected model can't read photos. Connect a Claude API key with Log in, or enter the counted lines by hand." };
  let draft: unknown = null;
  const submit: ToolDefinition = {
    name: "submit_receipt_draft",
    label: "Submit receipt draft",
    description: "Submit the draft receipt read from the evidence. Call it exactly once.",
    parameters: DRAFT,
    execute: async (_id, params) => {
      draft = params;
      return { content: [{ type: "text", text: "Draft received. Staff will verify it." }], details: {} };
    },
  };
  const parts = [
    `${images.length} photo(s) attached.`,
    ...input.evidence.flatMap((e) => (e.text ? [`${e.kind === "voice" ? "Voice note transcript" : "Note"}: ${e.text}`] : e.note ? [`(${e.note})`] : [])),
    `Catalogue (code | model | variant | category):\n${input.catalogue.map((c) => `${c.code} | ${c.model} | ${c.variant} | ${c.category}`).join("\n")}`,
    "Read the evidence and call submit_receipt_draft once.",
  ];
  if (epoch !== credentialEpoch) return changed;
  const session = await newSession(r, `${RECEIPT_READING_RULES}\nAlways answer by calling submit_receipt_draft exactly once, then stop.`, [submit]);
  if (epoch !== credentialEpoch) { session.dispose(); return changed; }
  extractions.add(session);
  try {
    await session.prompt(parts.join("\n\n"), { images });
    if (epoch !== credentialEpoch) return changed;
    // Pi silently drops images it cannot decode; never let the model "read" a photo it never saw.
    const firstUser = session.messages.find((m) => m.role === "user") as { content?: unknown } | undefined;
    const seen = Array.isArray(firstUser?.content) ? firstUser.content.filter((c: { type?: string }) => c?.type === "image").length : 0;
    if (seen < images.length) return { error: `${images.length - seen} of ${images.length} photo(s) could not be decoded (damaged or unsupported image). Retake the photo or enter the counted lines by hand.` };
    const failure = providerError(session);
    if (failure) return { error: `Jarvis couldn't read the evidence: ${failure}` };
  } catch (e) {
    if (epoch !== credentialEpoch) return changed;
    console.warn(`[agent] reading failed: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
    return { error: `Jarvis couldn't read the evidence: ${friendlyProviderError(e instanceof Error ? e.message : "")}` };
  } finally {
    extractions.delete(session);
    session.dispose();
  }
  return draft ? { model: `${r.model.provider}/${r.model.id}`, draft } : { error: "Jarvis couldn't turn this evidence into receipt lines. Try a clearer photo or note, or enter the counted lines by hand." };
}
