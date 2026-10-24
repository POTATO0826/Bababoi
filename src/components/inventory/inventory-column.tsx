import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { selectSku, switchFloor, toggleCategory } from "@/actions";
import { CardHeading, CategoryIcon, StatTiles, TotalsStrip } from "@/components/common";
import { NewArrivals } from "@/components/inventory/new-arrivals";
import { SkuThumb } from "@/components/sku-thumb";
import { JarvisDock } from "@/components/jarvis/jarvis-dock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { available, isLow, matchesQuery, skuTitle, totals, type Category, type Sku } from "@/data/catalog";
import { deriveInventory } from "@/data/inventory";
import { cn } from "@/lib/utils";
import { setWare, useInventory, useWare } from "@/store";

export function InventoryColumn({ wide, className }: { wide: boolean; className?: string }) {
  const query = useWare((s) => s.query);
  const q = query.trim().toLowerCase();
  const totalUnits = useInventory().skus.reduce((a, s) => a + s.onHand, 0);
  const ledgerReady = useWare((s) => s.ledgerReady);
  const catalogueCount = useWare((s) => s.ledger?.skus.length ?? 0);
  const role = useWare((s) => s.role);

  return (
    <aside className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-col gap-2.5 px-0.5 pt-0.5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[17px] font-semibold tracking-[-.01em]">Inventory</h1>
          <span className="font-mono text-xs text-muted-foreground">{totalUnits} units</span>
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
        {q ? (
          <Results q={q} />
        ) : (
          <>
            <TotalsCard />
            {ledgerReady && totalUnits === 0 && <section className="rounded-xl border border-brand/35 bg-brand/8 p-4">
              <h2 className="text-sm font-semibold">{catalogueCount ? "Ready for your first receipt" : "Start your warehouse catalogue"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{catalogueCount ? "Count the delivery, confirm its SKU and choose the bays before stock appears here." : "Create a real item, then record and post a counted receipt to place stock on the map."}</p>
              {role !== "sales" && <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => setWare({ receiveOpen: true })}>Create item</Button>
                {catalogueCount > 0 && <Button size="sm" variant="outline" onClick={() => setWare({ stage: "receive" })}>Open receiving</Button>}
              </div>}
            </section>}
            <NewArrivals />
            <CategoryList wide={wide} />
          </>
        )}
      </div>

      <JarvisDock />
    </aside>
  );
}

function TotalsCard() {
  const floor = useWare((s) => s.floor);
  const inv = useInventory();
  const all = useMemo(() => totals(inv.skus), [inv]);
  const floorCats = (f: 1 | 2) => [...new Set(inv.skusOnFloor(f).map((s) => s.category.name))].join(", ");
  const floorUnits = (f: 1 | 2) => inv.skusOnFloor(f).reduce((a, s) => a + s.onHand, 0);
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
            <span className="font-mono text-[13px] font-semibold">{floorUnits(f)} units</span>
            <span className="text-[11px] text-faint">{floorCats(f)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CategoryList({ wide }: { wide: boolean }) {
  const { categories } = useInventory();
  return (
    <section className="flex-none overflow-hidden rounded-xl border border-border bg-card">
      {categories.map((c, i) => (
        <CategoryRow key={c.id} category={c} first={i === 0} wide={wide} />
      ))}
    </section>
  );
}

function CategoryRow({ category: c, first, wide }: { category: Category; first: boolean; wide: boolean }) {
  const open = useWare((s) => s.openCat === c.id);
  const active = useWare((s) => !!s.zone && deriveInventory(s.skus).zoneCategory(s.floor, s.zone)?.id === c.id);
  const threshold = useWare((s) => s.settings.lowStockThreshold);
  const t = totals(c.skus);
  const lowN = c.skus.filter((s) => isLow(s, threshold)).length;
  const floors = [...new Set(c.skus.map((s) => s.floor))]
    .sort()
    .map((f) => `F${f}`)
    .join(" · ");

  const status = lowN
    ? wide
      ? `${lowN} ${lowN === 1 ? "SKU" : "SKUs"} below threshold`
      : `${lowN} low stock`
    : "In stock";

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

function Results({ q }: { q: string }) {
  const results = useInventory().skus.filter((s) => matchesQuery(s, q));
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

function SkuRow({ sku: s, title }: { sku: Sku; title: string }) {
  const selected = useWare((st) => st.selected === s.sku);
  const low = useWare((st) => isLow(s, st.settings.lowStockThreshold));
  const { locationText } = useInventory();
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
      onClick={() => selectSku(s)}
      aria-current={selected || undefined}
      className={cn(
        "flex w-full items-center gap-2.5 border-t border-border-inner px-3.5 py-[9px] text-left transition-colors hover:bg-hover-row",
        selected && "bg-brand/12 shadow-[inset_2px_0_0_var(--brand)] hover:bg-brand/12",
      )}
    >
      <SkuThumb sku={s} size={28} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex items-center gap-[7px]">
          <span className="text-[13.5px] font-medium">{title}</span>
          {low && (
            <Badge variant="warn" className="h-[18px] px-[7px] text-[11px]">
              Low
            </Badge>
          )}
          {s.addedAt && (
            <Badge variant="outline" className="h-[18px] border-brand/40 px-[7px] text-[11px] text-brand-light">
              New
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
