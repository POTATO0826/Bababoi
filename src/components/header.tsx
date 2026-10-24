import { useClerk } from "@clerk/react";
import { LogOutIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { WarehouseIcon } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { convex, interimIdentity } from "@/convex";
import { cn } from "@/lib/utils";
import { useWare } from "@/store";
import { StaffDialog } from "./staff-dialog";

function useLive() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const check = () => setLive(convex.connectionState().isWebSocketConnected);
    check();
    const t = setInterval(check, 2000);
    return () => clearInterval(t);
  }, []);
  return live;
}

export function Header() {
  const staff = useWare((s) => s.staff);
  const live = useLive();
  const { signOut } = useClerk();
  const [staffOpen, setStaffOpen] = useState(false);

  return (
    <header className="flex items-center gap-3 border-b border-border bg-panel px-4">
      <div className="flex flex-none items-center gap-[9px] text-[15px] font-semibold tracking-[-.01em] whitespace-nowrap">
        <WarehouseIcon className="text-brand" />
        <span>WareOrb</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        {interimIdentity && <Badge variant="warn" title="Clerk development instance: interim sign-in, not the production launch">Interim sign-in</Badge>}
        <span className="hidden h-7 items-center gap-[7px] rounded-full border border-border px-2.5 text-xs text-muted-foreground sm:inline-flex">
          <span className={cn("size-[7px] rounded-full", live ? "animate-blink bg-ok" : "bg-warn")} />
          {live ? "Live" : "Offline"}
        </span>
        {staff?.role === "owner" && <Button variant="quiet" size="sm" onClick={() => setStaffOpen(true)} aria-label="Manage staff"><UsersIcon /> <span className="hidden sm:inline">Staff</span></Button>}
        <span className="min-w-0 text-right text-xs leading-tight">
          <strong className="block max-w-[130px] truncate font-medium">{staff?.name}</strong>
          <span className="block capitalize text-muted-foreground">{staff?.role}</span>
        </span>
        <Button variant="quiet" size="icon-sm" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><LogOutIcon /></Button>
      </div>
      {staff?.role === "owner" && <StaffDialog open={staffOpen} onOpenChange={setStaffOpen} />}
    </header>
  );
}
