import { MinusIcon, PlusIcon, ScanLineIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { clearSelection, recordMovement, selectSku } from "@/actions";
import { CardHeading, Kicker, StatTiles, Swatch } from "@/components/common";
import { SkuThumb } from "@/components/sku-thumb";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PENDING_NOTE, available, historyFor, isLow, skuTitle, totals, type Sku } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { setWare, useInventory, useWare } from "@/store";

/** Details popup inside the viewport: floor summary, or the selected model. */
export function DetailsPanel({ veryTight }: { veryTight: boolean }) {
  const code = useWare((s) => s.selected);
  const selected = useInventory().byCode.get(code ?? "");
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute right-3 z-[5] flex w-[min(320px,calc(100%-24px))] animate-fade-up cursor-default flex-col overflow-auto rounded-lg shadow-[0_16px_40px_rgba(0,0,0,.55)]",
        veryTight ? "top-[92px] max-h-[calc(100%-196px)]" : "top-[52px] max-h-[calc(100%-156px)]",
      )}
    >
      {selected ? <SelectedModel sku={selected} /> : <FloorSummary />}
    </div>
  );
}

function PanelShell({ title, aside, onClose, children }: { title: string; aside?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-3.5 pt-[11px] pb-[9px]">
        <CardHeading>{title}</CardHeading>
        <span className="flex items-center gap-2">
          {aside}
          <Button variant="quiet" size="icon-xs" onClick={onClose} aria-label="Close">
            <XIcon />
          </Button>
        </span>
      </div>
      <div className="min-h-0 overflow-auto p-3.5">{children}</div>
    </section>
  );
}

function FloorSummary() {
  const floor = useWare((s) => s.floor);
  const threshold = useWare((s) => s.settings.lowStockThreshold);
  const inv = useInventory();
  const list = inv.skusOnFloor(floor);
  const t = totals(list);
  const lows = list.filter((s) => isLow(s, threshold));
  const pending = inv.byCode.get(PENDING_NOTE.sku);

  return (
    <PanelShell
      title={`Floor ${floor} summary`}
      aside={<span className="font-mono text-[11px] text-muted-foreground">{t.skus} SKUs</span>}
      onClose={() => setWare({ panelOpen: false })}
    >
      <StatTiles totals={t} />
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <Kicker>Low stock</Kicker>
          <span className="font-mono text-[11px] text-warn">{lows.length}</span>
        </div>
        {lows.map((s) => (
          <button
            key={s.sku}
            onClick={() => selectSku(s)}
            className="grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-sm border-t border-border px-1.5 py-[7px] text-left text-xs transition-colors hover:bg-raised-3"
          >
            <Swatch color={s.color} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-foreground">{skuTitle(s)}</span>
              <span className="font-mono text-[10.5px] text-faint">{s.sku}</span>
            </span>
            <span className="font-mono text-xs whitespace-nowrap text-warn">{available(s)} left</span>
          </button>
        ))}
        {!lows.length && <div className="border-t border-border py-2 text-xs text-faint">Nothing below the threshold.</div>}
      </div>
      <div className="mt-4">
        <Kicker className="mb-2 block">Awaiting verification</Kicker>
        <button
          onClick={() => pending && selectSku(pending)}
          className="flex w-full items-center gap-2.5 rounded-md border border-warn/30 bg-warn/6 px-2.5 py-[9px] text-left transition-colors hover:bg-warn/10"
        >
          <ScanLineIcon className="size-4 flex-none text-warn" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs">Delivery note {PENDING_NOTE.id}</span>
            <span className="truncate font-mono text-[10.5px] text-muted-foreground">
              {PENDING_NOTE.qty} × {PENDING_NOTE.sku} · not yet on hand
            </span>
          </span>
          <span className="text-[11px] font-semibold text-warn">Pending</span>
        </button>
      </div>
    </PanelShell>
  );
}

