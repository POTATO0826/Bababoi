// Browser test harness (not shipped): the real Jarvis chat and receipt measurement components, served by
// tests/browser/run.ts next to the real local demo routes. The full app needs the local Convex sync backend.
import "../../src/index.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Doc } from "@convex/_generated/dataModel";
import { applyMeasure, MeasureEditor, ReceiptTotalsView, type RawMeasures } from "@/components/detail/measures";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { setIdentity, setWare } from "@/store";

type Line = Doc<"receipts">["lines"][number];
const base = (key: string, rawText: string, more: Partial<Line> = {}): Line => ({ key, rawText, skuCode: null, candidates: [], qty: 2, condition: "", confidence: 1, questions: [], verified: false, source: "staff", ...more });

function Measures() {
  const [lines, setLines] = useState<Line[]>([base("chair", "Dining chair oak x2"), base("sofa", "Sofa x1", { qty: 1, statedTotalWeightKg: 40 })]);
  const [raw, setRaw] = useState<RawMeasures>({});
  return (
    <section aria-label="Measurements harness" className="flex w-[360px] flex-col gap-2 rounded-lg border border-border bg-panel p-3">
      {lines.map((l, i) => (
        <MeasureEditor key={l.key} line={l} raw={raw} disabled={false} onChange={(field, text) => {
          setRaw((m) => ({ ...m, [l.key]: { ...m[l.key], [field]: text } }));
          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...applyMeasure(x, field, text) } : x)));
        }} />
      ))}
      <ReceiptTotalsView lines={lines} raw={raw} />
    </section>
  );
}

setIdentity({ _id: "presenter", name: "Demo presenter", email: "presenter@wareorb.local", role: "owner", active: true });
setWare({ agentOpen: true });
createRoot(document.getElementById("root")!).render(
  <main className="flex min-h-screen gap-4 bg-background p-4 text-foreground">
    <div className="flex h-[640px] w-[380px]"><JarvisChat drawer={false} className="flex-1" /></div>
    <Measures />
  </main>,
);
