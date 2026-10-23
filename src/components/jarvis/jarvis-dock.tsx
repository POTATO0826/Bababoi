import { openAgent } from "@/actions";
import { JarvisOrb, OrbStatus } from "@/components/jarvis/orb";
import { cn } from "@/lib/utils";
import { useWare } from "@/store";

/** Entry point pinned to the bottom of the inventory column. Pressing it opens the session and starts listening. */
export function JarvisDock() {
  const open = useWare((s) => s.agentOpen);
  if (open) return null;
  return (
    <div className="flex flex-none flex-col gap-1.5">
    <button
      onClick={() => openAgent()}
      aria-label="Talk to Jarvis"
      className={cn(
        "flex w-full flex-none items-center gap-3 rounded-xl border py-2.5 pr-3 pl-2.5 text-left transition-all hover:border-border-strong hover:bg-inset-2",
        open ? "border-border-strong bg-inset-2" : "border-border bg-card",
      )}
    >
      <JarvisOrb size={56} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">Jarvis</span>
        <span className="truncate text-[11.5px] text-faint">
          Ask, talk or scan
        </span>
      </span>
      <OrbStatus />
    </button>
    <button onClick={() => openAgent({ draft: "/" })} className="self-center font-mono text-[11px] text-disabled transition-colors hover:text-muted-foreground">
      / for commands
    </button>
    </div>
  );
}
