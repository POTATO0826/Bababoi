import { MicIcon, MicOffIcon, XIcon } from "lucide-react";
import { closeAgent, runCommand, toggleMute, voiceInputSupported } from "@/actions";
import { Kicker, TotalsStrip, WarehouseIcon } from "@/components/common";
import { JarvisOrb, OrbStatus } from "@/components/jarvis/orb";
import { SkuThumb } from "@/components/sku-thumb";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { available, skuTitle } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { setWare, useInventory, useWare, type Lang } from "@/store";

const SUGGESTIONS = ["What needs attention?", "有什么旧货？", "Get delivery quotes for the sofa deal"];

/** Listening session — not a chatbot: no text input, no chat log. */
export function JarvisSession({ drawer, className }: { drawer: boolean; className?: string }) {
  const orb = useWare((s) => s.orb);
  const muted = useWare((s) => s.muted);
  const interim = useWare((s) => s.interim);
  const micError = useWare((s) => s.micError);
  const transcript = useWare((s) => s.transcript);
  const lang = useWare((s) => s.lang);

  const lastUser = transcript.filter((t) => t.who === "user").at(-1)?.text;
  const lastAi = transcript.filter((t) => t.who === "ai").at(-1)?.text ?? "";
  const heard = interim
    ? `“${interim}”`
    : (lastUser ??
      (muted
        ? "Microphone muted"
        : micError
          ? micError
          : voiceInputSupported()
            ? "Say a command…"
            : "No microphone — tap a suggestion below."));
  const reply = orb === "thinking" ? "…" : lastAi;

  return (
    <aside
      aria-label="Jarvis voice session"
      className={cn(
        "flex min-h-0 animate-slide-in flex-col overflow-hidden rounded-lg border border-border bg-panel",
        drawer && "fixed top-16 right-3 bottom-3 z-20 w-[min(340px,calc(100vw-24px))] shadow-[0_16px_40px_rgba(0,0,0,.6)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border py-2.5 pr-2.5 pl-3.5">
        <span className="text-[13.5px] font-semibold">Jarvis</span>
        <ToggleGroup
          type="single"
          value={lang}
          onValueChange={(v) => v && setWare({ lang: v as Lang })}
          spacing={0.5}
          className="ml-auto rounded-[7px] border border-border bg-inset p-[3px]"
          aria-label="Language"
        >
          <ToggleGroupItem value="auto" variant="segment" size="segment">
            Auto
          </ToggleGroupItem>
          <ToggleGroupItem value="en" variant="segment" size="segment">
            EN
          </ToggleGroupItem>
          <ToggleGroupItem value="zh" variant="segment" size="segment">
            {"中文"}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="quiet" size="icon-xs" onClick={closeAgent} aria-label="End session" className="size-[26px]">
          <XIcon />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-[18px] overflow-auto px-4 pt-[22px] pb-4">
        <OrbStatus />
        <JarvisOrb size={180} />
        <div className="flex min-h-[84px] w-full flex-col items-center gap-2 text-center" aria-live="polite">
          <span className="text-[13px] text-faint italic">{heard}</span>
          <span className="text-[15px] leading-normal text-pretty text-foreground">{reply}</span>
        </div>
        <OnTheMap />
        <div className="flex w-full flex-col gap-1.5">
          <Kicker className="text-[10.5px] font-normal">Try saying</Kicker>
          {SUGGESTIONS.map((label) => (
            <button
              key={label}
              onClick={() => runCommand(label)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-inset px-2.5 py-2 text-left text-[12.5px] text-text-2 transition-colors hover:bg-hover-row"
            >
              <MicIcon className="size-[13px] flex-none text-faint" />
              <span>“{label}”</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2.5 border-t border-border p-3">
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={muted}
          className={cn(
            "inline-flex size-11 items-center justify-center rounded-full border transition-all hover:brightness-125",
            muted ? "border-red-900 bg-red-500/15 text-red-400" : "border-border bg-raised text-foreground",
          )}
        >
          {muted ? <MicOffIcon className="size-[18px]" /> : <MicIcon className="size-[18px]" />}
        </button>
        <button
          onClick={closeAgent}
          className="h-11 rounded-full bg-foreground px-5 text-[13px] font-semibold text-background transition-colors hover:bg-zinc-200"
        >
          End session
        </button>
      </div>
    </aside>
  );
}

function OnTheMap() {
  const floor = useWare((s) => s.floor);
  const zone = useWare((s) => s.zone);
  const view = useWare((s) => s.view);
  const code = useWare((s) => s.selected);
  const inv = useInventory();
  const selected = inv.byCode.get(code ?? "");
  const zc = zone ? inv.zoneCategory(floor, zone) : null;
  const line = `Floor ${floor}${zone ? ` · ${zc?.name ?? "Zone"} · Zone ${zone}` : " · Overview"}${view === "top" ? " · Top-down" : ""}`;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Kicker className="text-[10.5px] font-normal">On the map</Kicker>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-inset px-2.5 py-[9px]">
        <WarehouseIcon size={14} className="flex-none text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{line}</span>
      </div>
      {selected && (
        <div className="flex animate-fade-up flex-col gap-2 rounded-lg border border-brand/35 bg-brand/8 p-2.5">
          <div className="flex items-center gap-2">
            <SkuThumb sku={selected} size={22} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold">{skuTitle(selected)}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {selected.sku} · Floor {selected.floor} · Zone {selected.zone}
              </span>
            </span>
          </div>
          <TotalsStrip totals={{ ...selected, available: available(selected) }} short className="border-border bg-border" />
          <div className="flex flex-wrap gap-1">
            {inv.codesFor(selected).map((c) => (
              <span key={c.code} className="inline-flex h-5 items-center rounded-sm border border-brand/35 px-[7px] font-mono text-[10.5px]">
                {c.code}
                <span className="ml-[5px] text-faint">×{c.qty}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
