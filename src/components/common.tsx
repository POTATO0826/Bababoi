import type { CSSProperties, ReactNode } from "react";
import type { CategoryId, Totals } from "@/data/catalog";
import { cn } from "@/lib/utils";

export function Swatch({ color, size = 10, className }: { color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block flex-none rounded-[3px] border border-white/18", className)}
      style={{ width: size, height: size, background: color }}
    />
  );
}

/** Section label: 11px uppercase faint. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[11px] font-medium tracking-[.06em] text-faint uppercase", className)}>{children}</span>;
}

/** Card heading: 11.5px uppercase semibold. */
export function CardHeading({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] font-semibold tracking-[.06em] uppercase">{children}</span>;
}

const STAT_FIELDS = [
  ["onHand", "On hand"],
  ["reserved", "Reserved"],
  ["available", "Available"],
  ["incoming", "Incoming"],
] as const;

/** 2×2 stat tiles (On hand / Reserved / Available highlighted / Incoming). */
export function StatTiles({ totals, size = "lg" }: { totals: Omit<Totals, "skus">; size?: "lg" | "md" }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {STAT_FIELDS.map(([key, label]) => {
        const brand = key === "available";
        return (
          <div
            key={key}
            className={cn(
              "min-w-0 rounded-md border px-2.5",
              size === "lg" ? "py-[9px]" : "py-2",
              brand ? "border-brand/40 bg-brand/12" : "border-border bg-inset-2",
            )}
          >
            <div className={cn("truncate text-[10px] tracking-[.05em] uppercase", brand ? "text-brand-light" : "text-muted-foreground")}>
              {label}
            </div>
            <div
              className={cn(
                "mt-0.5 font-mono font-semibold tabular-nums",
                size === "lg" ? "text-xl" : "text-lg",
                brand && "text-brand-value",
              )}
            >
              {totals[key]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Thin 4-up (or 2×2) strip of totals with 1px gutters. */
export function TotalsStrip({
  totals,
  columns = 4,
  short = false,
  className,
}: {
  totals: Omit<Totals, "skus">;
  columns?: 2 | 4;
  short?: boolean;
  className?: string;
}) {
  const labels = short ? ["Hand", "Rsvd", "Avail", "In"] : STAT_FIELDS.map(([, l]) => l);
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-md border border-border-inner bg-border-inner",
        columns === 4 ? "grid-cols-4" : "grid-cols-2",
        className,
      )}
    >
      {STAT_FIELDS.map(([key], i) => {
        const brand = key === "available";
        return (
          <div key={key} className="min-w-0 bg-inset px-2 py-1.5">
            <div className={cn("truncate text-[9.5px] tracking-[.05em] uppercase", brand ? "text-brand-light" : "text-faint")}>
              {labels[i]}
            </div>
            <div className={cn("font-mono text-[13px] font-semibold tabular-nums", brand && "text-brand-value")}>{totals[key]}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Small status pill with a dot (Live, orb status). */
export function StatusPill({
  label,
  color,
  bg,
  border,
  blink,
  className,
}: {
  label: string;
  color: string;
  bg: string;
  border: string;
  blink?: boolean;
  className?: string;
}) {
  const style: CSSProperties = { color, background: bg, borderColor: border };
  return (
    <span
      className={cn(
        "inline-flex h-[22px] flex-none items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition-all duration-300",
        className,
      )}
      style={style}
    >
      <span className={cn("size-1.5 rounded-full", blink && "animate-blink-fast")} style={{ background: color }} />
      {label}
    </span>
  );
}

// Icons from the prototype (Lucide paths; tables and wardrobes are custom).
const CATEGORY_PATHS: Record<CategoryId, string> = {
  sofas:
    "M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3 M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z M4 18v2 M20 18v2",
  tables: "M3 8h18 M5 8v10 M19 8v10 M5 13h14",
  chairs:
    "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3 M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z M5 18v2 M19 18v2",
  wardrobes: "M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14 M2 20h20 M14 12v.01",
  beds: "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8 M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4 M12 4v6 M2 18h20",
  general:
    "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7l8.7 5 8.7-5 M12 22V12 M7.5 4.27l9 5.15",
};

export function CategoryIcon({ id, size = 19 }: { id: CategoryId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={CATEGORY_PATHS[id]} />
    </svg>
  );
}

export function WarehouseIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" />
      <path d="M6 18h12" />
      <path d="M6 14h12" />
      <rect width="12" height="12" x="6" y="10" />
    </svg>
  );
}
