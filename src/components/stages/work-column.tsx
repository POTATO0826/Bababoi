import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { closePanel } from "@/commands";
import { JarvisDock } from "@/components/jarvis/jarvis-dock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** Left column for a workflow stage: heading, one or more lists, Jarvis dock. */
export function WorkColumn({ title, aside, action, children, className }: { title: string; aside?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <aside className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex items-center gap-2 px-0.5 pt-0.5">
        <h1 className="text-[17px] font-semibold tracking-[-.01em]">{title}</h1>
        <span className="ml-auto">{aside}</span>
        <Button variant="quiet" size="icon-xs" onClick={closePanel} aria-label="Close (Esc)" title="Esc">
          <XIcon />
        </Button>
      </div>
      {action}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">{children}</div>
      <JarvisDock />
    </aside>
  );
}

export function WorkList({ label, count, children }: { label?: string; count?: number; children: ReactNode }) {
  return (
    <Card className="flex-none gap-0 overflow-hidden py-0">
      {label && (
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5">
          <span className="text-[11.5px] font-semibold tracking-[.06em] uppercase">{label}</span>
          {count != null && <span className="font-mono text-[11px] text-muted-foreground">{count}</span>}
        </div>
      )}
      {children}
    </Card>
  );
}

export function WorkRow({
  title,
  sub,
  aside,
  active,
  mine,
  onClick,
}: {
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  active?: boolean;
  /** Waiting on the current role. */
  mine?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(
        "flex w-full items-center gap-3 border-t border-border-inner px-3.5 py-2.5 text-left transition-colors hover:bg-hover-row",
        active && "bg-brand/12 shadow-[inset_2px_0_0_var(--brand)] hover:bg-brand/12",
      )}
    >
      <span className={cn("size-[7px] flex-none rounded-full", mine ? "bg-brand" : "bg-transparent")} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-medium">{title}</span>
        {sub && <span className="truncate font-mono text-[11.5px] text-faint">{sub}</span>}
      </span>
      {aside}
    </button>
  );
}

export function NothingHere({ title, hint }: { title: string; hint?: string }) {
  return (
    <Empty className="border-t border-border-inner py-8">
      <EmptyHeader>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        {hint && <EmptyDescription className="text-xs">{hint}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}
