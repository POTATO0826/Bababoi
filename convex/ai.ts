"use node";
// Claude: receipt extraction (structured output), product icons, and Jarvis (tool loop).
// Jarvis may read, navigate and request delivery quotes. It can never approve, post, collect or book.
import Anthropic from "@anthropic-ai/sdk";
import type { FunctionArgs } from "convex/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env, internalAction, type ActionCtx } from "./_generated/server";
import { sanitizeSvg } from "../src/domain/svg";
import { fit, piecesFor } from "../src/domain/vehicle";

const MODEL = () => env.CLAUDE_MODEL || "claude-opus-5";
// Server-side refusal fallback: a declined request is re-run on Anthropic's recommended model.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

let client: Anthropic | null = null;
function claude() {
  if (!env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

async function slot(ctx: ActionCtx) {
  return (await ctx.runMutation(internal.quotes.takeSlot, { name: "claude" })).ok;
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();

// ── Receipt extraction ───────────────────────────────────────────────────

const RECEIPT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "docRef", "lines"],
  properties: {
    supplier: { type: "string", description: "Supplier name, or empty string" },
    docRef: { type: "string", description: "Delivery note / invoice number, or empty string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rawText", "skuCode", "candidates", "qty", "confidence", "questions"],
        properties: {
          rawText: { type: "string", description: "The line as written or said" },
          skuCode: { type: "string", description: "Catalogue code only when clearly identified, else empty string" },
          candidates: { type: "array", items: { type: "string" }, description: "Up to 3 plausible catalogue codes" },
          qty: { type: "integer", description: "Quantity as written; 0 if unreadable" },
          confidence: { type: "number", description: "0 to 1" },
          questions: { type: "array", items: { type: "string" }, description: "Short questions for staff about anything unclear" },
        },
      },
    },
  },
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const extractReceipt = internalAction({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }): Promise<null> => {
    const done = async (a: Omit<FunctionArgs<typeof internal.receiving.setExtraction>, "receiptId">): Promise<null> =>
      await ctx.runMutation(internal.receiving.setExtraction, { receiptId, ...a });
    const anthropic = claude();
    if (!anthropic) return await done({ status: "error", error: "AI reading is off (no ANTHROPIC_API_KEY) — enter lines by hand" });
    if (!(await slot(ctx))) return await done({ status: "error", error: "Busy — try again in a minute" });
    const data = await ctx.runQuery(internal.receiving.forExtraction, { receiptId });
    if (!data) return null;

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const e of data.evidence) {
      if (e.storageId && (e.kind === "photo" || e.kind === "document")) {
        const blob = await ctx.storage.get(e.storageId);
        if (!blob) continue;
        const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        const type = e.mime || blob.type;
        if (type === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
        else if (IMAGE_TYPES.has(type)) content.push({ type: "image", source: { type: "base64", media_type: type as "image/jpeg", data: b64 } });
      }
      if (e.text) content.push({ type: "text", text: `${e.kind === "voice" ? "Voice note (transcript)" : "Note"}: ${e.text}` });
    }
    if (!content.length) return await done({ status: "error", error: "Nothing readable yet" });
    content.push({ type: "text", text: "Extract the received goods as lines." });

    const catalogue = data.catalogue.map((s) => `${s.code} | ${s.model} | ${s.variant} | ${s.category}`).join("\n");
    try {
      const res = await anthropic.beta.messages.create({
        model: MODEL(),
        max_tokens: 8000,
        ...FALLBACK,
        output_config: { effort: "medium", format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
        system: `You read furniture warehouse delivery notes: photos of handwritten notes, printed documents, and spoken notes in English or Mandarin.
Turn them into lines for staff to verify. Staff will physically count everything; you only draft.
Rules: never guess a SKU — use skuCode only when the model and variant clearly match the catalogue, otherwise leave it empty and give candidates plus a question. Never guess a quantity — use 0 when unreadable and ask. Do not infer sizes or weights. Common Chinese words: 沙发 sofa, 桌 table, 椅 chair, 衣柜 wardrobe, 床 bed, 床垫 mattress, 镜 mirror, 灯 lamp.
Catalogue (code | model | variant | category):
${catalogue}`,
        messages: [{ role: "user", content }],
      });
      if (res.stop_reason === "refusal") return await done({ status: "error", error: "Couldn't read this — enter lines by hand" });
      const parsed = JSON.parse(textOf(res.content)) as {
        supplier: string;
        docRef: string;
        lines: { rawText: string; skuCode: string; candidates: string[]; qty: number; confidence: number; questions: string[] }[];
      };
      await done({
        status: "done",
        ...(parsed.supplier ? { supplier: parsed.supplier.slice(0, 80) } : {}),
        ...(parsed.docRef ? { docRef: parsed.docRef.slice(0, 40) } : {}),
        lines: parsed.lines.slice(0, 30).map((l, i) => ({
          key: `ai${Date.now()}${i}`,
          rawText: l.rawText.slice(0, 200),
          skuCode: l.skuCode || null,
          candidates: l.candidates.slice(0, 4),
          qty: l.qty > 0 ? l.qty : null,
          condition: "good",
          confidence: Math.max(0, Math.min(1, l.confidence)),
          questions: l.questions.slice(0, 4).map((q) => q.slice(0, 160)),
          verified: false,
          source: "ai" as const,
        })),
      });
    } catch (e) {
      await done({ status: "error", error: e instanceof Anthropic.APIError ? `AI error ${e.status}` : "Couldn't read this — enter lines by hand" });
    }
    return null;
  },
});

