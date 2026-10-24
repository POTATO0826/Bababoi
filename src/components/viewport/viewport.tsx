import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, PanelRightIcon, ScanIcon, XIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { backToOverview, escapeZone, resetCamera, setView, switchFloor } from "@/actions";
import { DetailHost } from "@/components/detail/detail-host";
import { DetailsPanel } from "@/components/viewport/details-panel";
import { dragState, wheelZoomsMap } from "@/interaction";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { totals, type FloorId } from "@/data/catalog";
import { useElementSize } from "@/hooks/use-layout";
import { cn } from "@/lib/utils";
import { getWare, setWare, useInventory, useWare, type ViewMode } from "@/store";
import { clearHighlight } from "@/navigate";
import { useBayOverlay } from "@/workflow";

const WarehouseCanvas = lazy(() => import("@/scene/warehouse-canvas"));


export function Viewport({ className }: { className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { width } = useElementSize(ref);
  const tight = width > 0 && width < 760;
  const veryTight = width > 0 && width < 560;
  const zone = useWare((s) => s.zone);
  const panelOpen = useWare((s) => s.panelOpen);
  const detail = useWare((s) => s.detail);
  const fading = useWare((s) => s.fading);
  const dragging = useWare((s) => s.dragging);
  const drag = useRef<{ x: number; theta: number; moved: boolean; id: number } | null>(null);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll. It runs before React's handlers,
  // so popups on the map are excluded here: their own content must scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!wheelZoomsMap(e.target)) return;
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setWare((s) => ({ zoomMul: Math.min(3.5, Math.max(0.6, s.zoomMul * f)), hoverBay: null }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (e.key === "Escape" && getWare().zone && !/INPUT|TEXTAREA/.test(tag)) escapeZone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, theta: getWare().theta, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 3) {
      d.moved = true;
      setWare({ dragging: true, hoverBay: null });
      (e.currentTarget as HTMLElement).setPointerCapture?.(d.id);
    }
    if (d.moved) setWare({ theta: d.theta + dx * 0.008 });
  };
  const endDrag = () => {
    if (drag.current?.moved) {
      dragState.suppressClick = true;
      setTimeout(() => (dragState.suppressClick = false), 0);
      setWare({ dragging: false });
    }
    drag.current = null;
  };

  return (
    <main
      ref={ref}
      aria-label="Warehouse 3D view"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => !drag.current && setWare({ hoverBay: null })}
      onDoubleClick={resetCamera}
      className={cn(
        "wh-viewport relative min-h-0 touch-none overflow-hidden rounded-lg border border-border select-none",
        "bg-[radial-gradient(ellipse_at_50%_58%,#17171c_0%,#0b0b0e_68%)]",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      <div className={cn("absolute inset-0 transition-opacity duration-250", fading ? "opacity-0" : "opacity-100")}>
        <Suspense fallback={<SceneLoading />}>
          <WarehouseCanvas />
        </Suspense>
      </div>

      <Hud tight={tight} veryTight={veryTight} />
      <HighlightChip veryTight={veryTight} />
      {(width === 0 || width >= 520) && <Legend showStats={width >= 700 && !zone} />}

      {panelOpen && !detail && <DetailsPanel veryTight={veryTight} />}
      <DetailHost veryTight={veryTight} />

      {zone && (
        <Button
          variant="pill"
          size="pill"
          onClick={backToOverview}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute bottom-3.5 z-[4] animate-fade-up",
            // Centred when there's room; otherwise bottom-right so it clears the legend.
            width >= 980 ? "left-1/2 -translate-x-1/2" : "right-3",
          )}
        >
          <ScanIcon />
          View whole warehouse
        </Button>
      )}
    </main>
  );
}

/** "Showing Floor 1 · Zone A · 4 free bays" while Jarvis points at bays. */
function HighlightChip({ veryTight }: { veryTight: boolean }) {
  const label = useWare((s) => s.highlight?.label);
  if (!label) return null;
  return (
    <div
      role="status"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute left-3 z-[4] flex h-7 max-w-[calc(100%-24px)] animate-fade-up items-center gap-1.5 rounded-md border border-brand/40 bg-panel pr-1 pl-2.5 text-[12px] whitespace-nowrap text-foreground",
        veryTight ? "top-[92px]" : "top-[52px]",
      )}
    >
      <span className="size-2 flex-none rounded-[2px] bg-brand" />
      <span className="min-w-0 truncate">Showing {label}</span>
      <Button variant="quiet" size="icon-xs" onClick={clearHighlight} aria-label="Clear highlight" className="size-5">
        <XIcon />
      </Button>
    </div>
  );
}

function SceneLoading() {
  return (
    <div className="flex size-full items-center justify-center text-xs text-faint">
      <span className="animate-blink">Loading warehouse…</span>
    </div>
  );
}

