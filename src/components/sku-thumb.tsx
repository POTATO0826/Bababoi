import { CategoryIcon, Swatch } from "@/components/common";
import type { Sku } from "@/data/catalog";
import { cn } from "@/lib/utils";

export const iconSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * The model's AI-generated icon when there is one, otherwise its material swatch.
 * Icons render through <img>, so the SVG can never run script.
 */
export function SkuThumb({ sku, size, className }: { sku: Sku; size: number; className?: string }) {
  if (sku.icon && sku.iconStatus === "ready") {
    return (
      <span
        className={cn("inline-flex flex-none items-center justify-center rounded-[6px] border border-[#2a2a30] bg-raised-2", className)}
        style={{ width: size, height: size }}
      >
        <img src={iconSrc(sku.icon)} alt="" width={size - 4} height={size - 4} draggable={false} />
      </span>
    );
  }
  if (sku.iconStatus === "pending") {
    return (
      <span className={cn("relative inline-flex flex-none", className)} style={{ width: size, height: size }} aria-label="Generating icon">
        <Swatch color={sku.color} size={size} className="animate-pulse" />
      </span>
    );
  }
  return <Swatch color={sku.color} size={size} className={className} />;
}

/** Larger tile used by New arrivals: icon, a placeholder while Claude draws it, or the category glyph. */
export function SkuIconTile({ sku, size = 42 }: { sku: Sku; size?: number }) {
  const ready = sku.icon && sku.iconStatus === "ready";
  return (
    <span
      className="relative inline-flex flex-none items-center justify-center overflow-hidden rounded-[9px] border border-[#2a2a30] bg-raised-2 text-text-2"
      style={{ width: size, height: size }}
    >
      {ready ? (
        <img src={iconSrc(sku.icon!)} alt={`${sku.model.name} icon`} width={size - 6} height={size - 6} draggable={false} />
      ) : (
        <>
          <span className={cn(sku.iconStatus === "pending" && "animate-pulse opacity-60")}>
            <CategoryIcon id={sku.category.id} />
          </span>
          <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: sku.color }} />
        </>
      )}
    </span>
  );
}
