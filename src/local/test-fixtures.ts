// Synthetic fixtures for local-runtime tests (never business data).
import { fauxProvider } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSeed } from "../domain/seed";
import type { Snapshot } from "./warehouse-tools";

/** A ledger snapshot shaped like `ledger.snapshot`, built from the synthetic demo seed. */
export function syntheticSnapshot(now: number): Snapshot {
  const s = buildSeed(now);
  const batches = s.batches.map((b, i) => ({ ...b, _id: `batch${i}`, _creationTime: now, status: "active" as const, synthetic: true }));
  return {
    settings: { _id: "settings", _creationTime: now, key: "main", ...s.settings, seededAt: now },
    skus: s.skus.map((k, i) => ({ ...k, _id: `sku${i}`, _creationTime: now })),
    batches,
    reservations: s.reservations.map((r, i) => ({ _id: `res${i}`, _creationTime: now, skuCode: r.skuCode, batchId: batches.find((b) => b.code === r.batchCode)!._id, qty: r.qty, pick: [], status: "active", label: r.label, createdAt: now })),
    purchaseOrders: s.purchaseOrders.map((p, i) => ({ ...p, _id: `po${i}`, _creationTime: now, qtyReceived: 0, status: "open", createdBy: { role: "owner", name: "Seed" } })),
    movements: s.movements.map((m, i) => ({ ...m, _id: `mv${i}`, _creationTime: now, synthetic: true })),
    receipts: [],
    deals: [],
  } as unknown as Snapshot;
}

/**
 * MOCKED PROVIDER for tests: Pi's built-in scripted "faux" provider. Its replies are scripted by the
 * test; nothing is sent to a real model and passing tests are not evidence of a live AI connection.
 */
export async function mockedPi(opts: { input?: ("text" | "image")[] } = {}) {
  const faux = fauxProvider({ provider: "mocked-provider", models: [{ id: "mocked-model", name: "Mocked model (tests only)", input: opts.input ?? ["text", "image"] }] });
  const runtime = await ModelRuntime.create({ authPath: join(mkdtempSync(join(tmpdir(), "wareorb-mock-pi-")), "auth.json"), modelsPath: null, refreshOnCreate: false });
  runtime.registerNativeProvider(faux.provider);
  const model = faux.getModel();
  return { faux, runtime, resolved: { runtime, model } as never };
}
