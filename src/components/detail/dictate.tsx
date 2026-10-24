import { MicIcon, SquareIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/convex";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { recordUtterance, transcribe } from "@/voice/voice";
import { useWare } from "@/store";

/** Dictate a receiving note: records audio, transcribes (Fish, else the browser), returns text + stored audio. */
export function DictateButton({ onText, disabled = false }: { onText: (text: string, storageId?: Id<"_storage">) => void | Promise<void>; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const stop = useRef<(() => void) | null>(null);
  const lang = useWare((s) => s.lang);

  const start = async () => {
    setState("rec");
    try {
      const rec = recordUtterance({ maxMs: 60_000, silenceMs: 2500, lang });
      stop.current = rec.stop;
      const audio = await rec.done;
      setState("busy");
      const r = await transcribe(audio, lang, { keep: true });
      if (r.text.trim() || r.storageId) await onText(r.text.trim(), r.storageId);
      else toast.error(audio.denied ? "Microphone access was refused" : "No recording or transcript was captured. Try again or enter a counted line manually.");
    } catch (e) {
      toast.error(errorText(e));
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
      disabled={disabled || state === "busy"}
      onClick={() => (state === "rec" ? stop.current?.() : void start())}
      className={state === "rec" ? "text-dispatch" : undefined}
    >
      {state === "rec" ? <SquareIcon /> : <MicIcon />}
    </Button>
  );
}
