import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { setAuthTokenProvider } from "../auth-token";

mock.module("../convex", () => ({ convexSiteUrl: "https://voice-test.convex.site" }));
const { transcribe } = await import("./voice");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setAuthTokenProvider(null);
});

describe("receiving voice evidence when transcription is unavailable", () => {
  for (const status of [501, 429, 502]) {
    test(`keeps stored audio and browser transcript after HTTP ${status}`, async () => {
      setAuthTokenProvider(async () => "unit-test-token");
      globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "Transcription unavailable", storageId: "saved-audio" as Id<"_storage"> }), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
      const result = await transcribe({ blob: new Blob(["audio"], { type: "audio/webm" }), browserText: "  Four chairs received  " }, "en", { keep: true });
      expect(result).toEqual({ text: "Four chairs received", storageId: "saved-audio" as Id<"_storage">, via: "browser" });
    });
  }

  test("keeps the recording when neither recogniser has a transcript", async () => {
    setAuthTokenProvider(async () => "unit-test-token");
    globalThis.fetch = mock(async () => Response.json({ text: "", storageId: "saved-original-audio" as Id<"_storage"> })) as unknown as typeof fetch;
    const result = await transcribe({ blob: new Blob(["audio"], { type: "audio/webm" }), browserText: "" }, "auto", { keep: true });
    expect(result).toEqual({ text: "", storageId: "saved-original-audio" as Id<"_storage">, via: "browser" });
  });

  test("returns provider text and the retained original recording when available", async () => {
    setAuthTokenProvider(async () => "unit-test-token");
    globalThis.fetch = mock(async () => Response.json({ text: " Six sofas ", storageId: "saved-original-audio" as Id<"_storage"> })) as unknown as typeof fetch;
    const result = await transcribe({ blob: new Blob(["audio"], { type: "audio/webm" }), browserText: "browser fallback" }, "en", { keep: true });
    expect(result).toEqual({ text: "Six sofas", storageId: "saved-original-audio" as Id<"_storage">, via: "fish" });
  });

  test("does not upload audio without authentication", async () => {
    const request = mock(async () => Response.json({}));
    globalThis.fetch = request as unknown as typeof fetch;
    const result = await transcribe({ blob: new Blob(["audio"], { type: "audio/webm" }), browserText: "offline transcript" }, "en", { keep: true });
    expect(result).toEqual({ text: "offline transcript", via: "browser" });
    expect(request).not.toHaveBeenCalled();
  });
});
