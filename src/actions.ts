// Composite actions shared by the inventory list, the 3D scene and the Jarvis voice agent.
import {
  CATEGORIES,
  DEMO_SKU,
  PENDING_NOTE,
  SKUS,
  SKU_BY_CODE,
  available,
  isLow,
  zoneCategory,
  type Category,
  type CategoryId,
  type FloorId,
  type Sku,
  type ZoneId,
} from "@/data/catalog";
import { codesFor } from "@/data/layout";
import { getWare, setWare, type ViewMode } from "@/store";

const timers = new Set<ReturnType<typeof setTimeout>>();
function later(fn: () => void, ms: number) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
  return t;
}
function cancel(t: ReturnType<typeof setTimeout> | null) {
  if (t) {
    clearTimeout(t);
    timers.delete(t);
  }
}

const threshold = () => getWare().settings.lowStockThreshold;
export const lowNow = (s: Sku) => isLow(s, threshold());

// ── Navigation ────────────────────────────────────────────────────────────

/** Fade the scene out (260 ms), swap the floor, fade back in. Clears zone and selection. */
export function switchFloor(floor: FloorId, after?: () => void) {
  if (getWare().floor === floor) {
    after?.();
    return;
  }
  setWare({ fading: true, hoverBay: null });
  later(() => {
    setWare({ floor, fading: false, zone: null, selected: null, zoomMul: 1 });
    after?.();
  }, 260);
}

export function zoomZone(zone: ZoneId) {
  const cat = zoneCategory(getWare().floor, zone);
  setWare((s) => ({ zone, zoomMul: 1, hoverBay: null, openCat: cat ? cat.id : s.openCat }));
}

/** Back / "View whole warehouse" / "Main Warehouse" crumb. */
export function backToOverview() {
  setWare({ zone: null, selected: null, zoomMul: 1, hoverBay: null });
}

/** Esc keeps the selection; it only pulls the camera back out. */
export function escapeZone() {
  setWare({ zone: null, zoomMul: 1, hoverBay: null });
}

export function resetCamera() {
  setWare({ zoomMul: 1, theta: 0, zone: null, hoverBay: null });
}

export function setView(view: ViewMode) {
  setWare({ view, hoverBay: null });
}

export function clearSelection() {
  setWare({ selected: null, hoverBay: null, panelOpen: false });
}

function focusSku(s: Sku) {
  setWare((st) => ({
    selected: s.sku,
    zone: s.zone,
    zoomMul: 1,
    openCat: s.category.id,
    hoverBay: null,
    panelOpen: !st.agentOpen,
  }));
}

export function selectSku(s: Sku) {
  switchFloor(s.floor, () => {
    focusSku(s);
    speak(`${s.model.name} ${s.variant} (${s.sku}): ${s.onHand} on hand, ${s.reserved} reserved, ${available(s)} available.`);
  });
}

/** Click a category row: expand it and zoom to its first SKU's zone, or collapse it. */
export function toggleCategory(id: CategoryId) {
  const st = getWare();
  if (st.query.trim()) return;
  if (st.openCat === id) {
    setWare({ openCat: null });
    return;
  }
  const first = CATEGORIES.find((c) => c.id === id)!.skus[0]!;
  switchFloor(first.floor, () => setWare({ openCat: id, zone: first.zone, zoomMul: 1, hoverBay: null }));
}

// ── Jarvis voice agent ────────────────────────────────────────────────────
// Listening → thinking (900 ms) → speaking → listening. Uses the browser Web Speech API;
// swap in your STT/TTS or a realtime voice provider in production.

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export const voiceInputSupported = () => recognitionCtor() !== null;

let rec: SpeechRecognitionLike | null = null;
let speakTimer: ReturnType<typeof setTimeout> | null = null;
let stepTimer: ReturnType<typeof setTimeout> | null = null;

function pushLine(who: "ai" | "user", text: string) {
  setWare((s) => ({ transcript: [...s.transcript, { who, text }].slice(-12) }));
}

export function speak(text: string) {
  cancel(speakTimer);
  setWare({ orb: "speaking" });
  pushLine("ai", text);
  const done = () => {
    if (getWare().orb !== "speaking") return;
    setWare({ orb: getWare().agentOpen ? "listening" : "idle" });
    startRec();
  };
  const { agentOpen, settings } = getWare();
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (synth && agentOpen && settings.voiceReplies) {
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
      speakTimer = later(done, 15000);
      return;
    } catch {
      // fall through to the timed reply
    }
  }
  speakTimer = later(done, 3200);
}

function startRec() {
  const s = getWare();
  if (!s.agentOpen || s.muted || s.orb !== "listening" || rec) return;
  const SR = recognitionCtor();
  if (!SR) return;
  try {
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (ev) => {
      let text = "";
      let final = false;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]!;
        text += res[0].transcript;
        if (res.isFinal) final = true;
      }
      if (final) {
        stopRec();
        runCommand(text.trim());
      } else setWare({ interim: text });
    };
    r.onend = () => {
      rec = null;
      const now = getWare();
      if (now.agentOpen && !now.muted && now.orb === "listening") later(startRec, 300);
    };
    r.onerror = (ev) => {
      rec = null;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setWare({ micError: "Microphone blocked — tap a suggestion below instead." });
      }
    };
    rec = r;
    r.start();
  } catch {
    rec = null;
  }
}