// ── Product icons ────────────────────────────────────────────────────────

const ICON_SYSTEM = `You draw product icons for a warehouse inventory app with a dark UI.
Return exactly one SVG document and nothing else.

Requirements:
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">, transparent background.
- A clean flat illustration of the single piece of furniture in a three-quarter view, centred, about 4px padding.
- Use the given material colour as the main fill, plus two or three lighter/darker tints of it for shading.
- Outline shapes with a 1.25px stroke in a dark tint of the material colour; stroke-linejoin="round".
- Simple geometry only: rect, path, circle, ellipse, polygon, line, g, and linearGradient. At most 40 elements.
- No text, no <script>, no <image>, no <foreignObject>, no external references, no event attributes.`;

export const generateIcon = internalAction({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<null> => {
    const sku = await ctx.runQuery(internal.aiData.skuForIcon, { code });
    if (!sku) return null;
    const anthropic = claude();
    if (!anthropic) {
      await ctx.runMutation(internal.aiData.setIcon, { code, status: "unavailable" });
      return null;
    }
    try {
      const res = await anthropic.beta.messages.create({
        model: MODEL(),
        max_tokens: 16000,
        ...FALLBACK,
        output_config: { effort: "low" },
        system: ICON_SYSTEM,
        messages: [{ role: "user", content: `Furniture: ${sku.model} — ${sku.variant}\nCategory: ${sku.category} (3D shape: ${sku.kind})\nMaterial colour: ${sku.color}` }],
      });
      const svg = res.stop_reason === "refusal" ? null : sanitizeSvg(textOf(res.content));
      await ctx.runMutation(internal.aiData.setIcon, svg ? { code, svg, status: "ready" } : { code, status: "failed" });
    } catch {
      await ctx.runMutation(internal.aiData.setIcon, { code, status: "failed" });
    }
    return null;
  },
});

// ── Jarvis ───────────────────────────────────────────────────────────────

const COMMANDS = ["receive", "ageing", "deals", "delivery", "approve", "collect", "replenish", "close"] as const;
type Effect =
  | { type: "show_on_map"; sku_code: string }
  | { type: "run_command"; command: (typeof COMMANDS)[number] }
  | { type: "open_deal"; deal_id: string; sku_code: string };

