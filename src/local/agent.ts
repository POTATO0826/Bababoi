// The local warehouse agent: Pi (https://pi.dev) with the operator's own provider login.
// Credentials stay in ~/.pi/agent/auth.json (written by `pi` → /login) or the server environment; nothing
// reaches the browser. Sessions get only the tools passed in: no shell, files, extensions or skills.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type, type ImageContent } from "@earendil-works/pi-ai";
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
import { RECEIPT_READING_RULES } from "../domain/receipt-reading";

process.env.PI_TELEMETRY ??= "0";
process.env.PI_SKIP_VERSION_CHECK ??= "1";

/** Default models when WAREORB_AGENT_MODEL is not set: the Codex subscription first, then an Anthropic key. */
const PREFERRED = [
  { provider: "openai-codex", id: "gpt-6.1-sol" },
  { provider: "anthropic", id: "claude-sonnet-5-5" },
] as const;

export const SETUP_HINT = "One-time operator setup in a terminal: run `pi`, then `/login` and choose OpenAI (ChatGPT Plus/Pro) or Anthropic (API key). Then restart `bun run demo`.";

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
      if (!model) return { error: `WAREORB_AGENT_MODEL=${explicit} is not a known provider/model.` };
      if (rt.hasConfiguredAuth(provider)) return { runtime: rt, model };
      if (attempt) return { error: `No credentials for ${provider}. ${SETUP_HINT}` };
      continue;
    }
    for (const c of PREFERRED) {
      const model = rt.getModel(c.provider, c.id);
      if (model && rt.hasConfiguredAuth(c.provider)) return { runtime: rt, model };
    }
  }
  return { error: `No agent provider is configured. ${SETUP_HINT}` };
}

let resolver: () => Promise<Resolved> = resolveConfiguredModel;

/** The model the agent uses now. */
export const resolveModel = () => resolver();

/**
 * Tests only: run the agent against a scripted provider instead of the operator's login.
 * Passing null restores the real resolver. Never called by the demo server.
 */
export function setModelResolverForTests(fn: (() => Promise<Resolved>) | null) {
  resolver = fn ?? resolveConfiguredModel;
  for (const [id, c] of chats) { c.session?.dispose(); chats.delete(id); }
}

