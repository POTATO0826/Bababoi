import { Html } from "@react-three/drei";
import { selectSku } from "@/actions";
import { SkuIconTile } from "@/components/sku-thumb";
import type { FloorId } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { useInventory, useWare } from "@/store";

/** A pin with the AI icon above each new arrival's first bay. It goes away with the model when stock runs out. */
export function ArrivalPins({ floor }: { floor: FloorId }) {
  const inv = useInventory();
  const selected = useWare((s) => s.selected);
  const dragging = useWare((s) => s.dragging);

  return (
    <>
      {inv.newArrivals.map((s) => {
        const bay = inv.bays[floor].find((b) => b.sku?.sku === s.sku);
        if (!bay) return null;
        const [x0, z0, x1, z1] = bay.rect;
        return (
          <Html key={s.sku} position={[(x0 + x1) / 2, 2.9, (z0 + z1) / 2]} zIndexRange={[3, 0]} style={{ pointerEvents: dragging ? "none" : "auto" }}>
            <button
              onClick={() => selectSku(s)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`New arrival: ${s.model.name} ${s.variant}`}
              className={cn(
                "flex -translate-x-1/2 -translate-y-full animate-fade-up cursor-pointer flex-col items-center",
                selected === s.sku ? "opacity-100" : "opacity-90 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "relative rounded-[11px] border bg-panel p-[3px] shadow-[0_8px_24px_rgba(0,0,0,.5)]",
                  selected === s.sku ? "border-brand" : "border-border-strong",
                )}
              >
                <SkuIconTile sku={s} size={34} />
                <span className="absolute -top-2 -right-2 rounded-full bg-brand px-1.5 py-px text-[9px] font-semibold tracking-[.04em] text-white">
                  NEW
                </span>
              </span>
              <span className="h-3 w-px bg-border-strong" />
              <span className="size-1.5 rounded-full bg-brand" />
            </button>
          </Html>
        );
      })}
    </>
  );
}
