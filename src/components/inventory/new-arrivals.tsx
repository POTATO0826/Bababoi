import { PackagePlusIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { requestIcon, selectSku } from "@/actions";
import { CardHeading } from "@/components/common";
import { SkuIconTile } from "@/components/sku-thumb";
import { Button } from "@/components/ui/button";
import { available, isLow, seedRows, skuTitle, type Sku } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { resetLedger, setWare, useInventory, useWare } from "@/store";

const SEED_COUNT = seedRows().length;
const timeLabel = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** New furniture models received into free bays. A model leaves this list (and the map) when it runs out. */
export function NewArrivals() {
  const inv = useInventory();
  const touched = useWare((s) => s.skus.length !== SEED_COUNT || s.skus.some((r) => r.addedAt || r.movements?.length));

  return (
    <section className="flex flex-none flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
        <span className="flex items-center gap-2">
          <CardHeading>New arrivals</CardHeading>
          {inv.newArrivals.length > 0 && <span className="font-mono text-[11px] text-muted-foreground">{inv.newArrivals.length}</span>}
        </span>
        <span className="font-mono text-[11px] text-faint">{inv.freeBays} free bays</span>
      </div>

      {inv.newArrivals.length === 0 ? (
        <p className="border-t border-border-inner px-3.5 py-3 text-[12.5px] text-faint">
          When a new model comes in, add it here. It’s placed in free bays, shown on the map, and given an AI icon.
        </p>
      ) : (
        inv.newArrivals.map((s) => <ArrivalRow key={s.sku} sku={s} />)
      )}

      <div className="flex items-center gap-2 border-t border-border-inner p-2.5">
        <Button
          variant="outline"
          onClick={() => setWare({ receiveOpen: true })}
          disabled={inv.freeBays === 0}
          className="h-8 flex-1 bg-transparent text-[12.5px] shadow-none dark:bg-transparent"
        >
          <PackagePlusIcon data-icon="inline-start" />
          Receive new model
        </Button>
        {touched && (
          <Button variant="quiet" size="sm" onClick={resetLedger} className="h-8 text-[12px]" title="Restore the original demo stock">
            Reset demo
          </Button>
        )}
      </div>
    </section>
  );
}

function ArrivalRow({ sku: s }: { sku: Sku }) {
  const selected = useWare((st) => st.selected === s.sku);
  const low = useWare((st) => isLow(s, st.settings.lowStockThreshold));
  const { locationText } = useInventory();

  return (
    <div
      className={cn(
        "flex animate-fade-up flex-col border-t border-border-inner px-3.5 py-2.5 transition-colors hover:bg-hover-row",
        selected && "bg-brand/12 shadow-[inset_2px_0_0_var(--brand)] hover:bg-brand/12",
      )}
    >
      <div className="flex items-start gap-3">
        <button onClick={() => selectSku(s)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <SkuIconTile sku={s} />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[13.5px] font-medium">{skuTitle(s)}</span>
            <span className="truncate font-mono text-[11.5px] text-faint">
              {s.sku} · {s.category.name}
            </span>
            <span className="truncate font-mono text-[11px] text-faint">{locationText(s)}</span>
            <span className="mt-[3px] flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
              <span>
                <span className="text-foreground">{s.onHand}</span> on hand
              </span>
              <span className={low ? "text-warn" : "text-brand-light"}>{available(s)} available</span>
              <span>{s.incoming} incoming</span>
            </span>
          </span>
        </button>
        <span className="flex-none pt-0.5 font-mono text-[10.5px] text-faint">{timeLabel(s.addedAt!)}</span>
      </div>
      {/* Outside the row button: it holds its own Retry button. */}
      <div className="pl-[54px]">
        <IconStatus sku={s} />
      </div>
    </div>
  );
}

function IconStatus({ sku: s }: { sku: Sku }) {
  if (s.iconStatus === "ready") return null;
  if (s.iconStatus === "pending") {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-brand-light">
        <SparklesIcon className="size-3 animate-pulse" />
        Generating icon…
      </span>
    );
  }
  return (
    <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-faint">
      {s.iconStatus === "unavailable" ? "AI icon off — set ANTHROPIC_API_KEY" : "Icon failed"}
      <button
        onClick={() => void requestIcon(s.sku)}
        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Retry icon"
      >
        <RefreshCwIcon className="size-3" />
        Retry
      </button>
    </span>
  );
}
