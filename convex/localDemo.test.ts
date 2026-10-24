/// <reference types="vite/client" />
// Local demo receiving: voice evidence, unknown condition, measurements and the local agent bridge.
// The bridge tests stub fetch: they prove the backend side of the wiring, not a live model.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const actor = { role: "owner" as const, name: "Client-supplied" };
const ownerToken = "https://wareorb.local-demo|demo-presenter";
type Client = TestConvexForDataModel<DataModel>;
type Line = Doc<"receipts">["lines"][number];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 24, 8)); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function business() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier: ownerToken, email: "presenter@wareorb.local", name: "Demo presenter" });
  const owner = t.withIdentity({ tokenIdentifier: ownerToken, issuer: "https://wareorb.local-demo", subject: "demo-presenter" });
  await owner.mutation(api.receiving.createCatalogItem, {
    actor, code: "CHAIR-LUMA-0410", category: "chairs", kind: "chair", cap: 4, doors: 0, model: "Dining chair", variant: "Oak", color: "#aabbcc",
    homeFloor: 1, homeZone: "A", packages: [{ lCm: 90, wCm: 60, hCm: 45, kg: 12 }], price: { listSen: 0, clearanceSen: 0, unitCostSen: 0 },
  });
  return { t, owner };
}
const store = (t: ReturnType<typeof convexTest>, bytes: number, type: string) => t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
const line = (more: Partial<Line> = {}): Line => ({ key: "l1", rawText: "Dining chair oak x2", skuCode: "CHAIR-LUMA-0410", candidates: [], qty: 2, locations: [{ slot: "1A00", qty: 2 }], condition: "good", confidence: 1, questions: [], verified: true, source: "staff", ...more });

describe("voice evidence", () => {
  it("accepts a recording with a transcript, a recording without one, and keeps typed notes separate", async () => {
    const { t, owner } = await business();
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const webm = await store(t, 2048, "audio/webm;codecs=opus");
    const mp4 = await store(t, 1024, "audio/mp4");
    let v = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "voice", storageId: webm, mime: "audio/webm", text: "Two chairs, ten kilograms each" });
    v = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: v, kind: "voice", storageId: mp4 });
    v = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: v, kind: "note", text: "Typed: 2 cartons" });
    const r = await owner.query(api.receiving.get, { receiptId });
    expect(r?.evidence).toMatchObject([
      { kind: "voice", storageId: webm, text: "Two chairs, ten kilograms each", mime: "audio/webm;codecs=opus", url: expect.any(String) },
      { kind: "voice", storageId: mp4, mime: "audio/mp4", url: expect.any(String) },
      { kind: "note", text: "Typed: 2 cartons", url: null },
    ]);
    expect(r?.evidence[1]?.text).toBeUndefined();
    // The original recording is still retrievable.
    expect(await t.run(async (ctx) => (await ctx.storage.get(webm))?.size)).toBe(2048);
  });

  it("validates the stored file, not the browser's claim", async () => {
    const { t, owner } = await business();
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const image = await store(t, 10, "image/png");
    const big = await store(t, 10 * 1024 * 1024 + 1, "audio/webm");
    const empty = await store(t, 0, "audio/webm");
    const webm = await store(t, 10, "audio/webm");
    const add = (a: Partial<{ storageId: Id<"_storage">; mime: string; text: string }>) => owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "voice", ...a });
    await expect(add({ text: "transcript only" })).rejects.toThrow("needs its recording");
    await expect(add({ storageId: image })).rejects.toThrow("supported audio recording");
    await expect(add({ storageId: big })).rejects.toThrow("no larger than 10 MB");
    await expect(add({ storageId: empty })).rejects.toThrow("must exist");
    await expect(add({ storageId: webm, mime: "audio/mpeg" })).rejects.toThrow("does not match");
    await expect(owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", storageId: webm, text: "x" })).rejects.toThrow("note or voice transcript");
    const v = await add({ storageId: webm });
    await expect(owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: v, kind: "voice", storageId: webm })).rejects.toThrow("already attached");
  });
});

describe("unknown condition stays unknown until a person confirms it", () => {
  it("keeps a blank AI condition blank, keeps a stated problem, and refuses to post until confirmed", async () => {
    const { t, owner } = await business();
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const ev = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "2 chairs, 1 sofa carton damaged" });
    const jobVersion = (await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: ev }))!;
    await t.mutation(internal.receiving.setExtraction, { receiptId, jobVersion, status: "done", lines: [
      line({ key: "a", condition: "", verified: true, source: "ai", locations: undefined }),
      line({ key: "b", condition: "  carton   corner damaged ", source: "ai", locations: undefined }),
    ] });
    let r = (await owner.query(api.receiving.get, { receiptId }))!;
    expect(r.lines.map((l) => [l.condition, l.verified])).toEqual([["", false], ["carton corner damaged", false]]);
    const detail = await owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: r.version!, receivedAt: Date.UTC(2026, 9, 24, 7) });
    const unconfirmed = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: detail, lines: [line({ condition: "" })] });
    await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: unconfirmed })).rejects.toThrow("Confirm the physical condition");
    expect(await t.run(async (ctx) => ctx.db.query("batches").take(1))).toHaveLength(0);
    const confirmed = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: unconfirmed, lines: [line({ condition: "good" })] });
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: confirmed });
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: confirmed });
    r = (await owner.query(api.receiving.get, { receiptId }))!;
    expect(r.status).toBe("posted");
    expect(await t.run(async (ctx) => ctx.db.query("movements").take(5))).toHaveLength(1);
  });
});

