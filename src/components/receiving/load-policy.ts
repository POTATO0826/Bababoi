/** Decide whether a receipt read may replace the visible form. */
export function receiptLoadDecision({
  currentVersion,
  incomingVersion,
  dirty,
  force,
  requestGeneration,
  currentGeneration,
}: {
  currentVersion: number | null;
  incomingVersion: number;
  dirty: boolean;
  force: boolean;
  requestGeneration: number;
  currentGeneration: number;
}): "discard" | "preserve" | "conflict" | "apply" {
  if (requestGeneration !== currentGeneration) return "discard";
  if (!force && dirty) return currentVersion !== null && incomingVersion !== currentVersion ? "conflict" : "preserve";
  return "apply";
}
