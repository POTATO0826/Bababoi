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
export async function resolveModel(): Promise<Resolved> {
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
  const active = session.getActiveToolNames();
  const allowed = new Set(tools.map((t) => t.name));
  if (active.some((name) => !allowed.has(name))) {
    session.dispose();
    throw new Error(`Refusing to run: unexpected tools enabled (${active.join(", ")})`);
  }
  return session;
}

/** The last assistant error, if the provider refused or failed the request. */
function providerError(session: AgentSession): string | null {
  const last = [...session.messages].reverse().find((m) => m.role === "assistant") as { stopReason?: string; errorMessage?: string } | undefined;
  return last?.stopReason === "error" ? (last.errorMessage || "The model provider returned an error") : null;
}

// ── Warehouse analyst chat ───────────────────────────────────────────────

export const ANALYST_PROMPT = `You are the WareOrb warehouse analyst in a furniture warehouse console. This presentation uses synthetic demo data.
You see the warehouse only through your tools: get_inventory, get_movements, get_purchase_orders and analyze_reorder. Call tools before giving any number; never invent stock, sales, costs, capacity or prices.
For "what/how much should we reorder": call analyze_reorder (and others as needed), then explain per SKU: available (on hand − reserved), incoming purchase orders, net sales in the window and recorded history, the cover target, remaining budget and free-bay limits, and the recommended quantity with its cost. Check "combined" for budget or space conflicts and prioritise when they exist.
If the data is insufficient (no unit cost, no sales in the window, history shorter than the window), say so plainly and recommend no number for that SKU.
You cannot post stock, record purchases or dispatch goods. When something should be ordered, say that a person records the confirmed supplier purchase in Replenish.
Reply briefly in the user's language (English or Chinese). Money in RM.`;

export type AgentEvent =
  | { type: "status"; model: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; isError: boolean; result: unknown; ms?: number }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

const chats = new Map<string, { session: AgentSession; model: string; at: number; busy: boolean }>();
const CHAT_IDLE_MS = 30 * 60_000;

export async function runAnalystTurn(sessionId: string, text: string, tools: () => ToolDefinition[], emit: (e: AgentEvent) => void): Promise<void> {
  for (const [id, c] of chats) if (Date.now() - c.at > CHAT_IDLE_MS && !c.busy) { c.session.dispose(); chats.delete(id); }
  let chat = chats.get(sessionId);
  if (chat?.busy) return emit({ type: "error", message: "The agent is still answering the previous question." });
  if (!chat) {
    const r = await resolveModel();
    if ("error" in r) return emit({ type: "error", message: r.error });
    chat = { session: await newSession(r, ANALYST_PROMPT, tools()), model: `${r.model.provider}/${r.model.id}`, at: Date.now(), busy: false };
    chats.set(sessionId, chat);
  }
  chat.busy = true;
  chat.at = Date.now();
  emit({ type: "status", model: chat.model });
  const unsubscribe = chat.session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") emit({ type: "text", delta: event.assistantMessageEvent.delta });
    else if (event.type === "tool_execution_start") emit({ type: "tool_start", id: event.toolCallId, name: event.toolName, args: event.args });
    else if (event.type === "tool_execution_end") emit({ type: "tool_end", id: event.toolCallId, name: event.toolName, isError: event.isError, result: event.result?.details ?? event.result, ms: event.durationMs });
  });
  try {
    await chat.session.prompt(text);
    const failure = providerError(chat.session);
    if (failure) emit({ type: "error", message: failure });
    else emit({ type: "done", text: chat.session.getLastAssistantText() ?? "" });
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : "The agent failed" });
  } finally {
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
    const failure = providerError(session);
    if (failure) return { error: `Reading failed: ${failure}` };
  } catch (e) {
    return { error: `Reading failed: ${e instanceof Error ? e.message : "unknown error"}` };
  } finally {
    session.dispose();
  }
  return draft ? { model: `${r.model.provider}/${r.model.id}`, draft } : { error: "The model returned no structured draft. Enter the counted lines by hand." };
}