function Hud({ tight, veryTight }: { tight: boolean; veryTight: boolean }) {
  const floor = useWare((s) => s.floor);
  const zone = useWare((s) => s.zone);
  const view = useWare((s) => s.view);
  const panelOpen = useWare((s) => s.panelOpen);
  const inv = useInventory();
  const zc = zone ? inv.zoneCategory(floor, zone) : null;
  const stop = (e: ReactPointerEvent) => e.stopPropagation();

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-3 right-3 left-3 flex items-start justify-between gap-2",
        veryTight && "flex-col",
      )}
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5" onPointerDown={stop} onDoubleClick={(e) => e.stopPropagation()}>
        {zone && (
          <Button variant="hud" size="hud" onClick={backToOverview} className="animate-fade-up pl-2 font-medium text-foreground">
            <ArrowLeftIcon />
            Back
          </Button>
        )}
        <nav
          aria-label="Breadcrumb"
          className="inline-flex h-[30px] min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-panel py-0 pr-2.5 pl-1 text-[12.5px] whitespace-nowrap text-muted-foreground"
        >
          {(!tight || !zone) && (
            <>
              <button
                onClick={backToOverview}
                className="inline-flex h-6 flex-none items-center gap-[5px] rounded-sm px-1.5 font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Main Warehouse
                <ChevronDownIcon className="size-3 text-muted-foreground" />
              </button>
              <ChevronRightIcon className="size-3 flex-none text-disabled" />
            </>
          )}
          <span className={zone ? "" : "font-medium text-foreground"}>Floor {floor}</span>
          {zone && (
            <>
              <ChevronRightIcon className="size-3 flex-none text-disabled" />
              <span className="min-w-0 truncate font-medium text-foreground">
                {zc ? `${zc.name} · Zone ${zone}` : `Zone ${zone}`}
              </span>
            </>
          )}
        </nav>
      </div>

      <div className="pointer-events-auto flex flex-none gap-2" onPointerDown={stop} onDoubleClick={(e) => e.stopPropagation()}>
        <Button
          variant="hud"
          size="hud"
          aria-pressed={panelOpen}
          aria-label="Stock details"
          onClick={() => setWare((s) => ({ panelOpen: !s.panelOpen }))}
          className="h-8 rounded-[7px] text-xs font-medium"
        >
          <PanelRightIcon className="size-[15px]" />
          Details
        </Button>
        <Segmented<FloorId>
          label="Floor"
          value={floor}
          onChange={(f) => switchFloor(f)}
          items={[
            [1, "Floor 1"],
            [2, "Floor 2"],
          ]}
        />
        <Segmented<ViewMode>
          label="Camera view"
          value={view}
          onChange={setView}
          items={[
            ["iso", tight ? "Iso" : "Isometric"],
            ["top", tight ? "Top" : "Top-down"],
          ]}
        />
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={String(value)}
      onValueChange={(v) => {
        const hit = items.find(([k]) => String(k) === v);
        if (hit) onChange(hit[0]);
      }}
      spacing={0.5}
      className="rounded-[7px] border border-border bg-panel p-[3px] whitespace-nowrap"
    >
      {items.map(([k, text]) => (
        <ToggleGroupItem key={String(k)} value={String(k)} variant="segment" size="segment">
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Legend({ showStats }: { showStats: boolean }) {
  const floor = useWare((s) => s.floor);
  const inv = useInventory();
  const bays = inv.bays[floor];
  const occupied = bays.filter((b) => b.sku).length;
  const units = totals(inv.skusOnFloor(floor)).onHand;
  const overlay = useBayOverlay();
  const onFloor = new Set([...overlay].filter(([id]) => bays.some((b) => b.id === id)).map(([, st]) => st));
  const items: [string, string][] = [
    ["In stock", "bg-[#3a3a42]"],
    ["Low stock", "bg-warn"],
    ["Selected", "bg-brand"],
    ...(onFloor.has("ageing") ? ([["Ageing", "bg-ageing"]] as [string, string][]) : []),
    ...(onFloor.has("reserved") ? ([["Reserved", "bg-reserved"]] as [string, string][]) : []),
    ...(onFloor.has("freed") ? ([["Freed", "bg-ok"]] as [string, string][]) : []),
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex h-7 items-center gap-3.5 rounded-md border border-border bg-panel px-3 text-[11.5px] whitespace-nowrap text-muted-foreground">
      {items.map(([label, cls]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-[2px]", cls)} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-[2px] border border-dashed border-disabled" />
        Empty bay
      </span>
      {showStats && (
        <>
          <span className="h-3.5 w-px bg-border" />
          <span className="font-mono text-[11px] text-faint">
            Floor {floor} · {occupied}/{bays.length} bays · {units} units · drag to orbit
          </span>
        </>
      )}
    </div>
  );
}
