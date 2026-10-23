// Composite actions shared by the inventory list, the 3D scene and the Jarvis voice agent.
import { toast } from "sonner";
import {
  CATEGORY_INFO,
  DEMO_SKU,
  PENDING_NOTE,
  available,
  isLow,
  skuTitle,
  type Category,
  type CategoryId,
  type FloorId,
  type Movement,
  type ShapeOption,
  type Sku,
  type SkuRecord,
  type ZoneId,
} from "@/data/catalog";
import { baysNeeded, planBays, slotLabel } from "@/data/inventory";
import { SLOT_BY_ID } from "@/data/layout";
import { getInventory, getWare, setWare, type ViewMode } from "@/store";

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
  const cat = getInventory().zoneCategory(getWare().floor, zone);
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
  const first = getInventory().categories.find((c) => c.id === id)?.skus[0];
  if (!first) {
    setWare({ openCat: id });
    return;
  }
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
  const codes = getInventory().codesFor(s);
  const span = codes.length > 1 ? `bays ${codes[0]!.code} to ${codes[codes.length - 1]!.code}` : `bay ${codes[0]?.code ?? "—"}`;
  return `Found ${s.sku} on Floor ${s.floor}, ${span}. ${s.onHand} on hand, ${s.reserved} reserved, ${available(s)} available.`;
}

