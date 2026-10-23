import { ScanLineIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { clearSelection, openReceiving, selectSku } from "@/actions";
import { CardHeading, Kicker, StatTiles, Swatch } from "@/components/common";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { available, isLow, productsOnFloor, skuTitle, zonesText, type Inventory, type ProductView } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { useInventory, useServerData } from "@/server-data";
import type { MovementPage, MovementRow } from "@/shared/contracts";
import { localTime } from "@/shared/time";
import { setWare, useWare } from "@/store";

/** Details popup inside the viewport: floor summary, or the selected model. */
export function DetailsPanel({ veryTight }: { veryTight: boolean }) {
  const inv = useInventory();
  const selectedSku = useWare((s) => s.selected);
  const selected = selectedSku ? inv?.bySku.get(selectedSku) : undefined;
  if (!inv) return null;
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
      {selected ? <SelectedModel inv={inv} sku={selected} /> : <FloorSummary inv={inv} />}
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

function FloorSummary({ inv }: { inv: Inventory }) {
  const floor = useWare((s) => s.floor);
  const threshold = useWare((s) => s.settings.lowStockThreshold);
  // Floor counts sum this floor's balances and reservations; incoming is warehouse-wide.
  const t = inv.floorTotals[floor];
  const lows = productsOnFloor(inv, floor).filter((s) => isLow(s, threshold));

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
            onClick={() => selectSku(s.sku)}
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
        {inv.pending.map((r) => (
          <button
            key={r.id}
            onClick={() => openReceiving(r.id)}
            className="mb-1.5 flex w-full items-center gap-2.5 rounded-md border border-warn/30 bg-warn/6 px-2.5 py-[9px] text-left transition-colors hover:bg-warn/10"
          >
            <ScanLineIcon className="size-4 flex-none text-warn" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs">{r.documentRef ? `Delivery note ${r.documentRef}` : "Manual receipt"}</span>
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                {r.lines.map((l) => `${l.quantity ?? "?"} × ${l.sku ?? "unresolved"}`).join(" · ")} · not yet on hand
              </span>
            </span>
            <span className="text-[11px] font-semibold text-warn">Review</span>
          </button>
        ))}
        {!inv.pending.length && <div className="border-t border-border py-2 text-xs text-faint">No receiving drafts are pending.</div>}
      </div>
    </PanelShell>
  );
}

function SelectedModel({ inv, sku: s }: { inv: Inventory; sku: ProductView }) {
  const low = useWare((st) => isLow(s, st.settings.lowStockThreshold));
  const [expanded, setExpanded] = useState(false);
  return (
    <PanelShell title="Selected model" onClose={clearSelection}>
      <div className="flex items-center gap-2.5">
        <Swatch color={s.color} size={34} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] font-medium text-faint">
            {s.categoryName} · {s.modelName}
          </span>
          <span className="text-base leading-[1.2] font-semibold tracking-[-.01em]">{skuTitle(s)}</span>
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="inline-flex h-[22px] items-center rounded-sm border border-border-strong px-2 font-mono text-[11px]">{s.sku}</span>
        <span className="inline-flex h-[22px] items-center rounded-sm bg-secondary px-2 text-[11px] font-medium">{zonesText(s)}</span>
        {low && <span className="inline-flex h-[22px] items-center rounded-sm bg-warn/15 px-2 text-[11px] font-semibold text-warn">Low stock</span>}
      </div>
      <div className="mt-3.5">
        <StatTiles totals={{ ...s, available: available(s) }} size="md" />
      </div>
      <div className="mt-4">
        <Kicker className="mb-2 block">Locations</Kicker>
        <div className="flex flex-wrap gap-1.5">
          {s.locations.map((c) => (
            <button
              key={c.id}
              onClick={() => selectSku(s.sku, { floor: c.floor, zone: c.zone, bayId: c.id })}
              className="inline-flex h-6 items-center rounded-sm border border-brand/35 bg-brand/8 px-2 font-mono text-[11px] hover:bg-brand/15"
            >
              <span className="mr-1 text-faint">F{c.floor}</span>
              {c.code}
              <span className="ml-1.5 text-faint">×{c.quantity}</span>
            </button>
          ))}
          {!s.locations.length && <span className="text-xs text-faint">No units in any bay.</span>}
        </div>
      </div>
      <div className="mt-4">
        <Kicker className="mb-1 block">History</Kicker>
        <History inv={inv} sku={s.sku} maxEntries={expanded ? Infinity : 4} detailed={expanded} />
      </div>
      <Button
        variant="outline"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="mt-3.5 h-[34px] w-full bg-transparent text-[12.5px] shadow-none dark:bg-transparent"
      >
        {expanded ? "Show recent only" : "View stock movements"}
      </Button>
    </PanelShell>
  );
}

