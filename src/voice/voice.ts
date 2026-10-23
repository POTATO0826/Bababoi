// Voice in/out. Fish Audio via Convex HTTP actions (keys stay on the server); the browser's own speech is the fallback.
import type { Id } from "@convex/_generated/dataModel";
import { convexSiteUrl } from "@/convex";
import type { Lang } from "@/store";

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function recognition(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const browserLang = (lang: Lang) => (lang === "zh" ? "zh-CN" : "en-US");

export interface Utterance {
  blob: Blob | null;
  /** What the browser recogniser heard in parallel (fallback when Fish is unavailable). */
  browserText: string;
  /** Microphone permission was refused. */
  denied?: boolean;
}

/**
 * Record one utterance. Stops on `stop()`, after `silenceMs` of quiet once speech started, or at `maxMs`.
 * The browser recogniser runs alongside so there is always a transcript to fall back on.
 */
export function recordUtterance(opts: { maxMs?: number; silenceMs?: number; lang?: Lang } = {}): { stop: () => void; done: Promise<Utterance> } {
  const { maxMs = 15_000, silenceMs = 1200, lang = "auto" } = opts;
  let stopFn = () => {};
  const done = (async (): Promise<Utterance> => {
    let stream: MediaStream | null = null;
    let browserText = "";
    const SR = recognition();
    const rec = SR ? new SR() : null;
    if (rec) {
      rec.lang = browserLang(lang);
      rec.interimResults = false;
      rec.continuous = true;
      rec.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i]!.isFinal) browserText += ev.results[i]![0].transcript + " ";
      };
      rec.onerror = () => {};
      try {
        rec.start();
      } catch {
        // already running elsewhere
      }
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // No microphone access: only the browser recogniser (if any) can help, and it needs the mic too.
      rec?.stop();
      return { blob: null, browserText: "", denied: true };
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ended = new Promise<void>((r) => (mr.onstop = () => r()));
    mr.start(250);

    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let heard = false;
    let quietSince = performance.now();
    const started = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (mr.state !== "inactive") mr.stop();
    };
    stopFn = finish;
    const tick = () => {
      if (finished) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms > 0.02) {
        heard = true;
        quietSince = now;
      }
      if ((heard && now - quietSince > silenceMs) || now - started > maxMs) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    await ended;
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    rec?.stop();
    await new Promise((r) => setTimeout(r, 400)); // let the recogniser flush its last result
    return { blob: heard && chunks.length ? new Blob(chunks, { type: mr.mimeType || "audio/webm" }) : null, browserText: browserText.trim() };
  })();
  return { stop: () => stopFn(), done };
}

/** Speech → text: Fish ASR on the server; the browser's transcript if Fish is unavailable. */
export async function transcribe(u: Utterance, lang: Lang, opts: { keep?: boolean } = {}): Promise<{ text: string; storageId?: Id<"_storage">; via: "fish" | "browser" }> {
  if (u.blob) {
    try {
      const q = new URLSearchParams({ lang, ...(opts.keep ? { keep: "1" } : {}) });
      const res = await fetch(`${convexSiteUrl}/voice/asr?${q}`, { method: "POST", headers: { "Content-Type": u.blob.type }, body: u.blob });
      if (res.ok) {
        const j = (await res.json()) as { text?: string; storageId?: Id<"_storage"> };
        if (j.text?.trim()) return { text: j.text.trim(), storageId: j.storageId, via: "fish" };
      }
    } catch {
      // fall back below
    }
  }
  return { text: u.browserText, via: "browser" };
}

let audio: HTMLAudioElement | null = null;

/** Text → speech: Fish TTS (natural, EN + 中文); the browser's voice if Fish is unavailable. Resolves when done. */
export async function say(text: string, lang: Lang): Promise<void> {
  stopSpeaking();
  try {
    const res = await fetch(`${convexSiteUrl}/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && res.headers.get("Content-Type")?.startsWith("audio/")) {
      const url = URL.createObjectURL(await res.blob());
      audio = new Audio(url);
      await new Promise<void>((resolve) => {
        audio!.onended = audio!.onerror = () => resolve();
        void audio!.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
      return;
    }
  } catch {
    // fall back below
  }
  await browserSay(text, lang);
}

function browserSay(text: string, lang: Lang) {
  return new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const zh = lang === "zh" || /[一-鿿]/.test(text);
    u.lang = zh ? "zh-CN" : "en-US";
    u.rate = 1.05;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
    setTimeout(resolve, 20_000);
  });
}

export function stopSpeaking() {
  audio?.pause();
  audio = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // no synthesis
  }
}
