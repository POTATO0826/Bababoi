import { cn } from "@/lib/utils";
import { useWare } from "@/store";
import { BatchDetail } from "./batch-detail";
import { DealDetail } from "./deal-detail";
import { ReceiptDetail } from "./receipt-detail";

export const DETAIL_W = 400;

/** Workflow popup over the map (deal, receipt or batch), in the same spot as the Details popup. */
export function DetailHost({ veryTight }: { veryTight: boolean }) {
  const detail = useWare((s) => s.detail);
  if (!detail) return null;
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute right-3 z-[5] flex w-[min(400px,calc(100%-24px))] animate-fade-up cursor-default flex-col overflow-hidden rounded-lg shadow-[0_16px_40px_rgba(0,0,0,.55)]",
        veryTight ? "top-[92px] max-h-[calc(100%-104px)]" : "top-[52px] max-h-[calc(100%-64px)]",
      )}
    >
      {detail.kind === "deal" && <DealDetail key={detail.id} id={detail.id} />}
      {detail.kind === "receipt" && <ReceiptDetail key={detail.id} id={detail.id} />}
      {detail.kind === "batch" && <BatchDetail key={detail.id} id={detail.id} />}
    </div>
  );
}