const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: "object" as const,
  additionalProperties: false,
  properties,
  required,
});

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_stock",
    description: "Find SKUs by model, variant, colour or code. Returns counts and bay codes.",
    strict: true,
    input_schema: obj({ query: { type: "string" } }),
  },
  {
    name: "list_ageing",
    description: "Batches that have sat unsold past the owner's rule (old stock to clear), with any open deal.",
    strict: true,
    input_schema: obj({}),
  },
  {
    name: "list_my_work",
    description: "Deals and receipts waiting for the current user's role.",
    strict: true,
    input_schema: obj({}),
  },
  {
    name: "get_deal",
    description: "One deal by code (e.g. D-1001) or by product/buyer words: status, buyer, missing fields, current quotes.",
    strict: true,
    input_schema: obj({ ref: { type: "string" } }),
  },
  {
    name: "show_on_map",
    description: "Fly the 3D warehouse map to a SKU's bays.",
    strict: true,
    input_schema: obj({ sku_code: { type: "string" } }),
  },
  {
    name: "run_command",
    description:
      "Open a workflow panel on screen: receive (delivery notes), ageing (old stock), deals, delivery (quotes), approve (owner approvals), collect (warehouse pickups), replenish (reorder), close (back to the map). Opening a panel never approves or changes anything.",
    strict: true,
    input_schema: obj({ command: { type: "string", enum: [...COMMANDS] } }),
  },
  {
    name: "get_delivery_quotes",
    description:
      "Request Lalamove delivery quotations for a deal (same as the Get quotes button). Only works when the deal's buyer, price and confirmed destination are complete. Returns the quotes with their source label and expiry.",
    strict: true,
    input_schema: obj({ ref: { type: "string", description: "Deal code or product words" } }),
  },
];

const JARVIS_SYSTEM = `You are Jarvis, the voice assistant inside WareOrb, a furniture warehouse app with a live 3D map.
Your replies are spoken aloud: one or two short sentences, no lists, no markdown, numbers in words a speaker would say.
Reply in the language the user spoke (English or Mandarin Chinese).
Always use tools for facts — never invent stock counts, prices, quotes, coordinates or dates.
When the user asks for something a panel shows, call run_command to open it and show_on_map to fly there.
You cannot approve, reject, post receipts, confirm collection, create purchase orders or book deliveries. If asked, say a person must click it, and open the right panel with run_command.
Delivery quotes: say the source ("Lalamove sandbox", "carrier", "saved demo"), the total in ringgit, and when it expires. Sandbox prices are test prices, not confirmed. If a cost such as unloading is unknown, say it is unknown.`;

