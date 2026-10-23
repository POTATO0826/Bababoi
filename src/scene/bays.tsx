import { Html, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { openReceiving, selectSku, zoomZone } from "@/actions";
import { Swatch } from "@/components/common";
import { dragState, setPointing } from "@/interaction";
import { ZONE_IDS, ZONES } from "@/data/layout";
import { available, isLow, skuTitle, type Inventory, type LocationView, type ProductView } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import type { FloorId, ZoneId } from "@/shared/contracts";
import { getWare, setWare, useWare } from "@/store";
import { pendingRect } from "./furniture/placements";
import { rectLoop } from "./structure";

const isClick = (e: ThreeEvent<MouseEvent>) => !dragState.suppressClick && e.delta <= 4;

// ── Zones (overview: hover + click to zoom) ───────────────────────────────

function Zone({ id }: { id: ZoneId }) {
  const active = useWare((s) => s.zone === id);
  const zoomed = useWare((s) => s.zone !== null);
  const [hover, setHover] = useState(false);
  const [x0, z0, x1, z1] = ZONES[id];
  const points = useMemo(() => rectLoop(ZONES[id], 0.03), [id]);
  const lit = hover && !zoomed;

  return (
    <group>
      <mesh
        position={[(x0 + x1) / 2, 0.006, (z0 + z1) / 2]}
        rotation-x={-Math.PI / 2}
        renderOrder={1}
        onPointerOver={(e) => {
          if (zoomed) return;
          e.stopPropagation();
          setHover(true);
          setPointing(true);
        }}
        onPointerOut={() => {
          setHover(false);
          setPointing(false);
        }}
        onClick={(e) => {
          if (zoomed || !isClick(e)) return;
          e.stopPropagation();
          zoomZone(id);
        }}
      >
        <planeGeometry args={[x1 - x0, z1 - z0]} />
        <meshBasicMaterial
          color={active ? "#4f8bea" : "#ffffff"}
          transparent
          opacity={active ? 0.08 : lit ? 0.05 : 0.02}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Line
        points={points}
        color={active ? "#4f8bea" : lit ? "#a1a1aa" : "#3f3f46"}
        lineWidth={active || lit ? 1.4 : 1}
        dashed
        dashSize={1.2}
        gapSize={0.9}
        depthWrite={false}
        toneMapped={false}
        renderOrder={2}
      />
    </group>
  );
}

// ── Bays: floor pads + invisible hit volumes ──────────────────────────────

const PAD = 0.3;

function padStyle(bay: LocationView, s: ProductView | undefined, selected: string | null, hover: string | null, threshold: number) {
  let fill = "#ffffff";
  let fillOpacity = 0.035;
  let stroke = "#3a3a42";
  let width = 1;
  let dashed = false;
  if (!s) {
    fillOpacity = 0.012;
    stroke = "#3f3f46";
    dashed = true;
  } else if (selected === s.sku) {
    fill = "#4f8bea";
    fillOpacity = 0.3;
    stroke = "#8db1f3";
    width = 1.6;
  } else if (isLow(s, threshold)) {
    fill = "#e3bd78";
    fillOpacity = 0.16;
    stroke = "#e3bd78";
    width = 1.3;
  }
  if (hover === bay.id) {
    stroke = "#fafafa";
    width = 1.6;
  }
  return { fill, fillOpacity, stroke, width, dashed };
}

function BayPad({ bay, product }: { bay: LocationView; product: ProductView | undefined }) {
  const selected = useWare((s) => s.selected);
  const hover = useWare((s) => s.hoverBay);
  const threshold = useWare((s) => s.settings.lowStockThreshold);
  const st = padStyle(bay, product, selected, hover, threshold);
  const [x0, z0, x1, z1] = bay.rect;
  const points = useMemo(() => rectLoop([x0 - PAD, z0 - PAD, x1 + PAD, z1 + PAD], 0.035), [x0, z0, x1, z1]);
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} renderOrder={3}>
        <planeGeometry args={[x1 - x0 + PAD * 2, z1 - z0 + PAD * 2]} />
        <meshBasicMaterial color={st.fill} transparent opacity={st.fillOpacity} depthWrite={false} toneMapped={false} />
      </mesh>
      <Line
        points={points}
        color={st.stroke}
        lineWidth={st.width}
        dashed={st.dashed}
        dashSize={0.35}
        gapSize={0.35}
        depthWrite={false}
        toneMapped={false}
        renderOrder={5}
      />
    </group>
  );
}

