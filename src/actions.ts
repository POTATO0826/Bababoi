// Composite actions shared by the inventory list, the 3D scene and the Jarvis voice agent.
// Products are looked up by stable SKU code in the current persisted snapshot (never by object identity).
import { api } from "@/lib/api";
import {
  available,
  focusOf,
  isLow,
  productsOnFloor,
  skuTitle,
  spokenLocations,
  zoneCategories,
  type CategoryView,
  type Inventory,
  type ProductView,
} from "@/lib/inventory";
import { getInventory, getServerData, refreshSnapshot } from "@/server-data";
import type { CategoryId, DailyActivity, FloorId, ZoneId } from "@/shared/contracts";
import { localTime } from "@/shared/time";
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
export const lowNow = (p: ProductView) => isLow(p, threshold());

// ── Navigation ────────────────────────────────────────────────────────────

/** Fade the scene out (260 ms), swap the floor, fade back in. Clears zone and selection. */
export function switchFloor(floor: FloorId, after?: () => void) {
  if (getWare().floor === floor) {
    after?.();
    return;
  }
  setWare({ fading: true, hoverBay: null });
  later(() => {
    setWare({ floor, fading: false, zone: null, selected: null, focusBay: null, zoomMul: 1 });
    after?.();
  }, 260);
}

export function zoomZone(zone: ZoneId) {
  const inv = getInventory();
  // A zone may hold several categories now; open the one with the most bays there.
  const cat = inv ? zoneCategories(inv, getWare().floor, zone)[0] : undefined;
  setWare((s) => ({ zone, zoomMul: 1, hoverBay: null, openCat: cat ? cat.id : s.openCat }));
}

/** Back / "View whole warehouse" / "Main Warehouse" crumb. */
export function backToOverview() {
  setWare({ zone: null, selected: null, focusBay: null, zoomMul: 1, hoverBay: null });
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
  setWare({ selected: null, focusBay: null, hoverBay: null, panelOpen: false });
}

interface FocusAt {
  floor: FloorId;
  zone: ZoneId;
  bayId?: string;
}

function focusSku(p: ProductView, at: FocusAt) {
  setWare((st) => ({
    selected: p.sku,
    focusBay: at.bayId ?? null,
    zone: at.zone,
    zoomMul: 1,
    openCat: p.categoryId,
    hoverBay: null,
    panelOpen: !st.agentOpen,
  }));
}

/**
 * Select a SKU. From a list it focuses the SKU's first actual position; from a bay click it keeps
 * that bay's floor and zone.
 */
export function selectSku(sku: string, at?: FocusAt) {
  const p = getInventory()?.bySku.get(sku);
  if (!p) return;
  const where = at ?? focusOf(p);
  switchFloor(where.floor, () => {
    focusSku(p, where);
    speak(`${p.modelName} ${p.variant} (${p.sku}): ${p.onHand} on hand, ${p.reserved} reserved, ${available(p)} available.`, ledgerMeta());
  });
}

/** Click a category row: expand it and zoom to where its first stocked SKU actually is, or collapse it. */
export function toggleCategory(id: CategoryId) {
  const st = getWare();
  if (st.query.trim()) return;
  if (st.openCat === id) {
    setWare({ openCat: null });
    return;
  }
  const cat = getInventory()?.categories.find((c) => c.id === id);
  const first = cat?.skus.find((p) => p.locations.length) ?? cat?.skus[0];
  if (!first) {
    setWare({ openCat: id });
    return;
  }
  const at = focusOf(first);
  switchFloor(at.floor, () => setWare({ openCat: id, zone: at.zone, zoomMul: 1, hoverBay: null }));
}

// ── Receiving review ──────────────────────────────────────────────────────

/** Open the receiving drawer on one draft, or on the list of pending drafts. */
export function openReceiving(id: string | null = null) {
  setWare({ receivingOpen: true, receivingId: id, hoverBay: null });
}