export const jarvisAsk = action({
  args: {
    actor: v.object({ role: v.union(v.literal("owner"), v.literal("sales"), v.literal("warehouse")), name: v.string() }),
    text: v.string(),
    context: v.object({ stage: v.string(), selected: v.union(v.string(), v.null()), dealId: v.union(v.string(), v.null()) }),
  },
  handler: async (ctx, { actor, text, context }): Promise<{ reply: string; effects: Effect[]; unavailable?: true }> => {
    const anthropic = claude();
    if (!anthropic) return { reply: "", effects: [], unavailable: true };
    if (!(await slot(ctx))) return { reply: "I'm busy for a moment, try again.", effects: [] };
    const effects: Effect[] = [];

    const run = async (name: string, input: Record<string, unknown>): Promise<unknown> => {
      switch (name) {
        case "search_stock":
          return await ctx.runQuery(internal.aiData.searchStock, { query: String(input.query ?? "") });
        case "list_ageing":
          return await ctx.runQuery(internal.aiData.attention, { now: Date.now() });
        case "list_my_work":
          return await ctx.runQuery(internal.aiData.work, { role: actor.role });
        case "get_deal": {
          const d = await ctx.runQuery(internal.aiData.dealByRef, { ref: String(input.ref ?? "") });
          if (d) effects.push({ type: "open_deal", deal_id: d.id, sku_code: d.sku_code });
          return d ? { ...d, id: undefined, batchId: undefined, packages: undefined } : { error: "No such deal" };
        }
        case "show_on_map":
          effects.push({ type: "show_on_map", sku_code: String(input.sku_code ?? "") });
          return { ok: true };
        case "run_command": {
          const command = COMMANDS.find((c) => c === input.command);
          if (!command) return { error: "Unknown command" };
          effects.push({ type: "run_command", command });
          return { opened: command };
        }
        case "get_delivery_quotes":
          return await deliveryQuotes(ctx, actor, String(input.ref ?? ""), effects);
        default:
          return { error: "Unknown tool" };
      }
    };

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: "user",
        content: `[Screen: panel=${context.stage}${context.selected ? `, selected SKU ${context.selected}` : ""}${context.dealId ? ", a deal is open" : ""}. User role: ${actor.role} (${actor.name}).]\n${text}`,
      },
    ];
    const started = Date.now();
    try {
      for (let i = 0; i < 4; i++) {
        const res = await anthropic.beta.messages.create({
          model: MODEL(),
          max_tokens: 4000,
          ...FALLBACK,
          output_config: { effort: "low" },
          system: JARVIS_SYSTEM,
          tools: TOOLS,
          tool_choice: { type: "auto" },
          messages,
        });
        if (res.stop_reason === "refusal") return { reply: "I can't help with that one.", effects };
        if (res.stop_reason !== "tool_use" || Date.now() - started > 20_000) return { reply: textOf(res.content) || "Done.", effects };
        messages.push({ role: "assistant", content: res.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const b of res.content) {
          if (b.type !== "tool_use") continue;
          try {
            results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await run(b.name, b.input as Record<string, unknown>)) });
          } catch (e) {
            results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: e instanceof Error ? e.message.slice(0, 200) : "Failed" });
          }
        }
        messages.push({ role: "user", content: results });
      }
      return { reply: "Done.", effects };
    } catch (e) {
      return { reply: "", effects, unavailable: e instanceof Anthropic.AuthenticationError ? true : undefined };
    }
  },
});

/** Jarvis → the same quote request as the button: role-checked, deduped, rate-limited, no invented prices. */
async function deliveryQuotes(ctx: ActionCtx, actor: { role: "owner" | "sales" | "warehouse"; name: string }, ref: string, effects: Effect[]) {
  const d = await ctx.runQuery(internal.aiData.dealByRef, { ref });
  if (!d) return { error: "No open deal found" };
  effects.push({ type: "run_command", command: "delivery" }, { type: "open_deal", deal_id: d.id, sku_code: d.sku_code });
  if (d.missing.length) return { deal: d.code, cannot_quote_yet: d.missing };
  const { services, source } = await ctx.runAction(api.lalamove.services, {});
  const pieces = piecesFor(d.packages, d.qty);
  const fitting = services
    .map((s) => ({ s, f: fit(pieces, s) }))
    .filter((x) => x.f.status === "fits" || x.f.status === "check")
    .sort((a, b) => a.s.loadKg - b.s.loadKg)
    .slice(0, 2);
  if (!fitting.length) return { deal: d.code, error: "No vehicle fits this load" };
  try {
    await ctx.runMutation(api.quotes.request, {
      actor,
      dealId: d.id as Id<"deals">,
      expectedVersion: d.version,
      services: fitting.map((x) => ({ key: x.s.key, specialRequests: [] })),
    });
  } catch (e) {
    return { deal: d.code, error: e instanceof Error ? e.message.replace(/^.*ConvexError:\s*/, "").slice(0, 160) : "Request refused" };
  }
  // Wait briefly for the provider (the quote also appears on screen when it lands).
  let latest = d;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 700));
    latest = (await ctx.runQuery(internal.aiData.dealByRef, { ref: d.code })) ?? latest;
    if (!latest.quotes.some((q) => q.status === "pending")) break;
  }
  return { deal: d.code, vehicles_source: source === "live" ? "Lalamove city list" : "sample sizes", quotes: latest.quotes };
}