interface Entry {
  key: string;
  when: string;
  text: string;
  delta: number;
  detail: string;
  synthetic: boolean;
}

/** Groups ledger rows by source document so one receipt into two bays reads as one entry. */
function group(rows: MovementRow[], inv: Inventory): Entry[] {
  const out: (Entry & { rows: MovementRow[] })[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.rows[0]!.sourceId === r.sourceId && last.rows[0]!.kind === r.kind) {
      last.rows.push(r);
      continue;
    }
    out.push({ key: r.id, when: "", text: "", delta: 0, detail: "", synthetic: r.synthetic, rows: [r] });
  }
  const tz = inv.warehouse.timezone;
  return out.map((e) => {
    const first = e.rows[0]!;
    const when =
      first.localDate === inv.warehouse.today
        ? localTime(first.recordedAt, tz)
        : new Date(`${first.localDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const text =
      first.kind === "receipt"
        ? `Received · ${first.sourceRef ?? "manual receipt"} · ${first.actorName}`
        : first.kind === "demo_opening"
          ? "Opening balance (synthetic demo)"
          : `Dispatched · ${first.sourceRef ?? first.sourceId}`;
    const detail = e.rows
      .slice()
      .reverse()
      .map((r) => `F${r.floor} ${r.code} ${r.quantity > 0 ? "+" : "−"}${Math.abs(r.quantity)}`)
      .join(", ");
    return { key: e.key, when, text, delta: e.rows.reduce((a, r) => a + r.quantity, 0), detail, synthetic: e.synthetic };
  });
}

function History({ inv, sku, maxEntries, detailed }: { inv: Inventory; sku: string; maxEntries: number; detailed: boolean }) {
  const epoch = useServerData((s) => s.historyEpoch);
  const [page, setPage] = useState<MovementPage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setErr(null);
    api<MovementPage>("GET", `/products/${encodeURIComponent(sku)}/movements?limit=100`)
      .then((r) => live && setPage(r.data))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "History unavailable."));
    return () => {
      live = false;
    };
  }, [sku, epoch]);

  if (err) return <div className="border-t border-border py-2 text-xs text-warn">{err}</div>;
  if (!page) return <div className="border-t border-border py-2 text-xs text-faint">Loading movements…</div>;
  let entries = group(page.rows, inv);
  // A truncated page may cut the oldest document's rows; never show a partial total for it.
  if (page.nextCursor) entries = entries.slice(0, -1);
  entries = entries.slice(0, maxEntries);
  if (!entries.length) return <div className="border-t border-border py-2 text-xs text-faint">No movements recorded.</div>;
  return (
    <>
      {entries.map((h) => (
        <div key={h.key} className="border-t border-border py-[7px] text-xs">
          <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2.5">
            <span className="font-mono text-[11px] text-faint">{h.when}</span>
            <span className={cn("truncate", h.synthetic ? "text-muted-foreground" : "text-text-2")}>{h.text}</span>
            <span className={cn("font-mono text-[11.5px]", h.delta > 0 ? "text-ok-light" : h.delta < 0 ? "text-warn" : "text-faint")}>
              {h.delta > 0 ? `+${h.delta}` : h.delta < 0 ? `−${-h.delta}` : "0"}
            </span>
          </div>
          {detailed && <div className="mt-0.5 pl-[62px] font-mono text-[10.5px] text-faint">{h.detail}</div>}
        </div>
      ))}
      {detailed && page.nextCursor && <div className="border-t border-border py-2 text-[11px] text-faint">Older movements not shown.</div>}
    </>
  );
}
