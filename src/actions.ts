// Composite actions shared by the inventory list, the 3D scene and the Jarvis voice agent.
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { closePanel, commandById, openCommand, type CommandId } from "@/commands";
import { convex, errorText, run } from "@/convex";
import {
  CATEGORY_INFO,
  DEMO_SKU,
  available,
  isLow,
  type Category,
  type CategoryId,
  type FloorId,
  type ShapeOption,
  type Sku,
  type ZoneId,
} from "@/data/catalog";
import { baysNeeded, planBays, slotLabel } from "@/data/inventory";
import { SLOT_BY_ID } from "@/data/layout";
import { actorNow, getInventory, getWare, setWare, type ViewMode } from "@/store";
import { scanToReceipt } from "@/scan";
import { recordUtterance, say, stopSpeaking, transcribe } from "@/voice/voice";

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
  switchFloor(s.floor, () => focusSku(s));
}

/** Fly the map to a SKU (optionally a specific bay's floor) without opening the Details popup or speaking. */
export function showOnMap(code: string, slot?: string) {
  const sku = getInventory().byCode.get(code);
  if (!sku) return;
  const at = slot ? SLOT_BY_ID.get(slot) : undefined;
  switchFloor(at?.floor ?? sku.floor, () =>
    setWare({ selected: sku.sku, zone: at?.zone ?? sku.zone, zoomMul: 1, openCat: sku.category.id, hoverBay: null, panelOpen: false }),
  );
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

// ── Jarvis (chat + voice) ─────────────────────────────────────────────────
// One conversation for typing, "/" commands and voice. Voice on: listen → think → speak → listen.
// Jarvis only reads, navigates, opens panels and requests quotes; people click approve / post / collect.

let session = 0;
let lineId = 0;
let recording: { stop: () => void } | null = null;
const forceOffline = typeof location !== "undefined" && new URLSearchParams(location.search).get("ai") === "0";

export const voiceInputSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const voiceOn = () => {
  const s = getWare();
  return s.agentOpen && !s.muted;
};

function pushLine(who: "ai" | "user", text: string, traces?: string[]) {
  setWare((s) => ({ transcript: [...s.transcript, { id: ++lineId, who, text, ...(traces?.length ? { traces } : {}) }].slice(-40) }));
}

export function speak(text: string, traces?: string[]) {
  const my = session;
  pushLine("ai", text, traces);
  if (!voiceOn() || !getWare().settings.voiceReplies) {
    setWare({ orb: voiceOn() ? "listening" : "idle" });
    if (voiceOn()) void listen();
    return;
  }
  setWare({ orb: "speaking" });
  void say(text, getWare().lang).then(() => {
    if (my !== session || getWare().orb !== "speaking") return;
    setWare({ orb: voiceOn() ? "listening" : "idle" });
    void listen();
  });
}

async function listen() {
  const s = getWare();
  if (!voiceOn() || s.orb !== "listening" || recording || !voiceInputSupported()) return;
  const my = session;
  const rec = recordUtterance({ lang: s.lang, maxMs: 12_000, silenceMs: 1100 });
  recording = rec;
  const u = await rec.done;
  recording = null;
  if (my !== session || !voiceOn()) return;
  if (u.denied) {
    setWare({ micError: "Microphone blocked", muted: true, orb: "idle" });
    return;
  }
  if (!u.blob && !u.browserText) {
    later(() => void listen(), 200);
    return;
  }
  setWare({ orb: "thinking", interim: "…" });
  const t = await transcribe(u, getWare().lang);
  if (my !== session) return;
  setWare({ interim: "" });
  if (!t.text) {
    setWare({ orb: "listening" });
    later(() => void listen(), 200);
    return;
  }
  void runCommand(t.text);
}

function stopListening() {
  recording?.stop();
  recording = null;
}

/** Open the Jarvis chat. `voice` starts listening; `draft` pre-fills the input (e.g. "/"). */
export function openAgent(opts: { voice?: boolean; draft?: string } = {}) {
  const voice = opts.voice ?? false;
  setWare((s) => ({
    agentOpen: true,
    panelOpen: false,
    micError: null,
    muted: !voice,
    orb: voice ? "listening" : s.orb === "listening" ? "idle" : s.orb,
    ...(opts.draft != null ? { chatDraft: opts.draft, chatFocus: s.chatFocus + 1 } : {}),
  }));
  if (voice) void listen();
}

export function closeAgent() {
  session++;
  stopListening();
  stopSpeaking();
  setWare({ agentOpen: false, orb: "idle", interim: "", muted: true });
}

/** Mic button: voice on (listen + spoken replies) or off (typing only). */
export function toggleMute() {
  const muted = !getWare().muted;
  setWare({ muted, micError: null });
  if (muted) {
    session++;
    stopListening();
    stopSpeaking();
    setWare({ orb: "idle", interim: "" });
  } else {
    setWare({ orb: "listening" });
    void listen();
  }
}

type JarvisReply = FunctionReturnType<typeof api.ai.jarvisAsk>;

/** Apply what Jarvis asked the screen to do; returns the lines shown under its reply. */
function applyEffects(effects: JarvisReply["effects"]): string[] {
  const traces: string[] = [];
  for (const e of effects) {
    if (e.type === "run_command") {
      if (e.command === "close") {
        closePanel();
        traces.push("Back to the map");
      } else {
        openCommand(e.command);
        traces.push(`Opened ${commandById(e.command)?.label ?? e.command}`);
      }
    } else if (e.type === "open_deal") {
      setWare({ detail: { kind: "deal", id: e.deal_id } });
      showOnMap(e.sku_code);
      traces.push("Opened the deal");
    } else if (e.type === "show_on_map") {
      showOnMap(e.sku_code);
      traces.push(`Map → ${e.sku_code}`);
    }
  }
  return [...new Set(traces)];
}

/** "/ageing" etc. typed in the chat: open the panel directly, no AI needed. */
function slashCommand(text: string) {
  const id = text.slice(1).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (id === "close" || id === "map") {
    closePanel();
    speak("Back to the map.", ["Back to the map"]);
    return;
  }
  const cmd = commandById(id);
  if (!cmd || !cmd.roles.includes(getWare().role)) {
    speak(`No ${text.split(/\s+/)[0]} command for you.`);
    return;
  }
  openCommand(cmd.id);
  speak(`${cmd.label} is open.`, [`Opened ${cmd.label}`]);
}

/** Scanner in the chat: a delivery-note photo / PDF becomes a receipt that AI reads for staff to verify. */
export async function scanNote(file: File) {
  ++session;
  pushLine("user", file.type === "application/pdf" ? `Scanned ${file.name}` : "Scanned a delivery note");
  setWare({ orb: "thinking" });
  const r = await scanToReceipt(file);
  if (!r.ok) {
    speak(r.error);
    return;
  }
  speak("Reading the note now. Check the lines, count the goods, then post.", ["Created a receipt", "Opened Receive"]);
}

/** Runs a typed, tapped or spoken request. Claude first; offline keyword rules if it is unavailable. */
export async function runCommand(text: string) {
  const t = text.trim();
  if (!t) return;
  const my = ++session;
  stopListening();
  stopSpeaking();
  setWare({ agentOpen: true, interim: "" });
  pushLine("user", t);
  if (t.startsWith("/")) {
    slashCommand(t);
    return;
  }
  setWare({ orb: "thinking" });
  if (!forceOffline) {
    const s = getWare();
    try {
      const r = await Promise.race([
        convex.action(api.ai.jarvisAsk, {
          actor: actorNow(),
          text: t,
          context: { stage: s.stage, selected: s.selected, dealId: s.detail?.kind === "deal" ? s.detail.id : null },
        }),
        new Promise<null>((res) => setTimeout(() => res(null), 25_000)),
      ]);
      if (my !== session) return;
      if (r && !r.unavailable) {
        speak(r.reply || "Done.", applyEffects(r.effects));
        return;
      }
    } catch {
      // fall through to offline rules
    }
  }
  if (my === session) answerOffline(t.toLowerCase());
}

const CATEGORY_WORDS: [RegExp, CategoryId][] = [
  [/sofa|couch|沙发/, "sofas"],
  [/table|desk|桌/, "tables"],
  [/chair|stool|椅/, "chairs"],
  [/wardrobe|cabinet|衣柜|柜/, "wardrobes"],
  [/\bbeds?\b|床/, "beds"],
];

const COMMAND_WORDS: [RegExp, CommandId, string, string][] = [
  [/quote|lalamove|运费|报价|送货/, "delivery", "Delivery quotes are open.", "运费报价已打开。"],
  [/approv|审核|批准/, "approve", "Approvals are open.", "待审核已打开。"],
  [/collect|pick ?up|出货|发货|提货/, "collect", "Collections are open.", "待取货已打开。"],
  [/receiv|delivery note|入库|收货/, "receive", "Receiving is open.", "收货已打开。"],
  [/\bag(e|ed|eing|ing)\b|old stock|unsold|attention|旧货|清货|卖不出/, "ageing", "Here is the ageing stock.", "这些是长期未卖的旧货。"],
  [/reorder|replenish|restock|purchase|进货|补货/, "replenish", "Here are the reorder suggestions.", "这是补货建议。"],
  [/\bdeals?\b|buyer|offer|买家/, "deals", "Here are the deals.", "这是销售跟进。"],
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

function answerOffline(q: string) {
  const s = getWare();
  const inv = getInventory();
  const selected = s.selected ? (inv.byCode.get(s.selected) ?? null) : null;
  const mentioned: Category | null = (() => {
    const hit = CATEGORY_WORDS.find(([re]) => re.test(q));
    return hit ? (inv.categories.find((c) => c.id === hit[1]) ?? null) : null;
  })();

  const command = COMMAND_WORDS.find(([re]) => re.test(q));
  if (command) {
    openCommand(command[1]);
    speak(/[\u4e00-\u9fff]/.test(q) ? command[3] : command[2], [`Opened ${commandById(command[1])?.label}`]);
    return;
  }

  if (/\b(move|transfer|relocate)\b/.test(q)) {
    speak("Moving stock needs an authorised confirmation in the receiving flow. Nothing has been changed.");
    return;
  }

  if (/low|running out|缺货/.test(q)) {
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

  if (/analy|today|report|summary|今天/.test(q)) {
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const today = (s.ledger?.movements ?? []).filter((m) => m.at >= dayStart);
    const sum = (kind: string) => today.filter((m) => m.kind === kind).reduce((a, m) => a + m.qty, 0);
    const pending = (s.ledger?.receipts ?? []).filter((r) => r.status === "needs_review").length;
    speak(
      `Today: +${sum("receive")} received, −${sum("dispatch")} dispatched.${pending ? ` ${pending} delivery ${pending === 1 ? "note is" : "notes are"} still awaiting verification.` : ""}`,
    );
    return;
  }

  if (/how many|left|count|available|多少/.test(q)) {
    if (selected) {
      speak(
        `${selected.model.name} ${selected.variant}: ${selected.onHand} on hand, ${selected.reserved} reserved, ${available(selected)} available, ${selected.incoming} incoming.`,
      );
    } else {
      speak("Which model? Say “take me to” and a model name, or pick one from the list.");
    }
    return;
  }

  const ranked = inv.skus
    .map((x) => ({ x, score: scoreSku(x, q) }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score);
  let hit = ranked[0]?.x ?? null;
  if (ranked.length > 1 && ranked[1]!.score === ranked[0]!.score) {
    const options = ranked.filter((r) => r.score === ranked[0]!.score).slice(0, 3);
    speak(`I found ${options.length} matches: ${options.map((r) => `${r.x.model.name} ${r.x.variant}`).join(", ")}. Which one?`);
    return;
  }
  if (!hit && mentioned) hit = mentioned.skus[0] ?? null;
  if (!hit && /sofa/.test(q)) hit = inv.byCode.get(DEMO_SKU) ?? null;

  if (hit) {
    const target = hit;
    switchFloor(target.floor, () => {
      focusSku(target);
      speak(locateReply(target), [`Map → ${target.sku}`]);
    });
    return;
  }

  speak("Type / for commands, or ask me where something is.");
}

// ── Stock ledger ──────────────────────────────────────────────────────────
// Every change is a role-checked Convex mutation; the map updates from the live snapshot.

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

/** Warehouse adds a model the catalogue doesn't have and places the counted units. */
export async function receiveNewModel(input: NewModelInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const code = await convex.mutation(api.receiving.createModel, {
      actor: actorNow(),
      category: input.category,
      kind: input.shape.kind,
      cap: capFor(input.category, input.shape),
      doors: input.shape.doors ?? 2,
      model: input.model,
      variant: input.variant,
      color: input.color,
      code: input.sku,
      units: input.onHand,
    });
    setWare({ query: "", receiveOpen: false });
    toast.success(`${input.model} · ${input.variant}`, { description: `${input.onHand} units placed` });
    // The snapshot arrives a moment later; focus the new model when it does.
    const t = setInterval(() => {
      const sku = getInventory().byCode.get(code);
      if (sku) {
        clearInterval(t);
        selectSku(sku);
      }
    }, 150);
    setTimeout(() => clearInterval(t), 4000);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** Owner: restore the synthetic demo ledger. */
export async function resetDemo() {
  await run(convex.mutation(api.seed.reset, { actor: actorNow() }), "Demo data reset");
  setWare({ selected: null, zone: null, hoverBay: null, panelOpen: false, detail: null });
}
