import { useEffect, useState } from "react";
import { WarehouseIcon } from "@/components/common";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { convex } from "@/convex";
import type { Role } from "@/domain/types";
import { cn } from "@/lib/utils";
import { PEOPLE, setRole, useWare } from "@/store";

const ROLES: [Role, string][] = [
  ["owner", "Owner"],
  ["sales", "Sales"],
  ["warehouse", "Warehouse"],
];

function useLive() {
  const [live, setLive] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setLive(convex.connectionState().isWebSocketConnected), 2000);
    return () => clearInterval(t);
  }, []);
  return live;
}

export function Header() {
  const role = useWare((s) => s.role);
  const live = useLive();

  return (
    <header className="flex items-center gap-3 border-b border-border bg-panel px-4">
      <div className="flex flex-none items-center gap-[9px] text-[15px] font-semibold tracking-[-.01em] whitespace-nowrap">
        <WarehouseIcon className="text-brand" />
        <span>WareOrb</span>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5 whitespace-nowrap">
        <span className="inline-flex h-7 items-center gap-[7px] rounded-full border border-border px-2.5 text-xs text-muted-foreground">
          <span className={cn("size-[7px] rounded-full", live ? "animate-blink bg-ok" : "bg-warn")} />
          {live ? "Live" : "Offline"}
        </span>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger size="sm" className="w-[150px]" aria-label="Acting as">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {ROLES.map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {PEOPLE[k]} · {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
