import { MicIcon, SquareIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { recordUtterance, transcribe } from "@/voice/voice";
import { useWare } from "@/store";

/** Dictate a receiving note: records audio, transcribes (Fish, else the browser), returns text + stored audio. */
export function DictateButton({ onText }: { onText: (text: string, storageId?: Id<"_storage">) => void }) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const stop = useRef<(() => void) | null>(null);
  const lang = useWare((s) => s.lang);

  const start = async () => {
    setState("rec");
    try {
      const rec = recordUtterance({ maxMs: 60_000, silenceMs: 2500 });
      stop.current = rec.stop;
      const audio = await rec.done;
      setState("busy");
      const r = await transcribe(audio, lang, { keep: true });
      if (r.text.trim()) onText(r.text.trim(), r.storageId);
    } finally {
      stop.current = null;
      setState("idle");
    }
  };

  return (
    <Button
      variant="quiet"
      size="icon-xs"
      title={state === "rec" ? "Stop" : "Voice note"}
      disabled={state === "busy"}
      onClick={() => (state === "rec" ? stop.current?.() : void start())}
      className={state === "rec" ? "text-dispatch" : undefined}
    >
      {state === "rec" ? <SquareIcon /> : <MicIcon />}
    </Button>
  );
}
