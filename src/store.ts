import { create } from "zustand";
import type { CategoryId, FloorId, ZoneId } from "@/data/catalog";

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

export const useWare = create<WareState>()(() => ({
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
