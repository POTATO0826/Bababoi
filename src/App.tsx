import { Header } from "@/components/header";
import { LedgerSync } from "@/components/ledger-sync";
import { InventoryColumn } from "@/components/inventory/inventory-column";
import { ReceiveDialog } from "@/components/inventory/receive-dialog";
import { JarvisSession } from "@/components/jarvis/jarvis-session";
import { Viewport } from "@/components/viewport/viewport";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLayoutTier } from "@/hooks/use-layout";
import { cn } from "@/lib/utils";
import { useWare } from "@/store";

// Body grid per docs/design-handoff.md → Layout. `stacked` (<720px) is an addition for phones.
const COLUMNS = {
  wide: { base: "316px minmax(0,1fr)", agent: " 320px" },
  mid: { base: "280px minmax(0,1fr)", agent: " 272px" },
  narrow: { base: "256px minmax(0,1fr)", agent: "" },
  stacked: { base: "minmax(0,1fr)", agent: "" },
} as const;

export function App() {
  const { tier } = useLayoutTier();
  const agentOpen = useWare((s) => s.agentOpen);
  const drawer = tier === "narrow" || tier === "stacked";
  const fixedRows = tier === "wide" || tier === "mid";
  const cols = COLUMNS[tier];

  return (
    <TooltipProvider delayDuration={300}>
      <LedgerSync />
      <div className={cn("grid grid-rows-[52px_minmax(0,1fr)]", fixedRows ? "h-screen" : "min-h-screen")}>
        <Header />
        <div
          className="grid min-h-0 gap-3 p-3"
          style={{ gridTemplateColumns: cols.base + (agentOpen && !drawer ? cols.agent : "") }}
        >
          <InventoryColumn
            wide={tier === "wide"}
            className={cn(tier === "narrow" && "h-[min(560px,calc(100vh-76px))]", tier === "stacked" && "order-2 max-h-[80vh]")}
          />
          <Viewport
            className={cn(
              tier === "narrow" && "h-[min(560px,calc(100vh-76px))]",
              tier === "stacked" && "order-1 h-[min(520px,calc(100vh-140px))]",
            )}
          />
          {agentOpen && <JarvisSession drawer={drawer} />}
        </div>
      </div>
      <ReceiveDialog />
      <Toaster position="bottom-right" theme="dark" />
    </TooltipProvider>
  );
}
