import { useEffect } from "react";
import { openAgent } from "@/actions";
import { closePanel } from "@/commands";
import { Header } from "@/components/header";
import { LedgerSync } from "@/components/ledger-sync";
import { StageColumn } from "@/components/stages/stage-column";
import { ReceiveDialog } from "@/components/inventory/receive-dialog";
import { JarvisChat } from "@/components/jarvis/jarvis-chat";
import { Viewport } from "@/components/viewport/viewport";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLayoutTier } from "@/hooks/use-layout";
import { cn } from "@/lib/utils";
import { getWare, useWare } from "@/store";

// Body grid per docs/design-handoff.md → Layout. `stacked` (<720px) is an addition for phones.
const COLUMNS = {
  wide: { base: "316px minmax(0,1fr)", agent: " 320px" },
  mid: { base: "280px minmax(0,1fr)", agent: " 272px" },
  narrow: { base: "256px minmax(0,1fr)", agent: "" },
  stacked: { base: "minmax(0,1fr)", agent: "" },
} as const;

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
};

/** "/" or Ctrl+K opens Jarvis with "/" typed; Esc closes the open panel and returns to the map. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing(e.target))) {
        e.preventDefault();
        openAgent({ draft: "/" });
      } else if (e.key === "Escape" && !typing(e.target)) {
        const s = getWare();
        if (s.detail || s.stage !== "inventory") closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  useShortcuts();
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
          <StageColumn
            wide={tier === "wide"}
            className={cn(tier === "narrow" && "h-[min(560px,calc(100vh-76px))]", tier === "stacked" && "order-2 max-h-[80vh]")}
          />
          <Viewport
            className={cn(
              tier === "narrow" && "h-[min(560px,calc(100vh-76px))]",
              tier === "stacked" && "order-1 h-[min(520px,calc(100vh-140px))]",
            )}
          />
          {agentOpen && <JarvisChat drawer={drawer} />}
        </div>
      </div>
      <ReceiveDialog />
      <Toaster position="bottom-right" theme="dark" />
    </TooltipProvider>
  );
}
