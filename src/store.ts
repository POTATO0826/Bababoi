import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { CategoryId, FloorId, SkuRecord, ZoneId } from "@/data/catalog";
import { deriveInventory, seedRecords } from "@/data/inventory";

export type ViewMode = "iso" | "top";
export type OrbState = "idle" | "listening" | "thinking" | "speaking";

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

export interface WareState {
  /** The stock ledger — the source of truth. Persisted. */
  skus: SkuRecord[];

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
  /** "Receive new model" dialog. */
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

function readSettings(): Settings {
  const p = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const flag = (k: string, d: boolean) => (p.has(k) ? p.get(k) !== "0" && p.get(k) !== "false" : d);
  const threshold = Number(p.get("lowStockThreshold"));
  return {
    autoSpin: flag("autoSpin", false),
    voiceReplies: flag("voiceReplies", true),
    lowStockThreshold: Number.isFinite(threshold) && p.has("lowStockThreshold") ? threshold : 4,
    showEmptyBays: flag("showEmptyBays", true),
  };
}

/** localStorage that never throws (private windows, blocked site data). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // storage full or blocked — the session still works in memory
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

export const useWare = create<WareState>()(
  persist(
    (): WareState => ({
      skus: seedRecords(),

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
    }),
    {
      name: "wareorb-ledger",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ skus: s.skus }),
    },
  ),
);

export const setWare = useWare.setState;
export const getWare = useWare.getState;

/** Derived inventory for the current ledger (memoised). */
export const getInventory = () => deriveInventory(getWare().skus);
export function useInventory() {
  return deriveInventory(useWare((s) => s.skus));
}

/** Restore the seed ledger (drops received models and recorded movements). */
export function resetLedger() {
  setWare({ skus: seedRecords(), selected: null, zone: null, hoverBay: null, panelOpen: false });
}