export function closeReceiving() {
  setWare({ receivingOpen: false, receivingId: null });
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

function pushLine(who: "ai" | "user", text: string, meta?: string) {
  setWare((s) => ({ transcript: [...s.transcript, { who, text, meta }].slice(-12) }));
}

/** Provenance for a factual reply: which ledger revision and when it was read. */
function ledgerMeta(inv: Inventory | null = getInventory()) {
  if (!inv) return undefined;
  const { stale, syncedAt } = getServerData();
  const at = localTime(syncedAt ?? inv.asOf, inv.warehouse.timezone);
  return `${stale ? "Stale · last synced" : "Ledger rev " + inv.revision + " · as of"} ${at}`;
}

export function speak(text: string, meta?: string) {
  cancel(speakTimer);
  setWare({ orb: "speaking" });
  pushLine("ai", text, meta);
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

function scoreSku(p: ProductView, q: string) {
  const words = `${p.modelName} ${p.variant} ${p.sku}`
    .toLowerCase()
    .split(/[\s·-]+/)
    .filter((w) => w.length > 2);
  return new Set(words.filter((w) => q.includes(w))).size;
}

function locateReply(p: ProductView) {
  return `Found ${p.sku} on ${spokenLocations(p)}. ${p.onHand} on hand, ${p.reserved} reserved, ${available(p)} available.`;
}

/** Re-reads the ledger before a factual answer. Falls back to the last snapshot only with an explicit stale label. */
async function freshInventory(): Promise<Inventory | null> {
  const { inventory } = await refreshSnapshot();
  return inventory;
}

async function todayReply(inv: Inventory): Promise<string> {
  const res = await api<DailyActivity>("GET", "/activity");
  const d = res.data;
  const parts: string[] = [];
  if (d.receivedUnits) {
    const notes = d.receipts.map((r) => `${r.documentRef ?? "a manual receipt"} at ${localTime(r.postedAt, d.timezone)} by ${r.actorName}`);
    parts.push(`+${d.receivedUnits} ${d.receivedUnits === 1 ? "unit" : "units"} received and posted (${notes.join("; ")})`);
  } else parts.push("No receipts posted today");
  parts.push(d.dispatchedUnits ? `−${d.dispatchedUnits} dispatched` : "no dispatches recorded");
  const pending = inv.pending;
  const tail = pending.length
    ? ` ${pending.length} receiving ${pending.length === 1 ? "draft is" : "drafts are"} awaiting verification (${pending
        .map((r) => `${r.documentRef ?? "manual"}, ${r.totalQuantity} units`)
        .join("; ")}); ${pending.length === 1 ? "its units are" : "their units are"} not in physical stock yet.`
    : " Nothing is awaiting verification.";
  return `Today: ${parts.join(", ")}.${tail}`;
}

async function answer(q: string) {
  if (/\b(move|transfer|relocate)\b/.test(q)) {
    speak("I can preview a transfer, but moving stock needs an authorised confirmation in the receiving flow. Nothing has been changed.");
    return;
  }

  const inv = await freshInventory();
  if (!inv) {
    speak("I can't reach the stock ledger right now, so I won't guess any counts.");
    return;
  }
  const meta = ledgerMeta(inv);
  const s = getWare();
  const selected = s.selected ? inv.bySku.get(s.selected) ?? null : null;
  const mentioned: CategoryView | null = (() => {
    const hit = CATEGORY_WORDS.find(([re]) => re.test(q));
    return hit ? inv.categories.find((c) => c.id === hit[1]) ?? null : null;
  })();

  if (/low|reorder|running out/.test(q)) {
    const pool = mentioned ? mentioned.skus : productsOnFloor(inv, s.floor);
    const lows = pool.filter(lowNow);
    const where = mentioned ? `${mentioned.name}` : `Floor ${s.floor}`;
    setWare({ selected: null, focusBay: null, zone: null, zoomMul: 1 });
    speak(
      lows.length
        ? `${lows.length} ${lows.length === 1 ? "SKU" : "SKUs"} in ${where} ${lows.length === 1 ? "is" : "are"} at or below the threshold: ${lows
            .map((x) => `${x.modelName} ${x.variant} (${available(x)} left)`)
            .join(", ")}.`
        : `No low-stock SKUs in ${where}.`,
      meta,
    );
    return;
  }

  if (/analy|today|change|report|summary/.test(q)) {
    try {
      speak(await todayReply(inv), meta);
    } catch {
      speak("I can't read today's activity from the ledger right now.");
    }
    return;
  }

  if (/how many|left|count|available/.test(q)) {
    if (selected) {
      speak(
        `${selected.modelName} ${selected.variant}: ${selected.onHand} on hand, ${selected.reserved} reserved, ${available(selected)} available, ${selected.incoming} incoming.`,
        meta,
      );
    } else {
      speak("Which model? Say “take me to” and a model name, or pick one from the list.");
    }
    return;
  }

  const ranked = inv.products
    .map((x) => ({ x, score: scoreSku(x, q) }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score);
  let hit = ranked[0]?.x ?? null;
  if (ranked.length > 1 && ranked[1]!.score === ranked[0]!.score) {
    const options = ranked.filter((r) => r.score === ranked[0]!.score).slice(0, 3);
    speak(`I found ${options.length} matches: ${options.map((r) => skuTitle(r.x)).join(", ")}. Which one?`);
    return;
  }
  if (!hit && /sofa/.test(q)) hit = inv.categories.find((c) => c.id === "sofas")?.skus[0] ?? null;

  if (hit) {
    const target = hit;
    const at = focusOf(target);
    switchFloor(at.floor, () => {
      focusSku(target, at);
      speak(locateReply(target), meta);
    });
    return;
  }

  speak("I can locate a model, read its counts from the ledger, list low-stock SKUs or summarise today’s posted movements.");
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
    stepTimer = later(() => void answer(q), 900);
  }, 600);
}
