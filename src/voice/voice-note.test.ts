import { describe, expect, mock, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { NO_TRANSCRIPT_HINT, voiceNoteEvidence } from "./voice-note";

const audio = (size = 5, type = "audio/webm;codecs=opus") => new Blob([new Uint8Array(size)], { type });
const stored = "kg2-recording" as Id<"_storage">;

describe("receiving voice note evidence", () => {
  test("recording + transcript → voice evidence with both", async () => {
    const upload = mock(async () => stored);
    expect(await voiceNoteEvidence({ blob: audio(), browserText: "" }, { upload, transcript: async () => " Two chairs, ten kilograms each " })).toEqual({ kind: "voice", storageId: stored, mime: "audio/webm", text: "Two chairs, ten kilograms each" });
    expect(upload).toHaveBeenCalledTimes(1);
  });
  test("recording without transcript is kept, with the Chrome/microphone/network explanation", async () => {
    expect(await voiceNoteEvidence({ blob: audio(5, "audio/mp4"), browserText: "" }, { upload: async () => stored, transcript: async () => "" })).toEqual({ kind: "voice", storageId: stored, mime: "audio/mp4", warning: NO_TRANSCRIPT_HINT });
    expect(NO_TRANSCRIPT_HINT).toMatch(/Chrome.*microphone.*internet/);
  });
  test("transcription failure never drops a valid recording", async () => {
    expect(await voiceNoteEvidence({ blob: audio(), browserText: "" }, { upload: async () => stored, transcript: async () => { throw new Error("speech service down"); } })).toMatchObject({ kind: "voice", storageId: stored });
  });
  test("upload failure keeps a transcript as a labelled typed note, else reports the error", async () => {
    const fail = async () => { throw new Error("offline"); };
    expect(await voiceNoteEvidence({ blob: audio(), browserText: "" }, { upload: fail, transcript: async () => "4 sofas" })).toEqual({ kind: "note", text: "Voice transcript (recording could not be saved): 4 sofas", warning: expect.any(String) });
    expect(await voiceNoteEvidence({ blob: audio(), browserText: "" }, { upload: fail, transcript: async () => "" })).toEqual({ error: expect.stringContaining("could not be uploaded") });
  });
  test("no audio, denied microphone and oversize recordings", async () => {
    const upload = mock(async () => stored);
    expect(await voiceNoteEvidence({ blob: null, browserText: "x" }, { upload, transcript: async () => "3 lamps" })).toMatchObject({ kind: "note", text: "Voice transcript (no recording captured): 3 lamps" });
    expect(await voiceNoteEvidence({ blob: null, browserText: "" }, { upload, transcript: async () => "" })).toEqual({ error: expect.stringContaining("Nothing was recorded") });
    expect(await voiceNoteEvidence({ blob: null, browserText: "", denied: true }, { upload, transcript: async () => "" })).toEqual({ error: expect.stringContaining("Microphone access was refused") });
    expect(await voiceNoteEvidence({ blob: audio(10 * 1024 * 1024 + 1), browserText: "" }, { upload, transcript: async () => "" })).toEqual({ error: expect.stringContaining("over 10 MB") });
    expect(upload).not.toHaveBeenCalled();
  });
});
