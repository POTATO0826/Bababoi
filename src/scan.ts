// Scan a delivery note (photo / PDF) into a receipt: upload → evidence → AI reading → open /receive.
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { openCommand } from "@/commands";
import { convex, errorText } from "@/convex";
import { actorNow, setWare } from "@/store";

/** Downscale photos before upload (long edge ≤ 1568 px). */
export async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1568 / Math.max(img.width, img.height));
  if (k === 1) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((r) => c.toBlob((b) => r(b ?? file), "image/jpeg", 0.85));
}

export async function uploadTo(url: string, blob: Blob) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

/** Store a scan as evidence on a receipt (a new one unless `receiptId` is given). */
export async function scanToReceipt(file: File, receiptId?: Id<"receipts">): Promise<{ ok: true; receiptId: Id<"receipts"> } | { ok: false; error: string }> {
  try {
    const actor = actorNow();
    const id = receiptId ?? (await convex.mutation(api.receiving.create, { actor }));
    const url = await convex.mutation(api.receiving.generateUploadUrl, { actor });
    const storageId = await uploadTo(url, await shrink(file));
    const kind = file.type === "application/pdf" ? "document" : "photo";
    await convex.mutation(api.receiving.addEvidence, { actor, receiptId: id, kind, storageId, mime: file.type === "application/pdf" ? file.type : "image/jpeg" });
    await convex.mutation(api.receiving.requestExtraction, { actor, receiptId: id });
    openCommand("receive");
    setWare({ detail: { kind: "receipt", id }, floor: 1, zone: null, selected: null });
    return { ok: true, receiptId: id };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}
