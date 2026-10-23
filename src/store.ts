import type { FunctionReturnType } from "convex/server";
import { create } from "zustand";
import type { api } from "@convex/_generated/api";
import type { CategoryId, FloorId, SkuRecord, ZoneId } from "@/data/catalog";
import { deriveInventory } from "@/data/inventory";
import type { Actor, Role } from "@/domain/types";

export type ViewMode = "iso" | "top";
export type OrbState = "idle" | "listening" | "thinking" | "speaking";
/** What the left column shows. "inventory" is the default; the rest open from the command palette or Jarvis. */
export type Stage = "inventory" | "receive" | "ageing" | "deals" | "delivery" | "approve" | "collect" | "replenish";
export type Lang = "auto" | "en" | "zh";
export type Snapshot = NonNullable<FunctionReturnType<typeof api.ledger.snapshot>>;
export type Detail = { kind: "deal" | "receipt" | "batch"; id: string } | null;

export interface TranscriptLine {
  who: "ai" | "user";
  text: string;
}

export interface Settings {
  autoSpin: boolean;
  voiceReplies: boolean;
  lowStockThreshold: number;
  showEmptyBays: boolean;
}

export const PEOPLE: Record<Role, string> = { owner: "Mei", sales: "Arif", warehouse: "J. Lim" };

export interface WareState {
  /** Per-SKU records derived from the Convex batch ledger (see <LedgerSync/>). Read-only mirror. */
  skus: SkuRecord[];
  /** The latest Convex snapshot (null until loaded). */
  ledger: Snapshot | null;
  ledgerReady: boolean;

  role: Role;
  stage: Stage;
  detail: Detail;
  paletteOpen: boolean;
  lang: Lang;

  floor: FloorId;
  view: ViewMode;
  /** Camera yaw in radians (drag to orbit). */
  theta: number;
  /** Wheel zoom multiplier, clamped 0.6–3.5. */
  zoomMul: number;
  zone: ZoneId | null;
  selected: string | null; // SKU code
  openCat: CategoryId | null;
  hoverBay: string | null;
  query: string;
  /** Details popup inside the viewport. */
  panelOpen: boolean;
  /** "New model" dialog. */
  receiveOpen: boolean;
  /** Scene fades out while the floor swaps. */
  fading: boolean;
  dragging: boolean;

  agentOpen: boolean;
  muted: boolean;
  interim: string;
  orb: OrbState;
  transcript: TranscriptLine[];
  micError: string | null;

  settings: Settings;
}

const params = () => (typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search));

function readSettings(): Settings {
  const p = params();
  const flag = (k: string, d: boolean) => (p.has(k) ? p.get(k) !== "0" && p.get(k) !== "false" : d);
  const threshold = Number(p.get("lowStockThreshold"));
  return {
    autoSpin: flag("autoSpin", false),
    voiceReplies: flag("voiceReplies", true),
    lowStockThreshold: Number.isFinite(threshold) && p.has("lowStockThreshold") ? threshold : 4,
    showEmptyBays: flag("showEmptyBays", true),
  };
}

const ROLE_KEY = "wareorb-role";
function readRole(): Role {
  const r = params().get("role") ?? (() => {
    try {
      return localStorage.getItem(ROLE_KEY);
    } catch {
      return null;
    }
  })();
  return r === "sales" || r === "warehouse" ? r : "owner";
}

// The ledger used to live in localStorage; it is now in Convex.
try {
  localStorage.removeItem("wareorb-ledger");
} catch {
  // storage blocked
}

export const useWare = create<WareState>()(() => ({
  skus: [],
  ledger: null,
  ledgerReady: false,

  role: readRole(),
  stage: "inventory",
  detail: null,
  paletteOpen: false,
  lang: "auto",

  floor: 1,
  view: "iso",
  theta: 0,
  zoomMul: 1,
  zone: null,
  selected: null,
  openCat: "sofas",
  hoverBay: null,
  query: "",
  panelOpen: false,
  receiveOpen: false,
  fading: false,
  dragging: false,

  agentOpen: false,
  muted: false,
  interim: "",
  orb: "idle",
  transcript: [{ who: "ai", text: "Ready. Ask me where something is or how many are left." }],
  micError: null,

  settings: readSettings(),
}));

export const setWare = useWare.setState;
export const getWare = useWare.getState;

export function setRole(role: Role) {
  setWare({ role });
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // storage blocked — role still applies for this tab
  }
}

/** Who is acting (simulated role), sent with every Convex write. */
export const actorNow = (): Actor => {
  const role = getWare().role;
  return { role, name: PEOPLE[role] };
};

/** Derived inventory for the current ledger (memoised). */
export const getInventory = () => deriveInventory(getWare().skus);
export function useInventory() {
  return deriveInventory(useWare((s) => s.skus));
}