function answer(q: string) {
  const s = getWare();
  const inv = getInventory();
  const selected = s.selected ? (inv.byCode.get(s.selected) ?? null) : null;
  const mentioned: Category | null = (() => {
    const hit = CATEGORY_WORDS.find(([re]) => re.test(q));
    return hit ? (inv.categories.find((c) => c.id === hit[1]) ?? null) : null;
  })();

  if (/new arrival|what'?s new|newest|new model/.test(q)) {
    const fresh = inv.newArrivals;
    speak(
      fresh.length
        ? `${fresh.length} new ${fresh.length === 1 ? "model" : "models"}: ${fresh
            .slice(0, 4)
            .map((x) => `${x.model.name} ${x.variant}, ${x.onHand} on hand in ${inv.locationText(x).split(" · ").slice(0, 2).join(" ")}`)
            .join("; ")}.`
        : "No new models have been received yet.",
    );
    return;
  }

  if (/\b(move|transfer|relocate)\b/.test(q)) {
    speak("I can preview a transfer, but moving stock needs an authorised confirmation in the receiving flow. Nothing has been changed.");
    return;
  }

  if (/low|reorder|running out/.test(q)) {
    const lows = inv.skus.filter((x) => (mentioned ? x.category === mentioned : x.floor === s.floor) && lowNow(x));
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

  const ranked = inv.skus.map((x) => ({ x, score: scoreSku(x, q) }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score);
  let hit = ranked[0]?.x ?? null;
  if (ranked.length > 1 && ranked[1]!.score === ranked[0]!.score) {
    const options = ranked.filter((r) => r.score === ranked[0]!.score).slice(0, 3);
    speak(`I found ${options.length} matches: ${options.map((r) => `${r.x.model.name} ${r.x.variant}`).join(", ")}. Which one?`);
    return;
  }
  if (!hit && /sofa/.test(q)) hit = inv.byCode.get(DEMO_SKU) ?? null;

  if (hit) {
    const target = hit;
    switchFloor(target.floor, () => {
      focusSku(target);
      speak(locateReply(target));
    });
    return;
  }

  speak("I can locate a model, read its verified counts, list low-stock SKUs, list new arrivals or analyze today’s movements.");
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

// ── Stock ledger: new models, movements, out-of-stock removal ─────────────
// People confirm every change (the AI never edits stock); each change is logged on the SKU.

const nowLabel = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

function updateRecord(code: string, fn: (r: SkuRecord) => SkuRecord | null) {
  setWare((st) => ({
    skus: st.skus.flatMap((r) => {
      if (r.sku !== code) return [r];
      const next = fn(r);
      return next ? [next] : [];
    }),
  }));
}

/** Floor/zone of a record follow its first bay. */
function withBays(r: SkuRecord, bays: string[]): SkuRecord {
  const first = SLOT_BY_ID.get(bays[0] ?? "");
  return first ? { ...r, bays, floor: first.floor, zone: first.zone } : { ...r, bays };
}

const logMovement = (r: SkuRecord, m: Omit<Movement, "t">): Movement[] => [{ t: nowLabel(), ...m }, ...(r.movements ?? [])].slice(0, 12);

export interface NewModelInput {
  category: CategoryId;
  shape: ShapeOption;
  model: string;
  variant: string;
  color: string;
  sku: string;
  onHand: number;
  incoming: number;
}

export function skuPrefix(category: CategoryId, shape: ShapeOption) {
  return shape.prefix ?? CATEGORY_INFO.find((c) => c.id === category)!.prefix;
}

export function capFor(category: CategoryId, shape: ShapeOption) {
  return shape.cap ?? CATEGORY_INFO.find((c) => c.id === category)!.cap;
}

/** Where a delivery would go right now (free bays, preferring the category's zones). */
export function previewPlacement(category: CategoryId, shape: ShapeOption, units: number) {
  const records = getWare().skus;
  const need = baysNeeded(units, capFor(category, shape));
  const bays = planBays(records, category, need);
  return { need, bays, label: slotLabel(bays), fits: bays.length >= need };
}

export function receiveNewModel(input: NewModelInput): { ok: true } | { ok: false; error: string } {
  const st = getWare();
  const code = input.sku.trim().toUpperCase();
  if (st.skus.some((r) => r.sku === code && r.onHand > 0)) return { ok: false, error: `${code} already exists.` };
  const cap = capFor(input.category, input.shape);
  const place = previewPlacement(input.category, input.shape, input.onHand);
  if (!place.fits) {
    return { ok: false, error: `Not enough free bays: needs ${place.need}, ${place.bays.length} free.` };
  }
  const record = withBays(
    {
      sku: code,
      variant: input.variant.trim(),
      color: input.color,
      floor: 1,
      zone: "A",
      onHand: input.onHand,
      reserved: 0,
      incoming: input.incoming,
      category: input.category,
      model: input.model.trim(),
      kind: input.shape.kind,
      cap,
      doors: input.shape.doors ?? 2,
      bays: [],
      addedAt: Date.now(),
      iconStatus: "pending",
      movements: [{ t: nowLabel(), text: "Received · new model", d: `+${input.onHand}` }],
    },
    place.bays,
  );
  // Drop any earlier out-of-stock row with the same code, then add.
  setWare((s) => ({ skus: [...s.skus.filter((r) => r.sku !== code), record], query: "", receiveOpen: false }));

  const sku = getInventory().byCode.get(code)!;
  toast.success(`${skuTitle(sku)} added`, { description: `${input.onHand} units placed at ${place.label}` });
  selectSku(sku);
  void requestIcon(code);
  return { ok: true };
}

/** Ask the server to have Claude draw an icon for the model. Falls back to the swatch when unavailable. */
export async function requestIcon(code: string) {
  const r = getWare().skus.find((x) => x.sku === code);
  if (!r) return;
  updateRecord(code, (x) => ({ ...x, iconStatus: "pending" }));
  const category = CATEGORY_INFO.find((c) => c.id === r.category)!.name;
  try {
    const res = await fetch("/api/icon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: r.model, variant: r.variant, category, color: r.color, kind: r.kind }),
    });
    const data = (await res.json().catch(() => ({}))) as { svg?: string; error?: string };
    if (res.ok && data.svg) {
      updateRecord(code, (x) => ({ ...x, icon: data.svg, iconStatus: "ready" }));
    } else {
      updateRecord(code, (x) => ({ ...x, iconStatus: res.status === 501 ? "unavailable" : "failed" }));
      if (res.status !== 501) toast.error("Couldn’t generate the icon", { description: data.error ?? `HTTP ${res.status}` });
    }
  } catch {
    updateRecord(code, (x) => ({ ...x, iconStatus: "failed" }));
  }
}

let resumed = false;
/** Retry icons that were mid-generation when the page was closed (once per page load). */
export function resumePendingIcons() {
  if (resumed) return;
  resumed = true;
  for (const r of getWare().skus) if (r.iconStatus === "pending") void requestIcon(r.sku);
}

/** Dispatch (stock leaves) or receive (stock arrives) units of an existing SKU. */
export function recordMovement(code: string, type: "dispatch" | "receive", qty: number): { ok: true } | { ok: false; error: string } {
  const st = getWare();
  const r = st.skus.find((x) => x.sku === code);
  if (!r || qty <= 0) return { ok: false, error: "Nothing to record." };

  if (type === "dispatch") {
    if (qty > r.onHand) return { ok: false, error: `Only ${r.onHand} on hand.` };
    const onHand = r.onHand - qty;
    if (onHand === 0) {
      removeOutOfStock(r);
      return { ok: true };
    }
    updateRecord(code, (x) => ({
      ...withBays(x, x.bays.slice(0, baysNeeded(onHand, x.cap))),
      onHand,
      reserved: x.reserved - Math.min(qty, x.reserved), // dispatch fulfils bookings first
      movements: logMovement(x, { text: "Dispatched · confirmed by J. Lim", d: `−${qty}` }),
    }));
    toast(`Dispatched ${qty} × ${r.model} · ${r.variant}`, { description: `${onHand} left on hand` });
    return { ok: true };
  }

  const onHand = r.onHand + qty;
  const extra = baysNeeded(onHand, r.cap) - r.bays.length;
  const added = extra > 0 ? planBays(st.skus, r.category, extra, { floor: r.floor, zone: r.zone }) : [];
  if (added.length < extra) return { ok: false, error: `No free bay for ${qty} more units (${added.length} of ${extra} bays free).` };
  updateRecord(code, (x) => ({
    ...withBays(x, [...x.bays, ...added]),
    onHand,
    incoming: x.incoming - Math.min(qty, x.incoming), // receiving fulfils open orders first
    movements: logMovement(x, { text: "Received · count confirmed by J. Lim", d: `+${qty}` }),
  }));
  toast.success(`Received ${qty} × ${r.model} · ${r.variant}`, { description: `${onHand} on hand` });
  return { ok: true };
}

/** Out of stock: the SKU, its icon and its 3D units leave the map and the list; its bays become free. */
function removeOutOfStock(r: SkuRecord) {
  const st = getWare();
  const wasSelected = st.selected === r.sku;
  setWare((s) => ({
    skus: s.skus.filter((x) => x.sku !== r.sku),
    ...(wasSelected ? { selected: null, panelOpen: false } : {}),
    hoverBay: null,
  }));
  toast(`${r.model} · ${r.variant} is out of stock`, {
    description: `Removed from the list and the map · ${r.bays.length} ${r.bays.length === 1 ? "bay" : "bays"} freed`,
  });
}
