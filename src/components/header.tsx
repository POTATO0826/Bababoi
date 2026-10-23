import { BellIcon, CheckIcon, LogOutIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openReceiving } from "@/actions";
import { WarehouseIcon } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { signIn, signOut, useServerData } from "@/server-data";
import { localTime } from "@/shared/time";

export function Header() {
  const pending = useServerData((s) => s.inventory?.pending.length ?? 0);
  return (
    <header className="flex items-center gap-1.5 border-b border-border bg-panel px-4">
      <div className="mr-[18px] flex flex-none items-center gap-[9px] text-[15px] font-semibold tracking-[-.01em] whitespace-nowrap">
        <WarehouseIcon className="text-brand" />
        <span>WareOrb</span>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5 whitespace-nowrap">
        <SyncPill />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="quiet" size="icon-sm" aria-label={`Receiving drafts awaiting verification: ${pending}`} className="relative" onClick={() => openReceiving(null)}>
              <BellIcon />
              {pending > 0 && (
                <span className="absolute top-[3px] right-[2px] flex h-[14px] min-w-[14px] items-center justify-center rounded-full border-[1.5px] border-panel bg-warn px-[3px] font-mono text-[9px] font-bold text-background">
                  {pending}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {pending ? `${pending} receiving ${pending === 1 ? "draft" : "drafts"} awaiting verification` : "No receiving drafts awaiting verification"}
          </TooltipContent>
        </Tooltip>
        <PersonaMenu />
      </div>
    </header>
  );
}

/** Connection state of the stock ledger: never a permanent "Live" claim. */
function SyncPill() {
  const status = useServerData((s) => s.status);
  const stale = useServerData((s) => s.stale);
  const syncedAt = useServerData((s) => s.syncedAt);
  const tz = useServerData((s) => s.inventory?.warehouse.timezone ?? "UTC");
  const rev = useServerData((s) => s.inventory?.revision);
  const synthetic = useServerData((s) => s.inventory?.warehouse.syntheticData);
  const error = useServerData((s) => s.error);
  const auth = useServerData((s) => s.auth);

  const [label, dot, title] =
    status === "loading"
      ? ["Connecting…", "bg-faint animate-blink", "Reading the stock ledger"]
      : status === "error"
        ? ["Ledger unavailable", "bg-red-400", error ?? "The stock ledger could not be read."]
        : stale
          ? [`Stale · ${syncedAt ? localTime(syncedAt, tz) : "—"}`, "bg-warn", `${error ?? "Refresh failed."} Showing the last synced snapshot; stock confirmations are disabled.`]
          : [`Synced ${syncedAt ? localTime(syncedAt, tz) : ""}`, "bg-ok", `Ledger revision ${rev} read at ${syncedAt ? localTime(syncedAt, tz) : "—"} (${tz}).`];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-7 items-center gap-[7px] rounded-full border px-2.5 text-xs",
            stale || status === "error" ? "border-warn/40 text-warn" : "border-border text-muted-foreground",
          )}
          aria-live="polite"
        >
          <span className={cn("size-[7px] rounded-full", dot)} />
          {auth === "anonymous" && status !== "ready" ? "Signed out" : label}
          {synthetic && <span className="border-l border-border pl-[7px] text-faint">Synthetic data</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[280px] whitespace-normal">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

const ROLE_LABEL = { owner: "Owner", warehouse: "Warehouse", sales: "Sales" } as const;

function PersonaMenu() {
  const session = useServerData((s) => s.session);
  const personas = useServerData((s) => s.personas);
  const auth = useServerData((s) => s.auth);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (auth === "disabled") return null;
  const user = session?.user;

  const choose = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      await signIn(id);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not switch persona.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Demo persona: ${user.name} (${ROLE_LABEL[user.role]})` : "Choose a demo persona"}
        className="flex h-7 items-center gap-2 rounded-full border border-border-strong bg-raised pr-2.5 pl-[3px] text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex size-[22px] items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">{user?.initials ?? "?"}</span>
        {user ? ROLE_LABEL[user.role] : "Persona"}
      </button>
      {open && (
        <div role="menu" className="absolute top-9 right-0 z-40 w-[260px] animate-fade-up rounded-lg border border-border-strong bg-panel p-1.5 shadow-[0_16px_40px_rgba(0,0,0,.6)]">
          <div className="px-2 pt-1 pb-1.5 text-[10.5px] leading-snug text-faint">
            Synthetic demo personas — simulated sign-in. Permissions are enforced by the server.
          </div>
          {personas.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={user?.id === p.id}
              disabled={busy}
              onClick={() => void choose(p.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-hover-row disabled:opacity-60"
            >
              <span className="flex size-6 flex-none items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">{p.initials}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{p.name}</span>
                <span className="text-[11px] text-faint">{ROLE_LABEL[p.role]}</span>
              </span>
              {user?.id === p.id && <CheckIcon className="size-3.5 text-brand-light" />}
            </button>
          ))}
          {user && (
            <button
              onClick={() => void signOut().then(() => setOpen(false))}
              className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-2 pt-2 pb-1.5 text-left text-[12px] text-muted-foreground hover:text-foreground"
            >
              <LogOutIcon className="size-3.5" /> Sign out
            </button>
          )}
          {err && <div className="px-2 py-1 text-[11.5px] text-red-400">{err}</div>}
        </div>
      )}
    </div>
  );
}
