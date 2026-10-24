import { MicIcon, SquareIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/convex";
import { Button } from "@/components/ui/button";
import { localDemo } from "@/identity";
import { recordUtterance, transcribe } from "@/voice/voice";
import { voiceNoteEvidence, type VoiceNoteResult } from "@/voice/voice-note";
import { useWare } from "@/store";

/** Dictate a receiving note: records audio, keeps the recording as evidence, adds a transcript when one is available. */
export function DictateButton({ onEvidence, upload, disabled = false }: {
  onEvidence: (evidence: Exclude<VoiceNoteResult, { error: string }>) => void | Promise<void>;
  upload: (blob: Blob) => Promise<import("@convex/_generated/dataModel").Id<"_storage">>;
  disabled?: boolean;
}) {
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
      const result = await voiceNoteEvidence(audio, {
        upload,
        transcript: async (u) => (await transcribe(u, lang, { browserOnly: localDemo })).text,
      });
      if ("error" in result) { toast.error(result.error); return; }
      if (result.warning) toast.warning(result.warning);
      await onEvidence(result);
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
      title={state === "rec" ? "Stop recording" : "Voice note (recording is kept; Chrome adds a live transcript when online)"}
      aria-label={state === "rec" ? "Stop recording" : "Record a voice note"}
      disabled={disabled || state === "busy"}
      onClick={() => (state === "rec" ? stop.current?.() : void start())}
      className={state === "rec" ? "text-dispatch" : undefined}
    >
      {state === "rec" ? <SquareIcon /> : <MicIcon />}
    </Button>
  );
}