export interface AgentStatus {
  ready: boolean;
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
  if ("error" in r) return { ready: false, reason: r.error };
  return {
    ready: true, provider: r.model.provider, model: r.model.id, modelName: r.model.name,
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

/** The last assistant error, if the provider refused or failed the request. */
function providerError(session: AgentSession): string | null {
  const last = [...session.messages].reverse().find((m) => m.role === "assistant") as { stopReason?: string; errorMessage?: string } | undefined;
  if (last?.stopReason !== "error") return null;
  const message = last.errorMessage || "The model provider returned an error";
  // Expired or revoked logins: point at the one-time operator step, never ask for a key in the browser.
  return /401|403|unauthori[sz]ed|invalid.*(api key|token|credential)|expired|authentication/i.test(message) ? `The provider rejected the credentials (${message.slice(0, 160)}). ${SETUP_HINT}` : message;
}

// ── Warehouse analyst chat ───────────────────────────────────────────────

export const ANALYST_PROMPT = `You are the WareOrb warehouse analyst in a furniture warehouse console. This presentation uses synthetic demo data.
You see the warehouse only through your tools: get_inventory, get_movements, get_purchase_orders and analyze_reorder. Call tools before giving any number; never invent stock, sales, costs, capacity or prices.
For "what/how much should we reorder": call analyze_reorder (and others as needed), then explain per SKU: available (on hand − reserved), incoming purchase orders, net sales in the window and recorded history, the cover target, and the recommended quantity with its cost and bays. The recommended quantities are already feasible together: one shared remaining budget (after open orders at their own cost) and the free bays (after space kept for incoming orders) are allocated in allocationPriority order. Say when an item gets less than its candidate quantity because the shared budget or bays ran out, and report the plan totals and what is left.
If the data is insufficient (no unit cost, no sales in the window, history shorter than the window), say so plainly and recommend no number for that SKU.
You cannot post stock, record purchases or dispatch goods. When something should be ordered, say that a person records the confirmed supplier purchase in Replenish.
Reply briefly in the user's language (English or Chinese). Money in RM.`;

export type AgentEvent =
  | { type: "status"; model: string; provider: string; modelName?: string; subscription?: boolean }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; isError: boolean; result: unknown; ms?: number }
  | { type: "done"; text: string }
  | { type: "cancelled" }
  | { type: "error"; message: string; setup?: boolean };

interface Chat { session: AgentSession | null; model: string; provider: string; modelName?: string; subscription?: boolean; at: number; busy: boolean }
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
  if (chat?.busy) return emit({ type: "error", message: "The agent is still answering the previous question. Wait for it or stop it first." });
  if (!chat && chats.size >= MAX_CHATS) return emit({ type: "error", message: "Too many open agent conversations; restart the demo server." });
  // Reserve the conversation before any await, so two simultaneous requests cannot both create one.
  if (!chat) { chat = { session: null, model: "", provider: "", at: Date.now(), busy: true }; chats.set(sessionId, chat); }
  chat.busy = true;
  chat.at = Date.now();
  let unsubscribe = () => {};
  const onAbort = () => { void chat!.session?.abort(); };
  try {
    if (!chat.session) {
      const r = await resolveModel();
      if ("error" in r) { chats.delete(sessionId); return emit({ type: "error", message: r.error, setup: true }); }
      chat.session = await newSession(r, ANALYST_PROMPT, tools());
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
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") emit({ type: "text", delta: event.assistantMessageEvent.delta });
      else if (event.type === "tool_execution_start") emit({ type: "tool_start", id: event.toolCallId, name: event.toolName, args: boundedResult(event.args) });
      else if (event.type === "tool_execution_end") emit({ type: "tool_end", id: event.toolCallId, name: event.toolName, isError: event.isError, result: boundedResult(event.result?.details ?? event.result), ms: event.durationMs });
    });
    await session.prompt(text);
    if (signal?.aborted) return emit({ type: "cancelled" });
    const failure = providerError(session);
    if (failure) emit({ type: "error", message: failure, ...(failure.includes(SETUP_HINT) ? { setup: true } : {}) });
    else emit({ type: "done", text: session.getLastAssistantText() ?? "" });
  } catch (e) {
    if (signal?.aborted) emit({ type: "cancelled" });
    else emit({ type: "error", message: e instanceof Error ? e.message : "The agent failed" });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
    chat.busy = false;
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
  const r = await resolveModel();
  if ("error" in r) return { error: r.error };
  const images: ImageContent[] = input.evidence.flatMap((e) => (e.data && e.mime?.startsWith("image/") ? [{ type: "image" as const, data: e.data, mimeType: e.mime }] : []));
  if (images.length && !r.model.input.includes("image")) return { error: `${r.model.provider}/${r.model.id} cannot read photos. Choose a model with image input.` };
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
  const session = await newSession(r, `${RECEIPT_READING_RULES}\nAlways answer by calling submit_receipt_draft exactly once, then stop.`, [submit]);
  try {
    await session.prompt(parts.join("\n\n"), { images });
    // Pi silently drops images it cannot decode; never let the model "read" a photo it never saw.
    const firstUser = session.messages.find((m) => m.role === "user") as { content?: unknown } | undefined;
    const seen = Array.isArray(firstUser?.content) ? firstUser.content.filter((c: { type?: string }) => c?.type === "image").length : 0;
    if (seen < images.length) return { error: `${images.length - seen} of ${images.length} photo(s) could not be decoded (damaged or unsupported image). Retake the photo or enter the counted lines by hand.` };
    const failure = providerError(session);
    if (failure) return { error: `Reading failed: ${failure}` };
  } catch (e) {
    return { error: `Reading failed: ${e instanceof Error ? e.message : "unknown error"}` };
  } finally {
    session.dispose();
  }
  return draft ? { model: `${r.model.provider}/${r.model.id}`, draft } : { error: "The model returned no structured draft. Enter the counted lines by hand." };
}
