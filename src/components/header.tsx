import { BellIcon } from "lucide-react";
import { WarehouseIcon } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Header() {
  return (
    <header className="flex items-center gap-1.5 border-b border-border bg-panel px-4">
      <div className="mr-[18px] flex flex-none items-center gap-[9px] text-[15px] font-semibold tracking-[-.01em] whitespace-nowrap">
        <WarehouseIcon className="text-brand" />
        <span>WareOrb</span>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5 whitespace-nowrap">
        <span className="inline-flex h-7 items-center gap-[7px] rounded-full border border-border px-2.5 text-xs text-muted-foreground">
          <span className="size-[7px] animate-blink rounded-full bg-ok" />
          Live
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="quiet" size="icon-sm" aria-label="Notifications" className="relative">
              <BellIcon />
              <span className="absolute top-[5px] right-[5px] size-[7px] rounded-full border-[1.5px] border-panel bg-warn" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">1 delivery note awaiting verification</TooltipContent>
        </Tooltip>
        <div className="flex size-7 items-center justify-center rounded-full border border-border-strong bg-raised text-[11px] font-semibold text-muted-foreground">
          JL
        </div>
      </div>
    </header>
  );
}