function BayHit({ bay, height }: { bay: LocationView; height: number }) {
  const [x0, z0, x1, z1] = bay.rect;
  return (
    <mesh
      position={[(x0 + x1) / 2, height / 2, (z0 + z1) / 2]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setPointing(true);
        const st = getWare();
        if (st.zone && !st.dragging && bay.sku) setWare({ hoverBay: bay.id });
      }}
      onPointerOut={() => {
        setPointing(false);
        if (getWare().hoverBay === bay.id) setWare({ hoverBay: null });
      }}
      onClick={(e) => {
        if (!isClick(e)) return;
        e.stopPropagation();
        if (!getWare().zone) zoomZone(bay.zone);
        // Clicking a bay keeps that bay's floor and zone in focus, even for a SKU stored in several zones.
        else if (bay.sku) selectSku(bay.sku, { floor: bay.floor, zone: bay.zone, bayId: bay.id });
      }}
    >
      <boxGeometry args={[x1 - x0 + PAD * 2, height, z1 - z0 + PAD * 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

/** Height of the invisible hit volume (and where the hover card sits). */
function bayHeight(bay: LocationView, product: ProductView | undefined) {
  if (!bay.sku || !product) return 0.4;
  switch (product.kind) {
    case "wardrobe":
      return 2.15;
    case "lamp":
    case "bunk":
    case "carton":
      return 1.9;
    case "cabinet":
    case "mattress":
    case "mirror":
      return 1.2;
    default:
      return 1.05;
  }
}

/** Hover card anchored above the hovered bay; follows the camera. */
function HoverTip({ floor, inv }: { floor: FloorId; inv: Inventory }) {
  const hoverId = useWare((s) => s.hoverBay);
  const threshold = useWare((s) => s.settings.lowStockThreshold);
  const bay = hoverId ? inv.byFloor[floor].find((b) => b.id === hoverId) : undefined;
  const product = bay?.sku ? inv.bySku.get(bay.sku) : undefined;
  const pending = hoverId === "pending" && floor === 1 ? pendingRect(inv.pendingUnits) : null;
  if (!product && !pending) return null;

  const [x0, z0, x1, z1] = pending ?? bay!.rect;
  const pos: [number, number, number] = [(x0 + x1) / 2, pending ? 1.4 : bayHeight(bay!, product) + 0.3, (z0 + z1) / 2];

  return (
    <Html position={pos} zIndexRange={[6, 6]} style={{ pointerEvents: "none" }}>
      <div className="min-w-[180px] -translate-x-1/2 -translate-y-full animate-fade-up rounded-md border border-border-strong bg-panel px-2.5 py-2 whitespace-nowrap text-foreground shadow-[0_8px_24px_rgba(0,0,0,.5)]" style={{ marginTop: -10 }}>
        {pending ? (
          <>
            {inv.pending.slice(0, 3).map((r) => (
              <div key={r.id} className="mb-0.5">
                <div className="text-[12.5px] font-semibold">{r.documentRef ? `Delivery note ${r.documentRef}` : "Manual receipt"}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {r.lines.map((l) => `${l.quantity ?? "?"} × ${l.sku ?? "unresolved"}`).join(" · ")} · inbound dock
                </div>
              </div>
            ))}
            {inv.pending.length > 3 && <div className="text-[11px] text-faint">+{inv.pending.length - 3} more drafts</div>}
            <div className="mt-[5px] text-[11.5px] font-medium text-warn">
              {inv.pendingUnits} {inv.pendingUnits === 1 ? "unit" : "units"} awaiting verification · not on hand · click to review
            </div>
          </>
        ) : (
          (() => {
            const s = product!;
            const low = isLow(s, threshold);
            return (
              <>
                <div className="flex items-center gap-2">
                  <Swatch color={s.color} />
                  <span className="text-[12.5px] font-semibold">{skuTitle(s)}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {s.sku} · F{bay!.floor} {bay!.code}
                </div>
                <div className="mt-[5px] flex gap-1.5 text-[11.5px]">
                  <span>{bay!.quantity} here</span>
                  <span className="text-disabled">·</span>
                  <span className={cn("font-medium", low ? "text-warn" : "text-brand-light")}>{available(s)} available</span>
                  {s.locations.length > 1 && (
                    <>
                      <span className="text-disabled">·</span>
                      <span className="text-faint">{s.locations.length} bays</span>
                    </>
                  )}
                </div>
              </>
            );
          })()
        )}
      </div>
    </Html>
  );
}

function PendingHit({ inv }: { inv: Inventory }) {
  const rect = pendingRect(inv.pendingUnits);
  if (!rect) return null;
  const [x0, z0, x1, z1] = rect;
  return (
    <mesh
      position={[(x0 + x1) / 2, 0.5, (z0 + z1) / 2]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setPointing(true);
        if (!getWare().dragging) setWare({ hoverBay: "pending" });
      }}
      onPointerOut={() => {
        setPointing(false);
        if (getWare().hoverBay === "pending") setWare({ hoverBay: null });
      }}
      onClick={(e) => {
        if (!isClick(e)) return;
        e.stopPropagation();
        openReceiving(inv.pending.length === 1 ? inv.pending[0]!.id : null);
      }}
    >
      <boxGeometry args={[x1 - x0, 1, z1 - z0]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

export function BaysLayer({ floor, inventory: inv }: { floor: FloorId; inventory: Inventory }) {
  const showEmpty = useWare((s) => s.settings.showEmptyBays);
  const all = inv.byFloor[floor];
  const bays = all.filter((b) => showEmpty || b.sku);
  return (
    <group>
      {ZONE_IDS.map((z) => (
        <Zone key={z} id={z} />
      ))}
      {bays.map((b) => (
        <BayPad key={b.id} bay={b} product={b.sku ? inv.bySku.get(b.sku) : undefined} />
      ))}
      {all.map((b) => (
        <BayHit key={b.id} bay={b} height={bayHeight(b, b.sku ? inv.bySku.get(b.sku) : undefined)} />
      ))}
      {floor === 1 && <PendingHit inv={inv} />}
      <HoverTip floor={floor} inv={inv} />
    </group>
  );
}