function stopRec() {
  if (!rec) return;
  try {
    rec.onend = null;
    rec.abort();
  } catch {
    // already stopped
  }
  rec = null;
}

export function openAgent() {
  if (getWare().agentOpen) return;
  setWare({
    agentOpen: true,
    panelOpen: false,
    orb: "listening",
    interim: "",
    micError: null,
    transcript: [{ who: "ai", text: "I’m listening. Ask where something is or how many are left." }],
  });
  startRec();
}

export function closeAgent() {
  stopRec();
  cancel(speakTimer);
  cancel(stepTimer);
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // no synthesis available
  }
  setWare({ agentOpen: false, orb: "idle", interim: "" });
}

export function toggleMute() {
  const muted = !getWare().muted;
  setWare({ muted });
  if (muted) stopRec();
  else startRec();
}

const CATEGORY_WORDS: [RegExp, CategoryId][] = [
  [/sofa|couch/, "sofas"],
  [/table|desk/, "tables"],
  [/chair|stool/, "chairs"],
  [/wardrobe|cabinet/, "wardrobes"],
  [/\bbeds?\b/, "beds"],
];

function scoreSku(s: Sku, q: string) {
  const words = `${s.model.name} ${s.variant} ${s.sku}`
    .toLowerCase()
    .split(/[\s·-]+/)
    .filter((w) => w.length > 2);
  return new Set(words.filter((w) => q.includes(w))).size;
}

function locateReply(s: Sku) {
  const codes = codesFor(s);
  const span = codes.length > 1 ? `bays ${codes[0]!.code} to ${codes[codes.length - 1]!.code}` : `bay ${codes[0]?.code ?? "—"}`;
  return `Found ${s.sku} on Floor ${s.floor}, ${span}. ${s.onHand} on hand, ${s.reserved} reserved, ${available(s)} available.`;
}

function answer(q: string) {
  const s = getWare();
  const selected = s.selected ? SKU_BY_CODE.get(s.selected) ?? null : null;
  const mentioned: Category | null = (() => {
    const hit = CATEGORY_WORDS.find(([re]) => re.test(q));
    return hit ? CATEGORIES.find((c) => c.id === hit[1])! : null;
  })();

  if (/\b(move|transfer|relocate)\b/.test(q)) {
    speak("I can preview a transfer, but moving stock needs an authorised confirmation in the receiving flow. Nothing has been changed.");
    return;
  }

  if (/low|reorder|running out/.test(q)) {
    const lows = SKUS.filter((x) => (mentioned ? x.category === mentioned : x.floor === s.floor) && lowNow(x));
    const where = mentioned ? `${mentioned.name}` : `Floor ${s.floor}`;
    setWare({ selected: null, zone: null, zoomMul: 1 });
    speak(
      lows.length
        ? `${lows.length} ${lows.length === 1 ? "SKU" : "SKUs"} in ${where} ${lows.length === 1 ? "is" : "are"} at or below the threshold: ${lows
            .map((x) => `${x.model.name} ${x.variant} (${available(x)} left)`)
            .join(", ")}.`
        : `No low-stock SKUs in ${where}.`,
    );
    return;
  }

  if (/analy|today|change|report|summary/.test(q)) {
    speak(
      `Today: +4 units received (${PENDING_NOTE.id}, verified 09:12), −1 dispatched, 2 new reservations. One supplier note is still pending, so its ${PENDING_NOTE.qty} units are not in physical stock yet.`,
    );
    return;
  }

  if (/how many|left|count|available/.test(q)) {
    if (selected) {
      speak(
        `${selected.model.name} ${selected.variant}: ${selected.onHand} on hand, ${selected.reserved} reserved, ${available(selected)} available, ${selected.incoming} incoming.`,
      );
    } else {
      speak("Which model? Say “take me to” and a model name, or pick one from the list.");
    }
    return;
  }

  const ranked = SKUS.map((x) => ({ x, score: scoreSku(x, q) }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score);
  let hit = ranked[0]?.x ?? null;
  if (ranked.length > 1 && ranked[1]!.score === ranked[0]!.score) {
    const options = ranked.filter((r) => r.score === ranked[0]!.score).slice(0, 3);
    speak(`I found ${options.length} matches: ${options.map((r) => `${r.x.model.name} ${r.x.variant}`).join(", ")}. Which one?`);
    return;
  }
  if (!hit && /sofa/.test(q)) hit = SKU_BY_CODE.get(DEMO_SKU) ?? null;

  if (hit) {
    const target = hit;
    switchFloor(target.floor, () => {
      focusSku(target);
      speak(locateReply(target));
    });
    return;
  }

  speak("I can locate a model, read its verified counts, list low-stock SKUs or analyze today’s movements.");
}

/** Runs a spoken (or tapped) command. The agent never invents counts or changes stock silently. */
export function runCommand(text: string) {
  if (!text || getWare().orb === "thinking") return;
  cancel(speakTimer);
  cancel(stepTimer);
  stopRec();
  const q = text.toLowerCase();
  setWare({ orb: "listening", agentOpen: true, panelOpen: false, interim: "" });
  pushLine("user", `“${text}”`);
  stepTimer = later(() => {
    setWare({ orb: "thinking" });
    stepTimer = later(() => answer(q), 900);
  }, 600);
}
