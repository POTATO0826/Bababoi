import type { FunctionReturnType } from "convex/server";
import { create } from "zustand";
import type { api } from "@convex/_generated/api";
import type { CategoryId, FloorId, SkuRecord, ZoneId } from "@/data/catalog";
import { deriveInventory } from "@/data/inventory";
import type { Role } from "@/domain/types";

export type ViewMode = "iso" | "top";
export type OrbState = "idle" | "listening" | "thinking" | "speaking";
/** What the left column shows. "inventory" is the default; the rest open from the command palette or Jarvis. */
export type Stage = "inventory" | "receive" | "ageing" | "deals" | "delivery" | "approve" | "collect" | "replenish";
export type Lang = "auto" | "en" | "zh";
export type Snapshot = NonNullable<FunctionReturnType<typeof api.ledger.snapshot>>;
export type Detail = { kind: "deal" | "receipt" | "batch"; id: string } | null;

export interface TranscriptLine {
  id: number;
  who: "ai" | "user";
  text: string;
  /** What Jarvis did on screen for this reply ("Opened Ageing"). */
  traces?: string[];
}

export interface Settings {
  autoSpin: boolean;
  voiceReplies: boolean;
  lowStockThreshold: number;
  showEmptyBays: boolean;
}

export const PEOPLE: Record<Role, string> = { owner: "Owner", sales: "Sales", warehouse: "Warehouse" };

export interface StaffProfile {
  _id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface WareState {
  /** Per-SKU records derived from the Convex batch ledger (see <LedgerSync/>). Read-only mirror. */
  skus: SkuRecord[];
  /** The latest Convex snapshot (null until loaded). */
  ledger: Snapshot | null;
  ledgerReady: boolean;

  role: Role;
  staff: StaffProfile | null;
  stage: Stage;
  detail: Detail;
  /** Text to put in the Jarvis input (e.g. "/" from the keyboard shortcut), and a tick to focus it. */
  chatDraft: string;
  chatFocus: number;
  /** Speech language hint; "auto" lets Fish detect English vs Mandarin. */
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
  /** Voice off: Jarvis neither listens nor speaks (typed chat only). */
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

  role: "warehouse",
  staff: null,
  stage: "inventory",
  detail: null,
  chatDraft: "",
  chatFocus: 0,
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
  muted: true,
  interim: "",
  orb: "idle",
  transcript: [],
  micError: null,

  settings: readSettings(),
}));

export const setWare = useWare.setState;
export const getWare = useWare.getState;

/** The authenticated server profile is the only source of staff identity in the UI. */
export function setIdentity(staff: StaffProfile | null) {
  setWare((s) => ({
    staff,
    role: staff?.role ?? "warehouse",
    ...(s.staff?._id !== staff?._id || s.staff?.role !== staff?.role || !staff
      ? { transcript: [], detail: null, stage: "inventory" as Stage, ledger: null, ledgerReady: false, skus: [], selected: null, agentOpen: false, receiveOpen: false }
      : {}),
  }));
}

/** Legacy actor argument for existing mutations; server authorization ignores it. */
export const actorNow = () => {
  const staff = getWare().staff;
  if (!staff) throw new Error("Sign in as active staff to continue");
  return { role: staff.role, name: staff.name };
};

/** Derived inventory for the current ledger (memoised). */
export const getInventory = () => deriveInventory(getWare().skus);
export function useInventory() {
  return deriveInventory(useWare((s) => s.skus));
}
