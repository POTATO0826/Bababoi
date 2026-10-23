import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { setWare } from "@/store";

/** Popup over the map for a deal, receipt or batch. */
export function DetailShell({ title, sub, badges, children, footer }: { title: ReactNode; sub?: ReactNode; badges?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold tracking-[-.01em]">{title}</span>
          {sub && <span className="truncate font-mono text-[11.5px] text-faint">{sub}</span>}
          {badges && <div className="mt-1 flex flex-wrap gap-1.5">{badges}</div>}
        </div>
        <Button variant="quiet" size="icon-xs" onClick={() => setWare({ detail: null })} aria-label="Close">
          <XIcon />
        </Button>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-col gap-4 overflow-auto p-4">{children}</div>
      {footer && (
        <>
          <Separator />
          <div className="flex flex-col gap-2 p-3">{footer}</div>
        </>
      )}
    </section>
  );
}

export function Section({ label, aside, children, className }: { label: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-[.06em] text-faint uppercase">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Label/value pairs in a compact grid. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0 rounded-md border border-border bg-inset-2 px-2.5 py-2">
          <div className="truncate text-[10px] tracking-[.05em] text-muted-foreground uppercase">{k}</div>
          <div className="mt-0.5 truncate font-mono text-[13.5px] font-semibold tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}