describe("measurements", () => {
  it("stores stated values, keeps unknown as null and refuses invalid numbers", async () => {
    const { owner } = await business();
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const m = { unit: "pcs", packageCount: 2, packageDimsCm: { lCm: 90, wCm: 60, hCm: null }, itemWeightKg: 6, packageWeightKg: null, statedTotalWeightKg: null };
    const v = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: 1, lines: [line(m)] });
    expect((await owner.query(api.receiving.get, { receiptId }))?.lines[0]).toMatchObject(m);
    for (const bad of [{ packageCount: 1.5 }, { itemWeightKg: -2 }, { itemWeightKg: 0 }, { statedTotalWeightKg: Number.NaN }, { packageWeightKg: Number.POSITIVE_INFINITY }, { packageDimsCm: { lCm: 0, wCm: 1, hCm: 1 } }]) {
      await expect(owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: v, lines: [line(bad)] })).rejects.toThrow("measurements must be positive numbers");
    }
    expect((await owner.query(api.receiving.get, { receiptId }))?.version).toBe(v);
  });
});

describe("local agent bridge (stubbed loopback agent service)", () => {
  const AGENT = "http://127.0.0.1:3999";
  function local() {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("WAREORB_LOCAL_AGENT_URL", AGENT);
    vi.stubEnv("WAREORB_LOCAL_AGENT_SECRET", "cd".repeat(32));
  }
  async function extract(owner: Client, t: ReturnType<typeof convexTest>, evidence: (receiptId: Id<"receipts">) => Promise<number>) {
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const ev = await evidence(receiptId);
    const jobVersion = (await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: ev }))!;
    await t.action(internal.ai.extractReceipt, { receiptId, jobVersion });
    return (await owner.query(api.receiving.get, { receiptId }))!;
  }
  const photo = (owner: Client, t: ReturnType<typeof convexTest>) => async (receiptId: Id<"receipts">) =>
    await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "photo", storageId: await store(t, 64, "image/png") });

  it("a readable photo becomes an unverified, editable draft with sanitised measurements and blank condition", async () => {
    local();
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => Response.json({
      supplier: " Luma (synthetic) ", docRef: "DN-7781", model: "mocked/mocked",
      lines: [
        { rawText: "Dining chair oak x4", skuCode: "CHAIR-LUMA-0410", candidates: ["NOT-IN-CATALOGUE"], qty: 4, unit: "pcs", condition: null, packageCount: 2, packageDimsCm: { lCm: 90, wCm: 60, hCm: 45 }, itemWeightKg: 6, packageWeightKg: -1, statedTotalWeightKg: "48", confidence: 0.9, questions: [] },
        { rawText: "Lamp ??? x ?", skuCode: null, candidates: [], qty: null, condition: "", confidence: 0.2, questions: ["Which lamp?"] },
        { rawText: "", qty: 3 },
      ],
      unreadable: ["line 3 quantity smudged"],
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { t, owner } = await business();
    const r = await extract(owner, t, photo(owner, t));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${AGENT}/internal/extract-receipt`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${"cd".repeat(32)}`);
    expect(JSON.parse(String(init.body)).evidence[0]).toMatchObject({ kind: "photo", mime: "image/png", data: expect.any(String) });
    expect(r).toMatchObject({ supplier: "Luma (synthetic)", docRef: "DN-7781", extraction: { status: "done" } });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ skuCode: "CHAIR-LUMA-0410", candidates: [], qty: 4, condition: "", verified: false, source: "ai", unit: "pcs", packageCount: 2, packageDimsCm: { lCm: 90, wCm: 60, hCm: 45 }, itemWeightKg: 6, packageWeightKg: null, statedTotalWeightKg: 48 });
    expect(r.lines[0]!.questions).toContain("Unreadable: line 3 quantity smudged");
    expect(r.lines[1]).toMatchObject({ skuCode: null, qty: null, condition: "", verified: false });
    expect(r.lines[0]!.locations).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.query("batches").take(1))).toHaveLength(0);
  });

  it.each([
    ["an unreadable photo", () => Response.json({ supplier: null, docRef: null, lines: [], unreadable: ["The whole photo is blurred"] }), /No goods lines could be read \(The whole photo is blurred\)/],
    ["a malformed reply", () => Response.json({ lines: "garbage" }), /No goods lines could be read/],
    ["a non-JSON reply", () => new Response("<html>oops", { status: 200 }), /Jarvis couldn't read this evidence \(error 200\)/],
    ["a reading error", () => Response.json({ error: "No agent provider is configured. Run pi /login" }, { status: 422 }), /No agent provider is configured/],
    ["an unreachable service", () => { throw new TypeError("fetch failed"); }, /Jarvis isn't reachable right now/],
  ])("%s is shown as an extraction error and creates no lines", async (_name, reply, message) => {
    local();
    vi.stubGlobal("fetch", vi.fn(async () => reply()));
    const { t, owner } = await business();
    const r = await extract(owner, t, photo(owner, t));
    expect(r.extraction.status).toBe("error");
    expect(r.extraction.error).toMatch(message);
    expect(r.lines).toEqual([]);
  });

  it("a recording without transcript is not sent as if it were readable", async () => {
    local();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { t, owner } = await business();
    const r = await extract(owner, t, async (receiptId) => await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "voice", storageId: await store(t, 32, "audio/webm") }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.extraction).toMatchObject({ status: "error", error: expect.stringContaining("Nothing readable yet") });
  });

  it("a cloud deployment never calls the local agent, even with the local variables copied", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://descriptive-lemur-152.convex.cloud");
    vi.stubEnv("WAREORB_LOCAL_AGENT_URL", AGENT);
    vi.stubEnv("WAREORB_LOCAL_AGENT_SECRET", "cd".repeat(32));
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { t, owner } = await business();
    const r = await extract(owner, t, photo(owner, t));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.extraction.error).toMatch(/AI reading isn't set up for this warehouse/);
  });
});