function SelectedModel({ sku: s }: { sku: Sku }) {
  const low = useWare((st) => isLow(s, st.settings.lowStockThreshold));
  const { codesFor } = useInventory();
  return (
    <PanelShell title="Selected model" onClose={clearSelection}>
      <div className="flex items-center gap-2.5">
        <SkuThumb sku={s} size={34} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] font-medium text-faint">
            {s.category.name} · {s.model.name}
          </span>
          <span className="text-base leading-[1.2] font-semibold tracking-[-.01em]">{skuTitle(s)}</span>
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="inline-flex h-[22px] items-center rounded-sm border border-border-strong px-2 font-mono text-[11px]">{s.sku}</span>
        <span className="inline-flex h-[22px] items-center rounded-sm bg-secondary px-2 text-[11px] font-medium">
          Floor {s.floor} · Zone {s.zone}
        </span>
        {low && <span className="inline-flex h-[22px] items-center rounded-sm bg-warn/15 px-2 text-[11px] font-semibold text-warn">Low stock</span>}
      </div>
      <div className="mt-3.5">
        <StatTiles totals={{ ...s, available: available(s) }} size="md" />
      </div>
      <div className="mt-4">
        <Kicker className="mb-2 block">Locations</Kicker>
        <div className="flex flex-wrap gap-1.5">
          {codesFor(s).map((c) => (
            <span key={c.code} className="inline-flex h-6 items-center rounded-sm border border-brand/35 bg-brand/8 px-2 font-mono text-[11px]">
              {c.code}
              <span className="ml-1.5 text-faint">×{c.qty}</span>
            </span>
          ))}
        </div>
      </div>
      <StockMovement key={s.sku} sku={s} />
      <div className="mt-4">
        <Kicker className="mb-1 block">History</Kicker>
        {historyFor(s).map((h) => (
          <div key={h.t + h.text} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border py-[7px] text-xs">
            <span className="font-mono text-[11px] text-faint">{h.t}</span>
            <span className="truncate text-text-2">{h.text}</span>
            <span className={cn("font-mono text-[11.5px]", h.d.startsWith("+") ? "text-ok-light" : h.d.startsWith("−") ? "text-warn" : "text-faint")}>
              {h.d}
            </span>
          </div>
        ))}
      </div>
      <Button variant="outline" className="mt-3.5 h-[34px] w-full bg-transparent text-[12.5px] shadow-none dark:bg-transparent">
        View stock movements
      </Button>
    </PanelShell>
  );
}

/** Record stock leaving (dispatch) or arriving (receive). A person confirms; reaching 0 removes the model. */
function StockMovement({ sku: s }: { sku: Sku }) {
  const [type, setType] = useState<"dispatch" | "receive">("dispatch");
  const [qty, setQty] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = type === "dispatch" ? s.onHand : 99;
  const n = Math.min(Math.max(1, qty), Math.max(1, max));
  const emptiesStock = type === "dispatch" && n >= s.onHand;

  const confirm = () => {
    const res = recordMovement(s.sku, type, n);
    if (res.ok) {
      setConfirming(false);
      setQty(1);
      setError(null);
    } else setError(res.error);
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <Kicker>Record movement</Kicker>
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => {
            if (!v) return;
            setType(v as "dispatch" | "receive");
            setConfirming(false);
            setError(null);
          }}
          spacing={0.5}
          className="rounded-[7px] border border-border bg-inset p-[3px]"
          aria-label="Movement type"
        >
          <ToggleGroupItem value="dispatch" variant="segment" size="segment">
            Dispatch
          </ToggleGroupItem>
          <ToggleGroupItem value="receive" variant="segment" size="segment">
            Receive
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 items-center rounded-md border border-border bg-inset-2">
          <Button variant="quiet" size="icon-sm" className="size-8" aria-label="Fewer" onClick={() => setQty(Math.max(1, n - 1))} disabled={n <= 1}>
            <MinusIcon />
          </Button>
          <span className="w-8 text-center font-mono text-[13px] tabular-nums" aria-live="polite">
            {n}
          </span>
          <Button variant="quiet" size="icon-sm" className="size-8" aria-label="More" onClick={() => setQty(Math.min(max, n + 1))} disabled={n >= max}>
            <PlusIcon />
          </Button>
        </div>
        {confirming ? (
          <Button
            onClick={confirm}
            className={cn("h-8 flex-1 text-[12.5px]", emptiesStock && "bg-warn text-background hover:bg-warn/90")}
          >
            Confirm {type === "dispatch" ? `−${n}` : `+${n}`}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)} className="h-8 flex-1 bg-transparent text-[12.5px] shadow-none dark:bg-transparent">
            {type === "dispatch" ? "Dispatch" : "Receive"} {n} {n === 1 ? "unit" : "units"}
          </Button>
        )}
      </div>
      {confirming && (
        <p className={cn("mt-1.5 text-[11.5px]", emptiesStock ? "text-warn" : "text-faint")}>
          {emptiesStock
            ? "This empties the stock: the model and its icon are removed from the list and the map."
            : type === "dispatch"
              ? `${s.onHand - n} will remain on hand.`
              : `${s.onHand + n} on hand after receiving. Extra bays are taken from free space if needed.`}
        </p>
      )}
      {error && <p className="mt-1.5 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}
