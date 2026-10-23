import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { selectSku, switchFloor, toggleCategory } from "@/actions";
import { CardHeading, CategoryIcon, StatTiles, Swatch, TotalsStrip } from "@/components/common";
import { JarvisDock } from "@/components/jarvis/jarvis-dock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  available,
  floorsOf,
  isLow,
  locationText,
  matchesQuery,
  skuTitle,
  totalsOf,
  zoneCategories,
  type CategoryView,
  type Inventory,
  type ProductView,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { signIn, useInventory, useServerData } from "@/server-data";
import type { FloorId } from "@/shared/contracts";
import { localTime } from "@/shared/time";
import { setWare, useWare } from "@/store";

export function InventoryColumn({ wide, className }: { wide: boolean; className?: string }) {
  const query = useWare((s) => s.query);
  const q = query.trim().toLowerCase();
  const inventory = useInventory();

  return (
    <aside className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-col gap-2.5 px-0.5 pt-0.5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[17px] font-semibold tracking-[-.01em]">Inventory</h1>
          <span className="font-mono text-xs text-muted-foreground">{inventory ? `${inventory.totals.onHand} units` : "—"}</span>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-[11px] left-[11px] size-[15px] text-faint" />
          <Input
            value={query}
            onChange={(e) => setWare({ query: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && setWare({ query: "" })}
            placeholder="Search model, SKU or variant"
            aria-label="Search inventory"
            className="h-[38px] rounded-lg bg-panel px-[34px] text-[13.5px] shadow-none md:text-[13.5px] dark:bg-panel"
          />
          {q && (
            <Button
              variant="quiet"
              size="icon-xs"
              onClick={() => setWare({ query: "" })}
              aria-label="Clear search"
              className="absolute top-[7px] right-[7px]"
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      <div data-inventory-scroll className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <LedgerNotice />
        {!inventory ? null : q ? (
          <Results inventory={inventory} q={q} />
        ) : (
          <>
            <TotalsCard inventory={inventory} />
            <CategoryList inventory={inventory} wide={wide} />
          </>
        )}
      </div>

      <JarvisDock />
    </aside>
  );
}

/** Loading, unavailable or stale ledger state. Never falls back to seed quantities. */
function LedgerNotice() {
  const status = useServerData((st) => st.status);
  const stale = useServerData((st) => st.stale);
  const error = useServerData((st) => st.error);
  const auth = useServerData((st) => st.auth);
  const syncedAt = useServerData((st) => st.syncedAt);
  const tz = useServerData((st) => st.inventory?.warehouse.timezone ?? "UTC");
  const personas = useServerData((st) => st.personas);
  if (status === "ready" && !stale) return null;
  const text =
    status === "loading"
      ? auth === "anonymous"
        ? "Choose a demo persona (top right) to load the stock ledger."
        : auth === "disabled"
          ? "Sign-in is not configured on this server (start it with DEMO_AUTH=1 for the labelled demo)."
          : "Loading stock from the ledger…"
      : status === "error"
        ? `Stock ledger unavailable: ${error ?? "unknown error"}. No quantities are shown rather than unverified ones.`
        : `Showing the last synced snapshot (${syncedAt ? localTime(syncedAt, tz) : "—"}). ${error ?? ""} Stock confirmations are disabled until the ledger is reachable.`;
  return (
    <div
      role="status"
      className={cn(
        "flex-none rounded-xl border px-3.5 py-3 text-[12.5px] leading-snug",
        status === "loading" ? "border-border bg-card text-muted-foreground" : "border-warn/40 bg-warn/6 text-warn",
      )}
    >
      {text}
      {auth === "anonymous" && personas.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <span className="text-[10.5px] tracking-[.05em] text-faint uppercase">Synthetic demo personas</span>
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => void signIn(p.id)}
              className="flex items-center gap-2 rounded-md border border-border bg-inset px-2 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-hover-row"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">{p.initials}</span>
              {p.name}
              <span className="ml-auto text-[11px] text-faint capitalize">{p.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const floorCats = (inv: Inventory, f: FloorId) =>
  [...new Set(inv.byFloor[f].filter((l) => l.sku).map((l) => inv.bySku.get(l.sku!)?.categoryName))].filter(Boolean).join(", ");

function TotalsCard({ inventory: inv }: { inventory: Inventory }) {
  const floor = useWare((s) => s.floor);
  const all = inv.totals;
  return (
    <section className="flex flex-none flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <CardHeading>Total inventory</CardHeading>
        <span className="font-mono text-[11px] text-muted-foreground">{all.skus} SKUs</span>
      </div>
      <StatTiles totals={all} />
      <div className="grid grid-cols-2 gap-1.5">
        {([1, 2] as const).map((f) => (
          <button
            key={f}
            onClick={() => switchFloor(f)}
            aria-pressed={floor === f}
            className={cn(
              "flex min-w-0 flex-col gap-0.5 rounded-md border px-2.5 py-[9px] text-left transition-all hover:border-border-strong",
              floor === f ? "border-border-strong bg-raised-3" : "border-border bg-inset",
            )}
          >
            <span className="text-[11px] text-muted-foreground">Floor {f}</span>
            <span className="font-mono text-[13px] font-semibold">{inv.floorTotals[f].units} units</span>
            <span className="text-[11px] text-faint">{floorCats(inv, f)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CategoryList({ inventory, wide }: { inventory: Inventory; wide: boolean }) {
  return (
    <section className="flex-none overflow-hidden rounded-xl border border-border bg-card">
      {inventory.categories.map((c, i) => (
        <CategoryRow key={c.id} inventory={inventory} category={c} first={i === 0} wide={wide} />
      ))}
    </section>
  );
}

function CategoryRow({ inventory: inv, category: c, first, wide }: { inventory: Inventory; category: CategoryView; first: boolean; wide: boolean }) {
  const open = useWare((s) => s.openCat === c.id);
  const active = useWare((s) => !!s.zone && zoneCategories(inv, s.floor, s.zone).some((z) => z.id === c.id));
  const threshold = useWare((s) => s.settings.lowStockThreshold);
  const syncedAt = useServerData((s) => s.syncedAt);
  const t = totalsOf(c.skus);
  const lowN = c.skus.filter((s) => isLow(s, threshold)).length;
  const floors = [...new Set(c.skus.flatMap(floorsOf))]
    .sort()
    .map((f) => `F${f}`)
    .join(" · ");
  const at = syncedAt ? localTime(syncedAt, inv.warehouse.timezone) : "—";

  const status = lowN
    ? wide
      ? `${lowN} ${lowN === 1 ? "SKU" : "SKUs"} below threshold`
      : `${lowN} low stock`
    : wide
      ? `None below threshold · ledger ${at}`
      : `OK · ${at}`;

  return (
    <div className={cn("transition-colors duration-200", !first && "border-t border-border", active && "bg-hover-row")}>
      <div className="flex items-start gap-3 p-3.5">
        <span className="inline-flex size-[42px] flex-none items-center justify-center rounded-[9px] border border-[#2a2a30] bg-raised-2 text-text-2">
          <CategoryIcon id={c.id} />
        </span>
        <button onClick={() => toggleCategory(c.id)} aria-expanded={open} className="flex min-w-0 flex-1 flex-col gap-[3px] text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] leading-[1.2] font-semibold tracking-[-.01em]">{c.name}</span>
            {active ? (
              <Badge variant="neutral" className="h-5 px-2 text-[11.5px]">
                Viewing
              </Badge>
            ) : lowN > 0 ? (
              <Badge variant="warn" className="h-5 px-2 text-[11.5px]">
                Low stock
              </Badge>
            ) : null}
          </span>
          <span className="max-w-full truncate text-[13px] text-muted-foreground">
            {c.skus.length} SKUs · {c.models.length} models · {floors}
          </span>
          <span className={cn("mt-0.5 flex max-w-full items-center gap-[7px] text-[12.5px]", lowN ? "text-warn" : "text-ok-light")}>
            <span className={cn("size-[7px] flex-none rounded-full", lowN ? "bg-warn" : "bg-ok")} />
            <span className="truncate">{status}</span>
          </span>
        </button>
        <button
          onClick={() => toggleCategory(c.id)}
          tabIndex={-1}
          className={cn(
            "flex-none py-0.5 text-[13.5px] transition-colors",
            wide ? "text-muted-foreground hover:text-foreground" : "font-mono text-text-2",
          )}
        >
          {wide ? (open ? "Hide" : "Open") : t.onHand}
        </button>
      </div>
      <TotalsStrip totals={t} columns={wide ? 4 : 2} className="mx-3.5 mb-3" />
      {open && (
        <div className="animate-fade-up border-t border-border bg-panel pb-1.5">
          {c.models.map((m) => (
            <div key={m.name}>
              <div className="px-3.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-[.06em] text-faint uppercase">{m.name}</div>
              {m.skus.map((s) => (
                <SkuRow key={s.sku} sku={s} title={s.variant} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Results({ inventory, q }: { inventory: Inventory; q: string }) {
  const results = inventory.products.filter((s) => matchesQuery(s, q));
  return (
    <section className="flex-none overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3.5 pt-3 pb-2.5">
        <CardHeading>Results</CardHeading>
        <span className="font-mono text-[11px] text-muted-foreground">
          {results.length} {results.length === 1 ? "match" : "matches"}
        </span>
      </div>
      {results.map((s) => (
        <SkuRow key={s.sku} sku={s} title={skuTitle(s)} />
      ))}
      {!results.length && <div className="px-3.5 py-[18px] text-[13px] text-faint">No stock matches “{q}”.</div>}
    </section>
  );
}

function SkuRow({ sku: s, title }: { sku: ProductView; title: string }) {
  const selected = useWare((st) => st.selected === s.sku);
  const low = useWare((st) => isLow(s, st.settings.lowStockThreshold));
  const ref = useRef<HTMLButtonElement>(null);

  // When the selection comes from the map or Jarvis, bring the row into view (inventory panel only, never the page).
  useEffect(() => {
    const row = ref.current;
    const scroller = row?.closest<HTMLElement>("[data-inventory-scroll]");
    if (!selected || !row || !scroller) return;
    const r = row.getBoundingClientRect();
    const c = scroller.getBoundingClientRect();
    if (r.top < c.top || r.bottom > c.bottom) {
      scroller.scrollTo({ top: scroller.scrollTop + r.top - c.top - (c.height - r.height) / 2, behavior: "smooth" });
    }
  }, [selected]);

  return (
    <button
      ref={ref}
      onClick={() => selectSku(s.sku)}
      aria-current={selected || undefined}
      className={cn(
        "flex w-full items-center gap-2.5 border-t border-border-inner px-3.5 py-[9px] text-left transition-colors hover:bg-hover-row",
        selected && "bg-brand/12 shadow-[inset_2px_0_0_var(--brand)] hover:bg-brand/12",
      )}
    >
      <Swatch color={s.color} size={28} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex items-center gap-[7px]">
          <span className="text-[13.5px] font-medium">{title}</span>
          {low && (
            <Badge variant="warn" className="h-[18px] px-[7px] text-[11px]">
              Low
            </Badge>
          )}
        </span>
        <span className="truncate font-mono text-[11.5px] text-faint">{s.sku}</span>
        <span className="truncate font-mono text-[11px] text-faint">{locationText(s)}</span>
        <span className="mt-[3px] flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
          <span className="whitespace-nowrap">
            <span className="text-foreground">{s.onHand}</span> on hand
          </span>
          <span className={cn("whitespace-nowrap", low ? "text-warn" : "text-brand-light")}>{available(s)} available</span>
          <span className="whitespace-nowrap">
            {s.reserved} reserved · {s.incoming} incoming
          </span>
        </span>
      </span>
    </button>
  );
}
