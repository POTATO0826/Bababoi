// Fish Audio voice endpoints. The browser falls back to its own speech when these return 501 (no key) or fail.
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const preflight = httpAction(async () => new Response(null, { status: 204, headers: cors }));

/** Text → speech (mp3). Fish auto-detects English / Mandarin per chunk. */
http.route({
  path: "/voice/tts",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    await ctx.runQuery(internal.access.actionViewer, {});
    if (!env.FISH_API_KEY) return json({ error: "Voice is off (no FISH_API_KEY)" }, 501);
    const body: unknown = await req.json().catch(() => null);
    const text = typeof (body as { text?: unknown } | null)?.text === "string" ? (body as { text: string }).text.trim() : "";
    if (!text || text.length > 600) return json({ error: "Text must be 1–600 characters" }, 400);
    if (!(await ctx.runMutation(internal.quotes.takeSlot, { name: "fish" })).ok) return json({ error: "Busy" }, 429);
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        // Explicit model: an unknown or missing header silently bills the paid model.
        model: env.FISH_TTS_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify({
        text,
        ...(env.FISH_VOICE_ID ? { reference_id: env.FISH_VOICE_ID } : {}),
        format: "mp3",
        mp3_bitrate: 64,
        latency: "balanced",
        chunk_length: 200,
        normalize: true,
      }),
    });
    if (!res.ok || !res.body) {
      console.log("fish tts failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return json({ error: `Fish TTS ${res.status}` }, 502);
    }
    return new Response(res.body, { status: 200, headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  }),
});
http.route({ path: "/voice/tts", method: "OPTIONS", handler: preflight });

/** Speech → text. Body is the recorded audio (browser webm/opus is accepted by transcribe-1-pro). */
http.route({
  path: "/voice/asr",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    await ctx.runQuery(internal.access.actionViewer, {});
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang");
    const keep = url.searchParams.get("keep") === "1";
    const audio = await req.blob();
    if (!audio.size || audio.size > 10 * 1024 * 1024) return json({ error: "Audio must be 1 byte – 10 MB" }, 400);
    // Receiving dictation keeps the original audio as evidence, linked to the draft.
    const storageId = keep ? await ctx.storage.store(audio) : undefined;
    if (!env.FISH_API_KEY) return json({ error: "Voice is off (no FISH_API_KEY)", storageId }, 501);
    if (!(await ctx.runMutation(internal.quotes.takeSlot, { name: "fish" })).ok) return json({ error: "Busy", storageId }, 429);
    const form = new FormData();
    form.append("audio", audio, audio.type.includes("ogg") ? "speech.ogg" : audio.type.includes("mp4") ? "speech.m4a" : "speech.webm");
    if (lang === "en" || lang === "zh") form.append("language", lang);
    form.append("ignore_timestamps", "true");
    form.append("tag_audio_events", "false");
    const res = await fetch("https://api.fish.audio/v1/asr", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.FISH_API_KEY}`, model: "transcribe-1-pro" },
      body: form,
    });
    if (!res.ok) {
      console.log("fish asr failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return json({ error: `Fish ASR ${res.status}`, storageId }, 502);
    }
    const out = (await res.json().catch(() => ({}))) as { text?: string; language_code?: string };
    const text = (out.text ?? "")
      .replace(/<\|speaker:\d+\|>/g, " ")
      .replace(/\[[^\]]{1,20}\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return json({ text, lang: out.language_code ?? null, storageId });
  }),
});
http.route({ path: "/voice/asr", method: "OPTIONS", handler: preflight });

export default http;
