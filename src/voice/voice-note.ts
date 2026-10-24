// A receiving voice note: the original recording is the evidence; the transcript is optional.
import type { Id } from "@convex/_generated/dataModel";
import type { Utterance } from "./voice";

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;

export type VoiceNoteResult =
  | { kind: "voice"; storageId: Id<"_storage">; mime: string; text?: string; warning?: string }
  | { kind: "note"; text: string; warning: string }
  | { error: string };

/** "audio/webm;codecs=opus" → "audio/webm" (the server compares base types). */
export const audioBaseType = (t: string) => t.split(";")[0]!.trim().toLowerCase() || "audio/webm";

export const NO_TRANSCRIPT_HINT = "No transcript: live transcription uses Chrome's built-in speech recognition, which needs Chrome, microphone access and an internet connection. The recording is kept; listen to it and enter the counted lines, or add a typed note.";

/**
 * Turn one recording into receipt evidence. Uploads the recording (via `upload`) and attaches any
 * transcript; never drops a valid recording because transcription failed.
 */
export async function voiceNoteEvidence(
  u: Utterance,
  deps: { upload(blob: Blob): Promise<Id<"_storage">>; transcript(u: Utterance): Promise<string> },
): Promise<VoiceNoteResult> {
  if (u.denied) return { error: "Microphone access was refused. Allow the microphone for this site (Chrome: the icon in the address bar), or add a typed note." };
  const text = (await deps.transcript(u).catch(() => "")).trim();
  if (u.blob && u.blob.size > 0) {
    if (u.blob.size > MAX_VOICE_BYTES) {
      return text ? { kind: "note", text: `Voice transcript (recording over 10 MB, not kept): ${text}`, warning: "The recording was too long to keep; its transcript was saved as a typed note." } : { error: "The recording is over 10 MB. Record a shorter note." };
    }
    try {
      const storageId = await deps.upload(u.blob);
      return { kind: "voice", storageId, mime: audioBaseType(u.blob.type), ...(text ? { text } : { warning: NO_TRANSCRIPT_HINT }) };
    } catch {
      if (text) return { kind: "note", text: `Voice transcript (recording could not be saved): ${text}`, warning: "The recording could not be uploaded; its transcript was saved as a typed note." };
      return { error: "The recording could not be uploaded. Check the connection to the local backend and try again." };
    }
  }
  if (text) return { kind: "note", text: `Voice transcript (no recording captured): ${text}`, warning: "No audio was captured; the transcript was saved as a typed note." };
  return { error: "Nothing was recorded. Speak after pressing the microphone, or add a typed note." };
}
