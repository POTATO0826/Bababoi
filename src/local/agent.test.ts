// Pi 1.4.0 SDK behaviour with a MOCKED PROVIDER (Pi's scripted faux provider). These tests prove the
// wiring — tool allowlist, streamed events, errors, cancellation, structured drafts — not a live model.
import { afterEach, describe, expect, test } from "bun:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { readDeliveryEvidence, runAnalystTurn, setModelResolverForTests, type AgentEvent } from "./agent";
import { mockedPi, syntheticSnapshot } from "./test-fixtures";
import { reorderView, warehouseTools } from "./warehouse-tools";

const NOW = Date.now();
/** A valid 1×1 PNG (Pi decodes and normalises images before sending them). */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const snapshot = syntheticSnapshot(NOW);
const tools = () => warehouseTools(async () => snapshot, () => NOW);
afterEach(() => setModelResolverForTests(null));

async function turn(sessionId: string, text: string, signal?: AbortSignal) {
  const events: AgentEvent[] = [];
  await runAnalystTurn(sessionId, text, tools, (e) => events.push(e), signal);
  return events;
}

describe("warehouse analyst turn (mocked provider)", () => {
  test("streams text deltas, real tool calls with arguments and results, then done", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([
      fauxAssistantMessage([fauxText("Checking the reorder plan. "), fauxToolCall("analyze_reorder", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage("Order 4 sofas."),
    ]);
    const events = await turn("session-stream-1", "What should we reorder?");
    expect(events[0]).toMatchObject({ type: "status", model: "mocked-provider/mocked-model", provider: "mocked-provider" });
    const start = events.find((e) => e.type === "tool_start")!;
    const end = events.find((e) => e.type === "tool_end")!;
    expect(start).toMatchObject({ name: "analyze_reorder", args: {} });
    expect(end).toMatchObject({ name: "analyze_reorder", isError: false, id: (start as { id: string }).id });
    // The tool result is the same plan the Replenish panel shows, computed from the live snapshot.
    expect((end as { result: unknown }).result).toEqual(JSON.parse(JSON.stringify(reorderView(snapshot, {}, NOW))));
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toBe("Checking the reorder plan. Order 4 sofas.");
    expect(events.at(-1)).toEqual({ type: "done", text: "Order 4 sofas." });
  });

  test("only the four read-only warehouse tools exist; a shell request fails as an unknown tool", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("bash", { command: "cat ~/.pi/agent/auth.json" })], { stopReason: "toolUse" }),
      // The model is told about exactly these tools (Pi lists them on the system message).
      (context) => fauxAssistantMessage(`tools=${context.messages.flatMap((m) => ((m as { toolsAdded?: { name: string }[] }).toolsAdded ?? []).map((t) => t.name)).sort().join(",")}`),
    ]);
    const events = await turn("session-tools-1", "Run a shell command");
    const done = events.at(-1) as { type: string; text: string };
    expect(done).toEqual({ type: "done", text: "tools=analyze_reorder,get_inventory,get_movements,get_purchase_orders" });
    const bash = events.find((e) => e.type === "tool_end" && e.name === "bash") as { isError: boolean } | undefined;
    if (bash) expect(bash.isError).toBe(true);
  });

  test("missing credentials give the operator setup step, not a scripted answer", async () => {
    setModelResolverForTests(async () => ({ error: "No agent provider is configured. One-time operator setup in a terminal: run `pi`, then `/login`…" }));
    expect(await turn("session-nocreds-1", "Stock?")).toEqual([{ type: "error", message: "No agent provider is configured. One-time operator setup in a terminal: run `pi`, then `/login`…", setup: true }]);
  });

  test("a rejected credential is reported with the setup hint", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "401 Unauthorized: invalid api key" })]);
    const events = await turn("session-badcreds-1", "Stock?");
    expect(events.at(-1)).toMatchObject({ type: "error" });
    expect((events.at(-1) as { message: string }).message).toMatch(/rejected the credentials.*run `pi`, then `\/login`/);
  });

  test("a busy conversation refuses a second simultaneous question; cancellation stops the turn", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    let release = () => {};
    faux.setResponses([async () => { await new Promise<void>((r) => (release = r)); return fauxAssistantMessage("late"); }]);
    const abort = new AbortController();
    const first = turn("session-busy-1", "First", abort.signal);
    await new Promise((r) => setTimeout(r, 50));
    expect(await turn("session-busy-1", "Second")).toEqual([{ type: "error", message: expect.stringContaining("still answering") }]);
    abort.abort();
    release();
    const events = await first;
    expect(events.at(-1)).toEqual({ type: "cancelled" });
    // The conversation is free again afterwards.
    faux.setResponses([fauxAssistantMessage("ok")]);
    expect((await turn("session-busy-1", "Third")).at(-1)).toEqual({ type: "done", text: "ok" });
  });

  test("large tool results are capped for the browser", async () => {
    const { boundedResult } = await import("./agent");
    const big = { rows: "x".repeat(300_000) };
    expect(boundedResult(big)).toMatchObject({ truncated: true, totalChars: 300_011 });
    expect(boundedResult({ ok: 1 })).toEqual({ ok: 1 });
  });
});

describe("reading delivery evidence into a draft (mocked provider)", () => {
  const catalogue = [{ code: "CHAIR-LUMA-0410", model: "Luma dining chair", variant: "Oak", category: "chairs" }];

  test("a readable photo becomes the structured draft the model submitted", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    const draft = { supplier: "Luma (synthetic)", docRef: "DN-1", lines: [{ rawText: "Dining chair oak x4", skuCode: "CHAIR-LUMA-0410", candidates: [], qty: 4, unit: "pcs", condition: null, packageCount: 2, packageDimsCm: { lCm: 90, wCm: 60, hCm: 45 }, itemWeightKg: 6, packageWeightKg: null, statedTotalWeightKg: null, confidence: 0.9, questions: [] }], unreadable: [] };
    faux.setResponses([
      (context) => {
        const user = context.messages.find((m) => m.role === "user") as { content: { type: string }[] };
        expect(user.content.some((c) => c.type === "image")).toBe(true);
        return fauxAssistantMessage([fauxToolCall("submit_receipt_draft", draft)], { stopReason: "toolUse" });
      },
      fauxAssistantMessage("Submitted."),
    ]);
    const r = await readDeliveryEvidence({ catalogue, evidence: [{ kind: "photo", mime: "image/png", data: PNG }] });
    expect(r).toEqual({ model: "mocked-provider/mocked-model", draft });
  });

  test("an undecodable photo is refused instead of being silently dropped", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([fauxAssistantMessage([fauxToolCall("submit_receipt_draft", { supplier: null, docRef: null, lines: [], unreadable: [] })], { stopReason: "toolUse" }), fauxAssistantMessage("done")]);
    expect(await readDeliveryEvidence({ catalogue, evidence: [{ kind: "photo", mime: "image/png", data: Buffer.from("not a png").toString("base64") }] })).toEqual({ error: expect.stringContaining("1 of 1 photo(s) could not be decoded") });
  });

  test("a reply without the structured draft is an error, so staff enter lines by hand", async () => {
    const { faux, resolved } = await mockedPi();
    setModelResolverForTests(async () => resolved);
    faux.setResponses([fauxAssistantMessage("The photo is too blurry to read.")]);
    expect(await readDeliveryEvidence({ catalogue, evidence: [{ kind: "note", text: "smudged" }] })).toEqual({ error: "The model returned no structured draft. Enter the counted lines by hand." });
  });

  test("a model without image input refuses photos instead of guessing", async () => {
    const { resolved } = await mockedPi({ input: ["text"] });
    setModelResolverForTests(async () => resolved);
    expect(await readDeliveryEvidence({ catalogue, evidence: [{ kind: "photo", mime: "image/jpeg", data: "AAAA" }] })).toEqual({ error: "mocked-provider/mocked-model cannot read photos. Choose a model with image input." });
  });
});
