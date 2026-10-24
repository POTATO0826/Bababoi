// The 10-second film as data. 30 fps, frames 0–299. Every value is a pure function of the frame number.
import * as THREE from "three";
import type { Stage } from "@/store";
import type { Shot } from "./cam";
import { type InstMeta, type Kind, type Pose, pose } from "./anim3d";
import { clamp, drop, easeInCubic, easeInOutCubic, easeInOutQuint, easeOutCubic, easeOutQuart, lerp, prog, track, type Key } from "./ease";

export const FPS = 30;
export const FRAMES = 300;

// Ledger snapshots captured from the real app (see capture/capture-flow.mjs).
export const LEDGERS = ["L0-seed", "L1-posted", "L2a-ageing", "L2-handed", "L3-approved", "L4-collected", "L5-replenish"] as const;
type LedgerName = (typeof LEDGERS)[number];

/** Story beats (frame numbers). */
export const T = {
  // 1 · Hook
  hookEnd: 30,
  // 2 · Capture
  receiptIn: 33,
  checkClick: 49,
  postClick: 57,
  posted: 60,
  chairsLand: 63,
  chairsClick: 75,
  // 3 · Detect
  ageingOn: 86,
  sofaClick: 98,
  handClick: 120,
  handed: 122,
  // 4 · Coordinate
  quotesIn: 140,
  carrierClick: 158,
  sendClick: 167,
  // 5 · Approve & dispatch
  approvalIn: 176,
  approveClick: 188,
  approved: 190,
  collectIn: 194,
  collectClick: 204,
  leaveStart: 205,
  leaveEnd: 224,
  freed: 224,
  // 6 · Insight & brand
  replenIn: 228,
  oatClick: 239,
  brandIn: 258,
  end: 300,
} as const;

export const SKU = { chair: "CHAIR-LUMA-0410", ageing: "SOFA-HAVN-2140", reorder: "SOFA-NORDE-3301" } as const;
// Slot ids of the bays the story touches (from the app's layout).
export const BAY = { receipt: "1C20", ageA: "1A00", ageB: "1A01", dispatch: "1A00", reorderA: "1A13", reorderB: "1A14" } as const;
/** World centres (m) of those bays, from src/data/layout.ts bayRect(). */
export const P = {
  receipt: [7.8, 0.45, 55.8] as [number, number, number],
  ageA: [7.8, 0.45, 13.8] as [number, number, number],
  ageB: [14.7, 0.45, 13.8] as [number, number, number],
  reorderA: [28.5, 0.45, 20.8] as [number, number, number],
  reorderB: [35.4, 0.45, 20.8] as [number, number, number],
  inbound: [33, 0.5, 4.2] as [number, number, number],
  outDoor: [67, 0.2, 0.2] as [number, number, number],
};

export function sceneState(f: number): { ledger: LedgerName; stage: Stage; selected: string | null } {
  if (f < T.chairsLand) return { ledger: "L0-seed", stage: "receive", selected: null };
  if (f < T.ageingOn) return { ledger: "L1-posted", stage: "receive", selected: f >= T.chairsClick ? SKU.chair : null };
  if (f < T.handed) return { ledger: "L2a-ageing", stage: "ageing", selected: f >= T.sofaClick ? SKU.ageing : null };
  if (f < T.approved) return { ledger: "L2-handed", stage: "deals", selected: null };
  if (f < T.freed) return { ledger: "L3-approved", stage: "collect", selected: null };
  if (f < T.replenIn) return { ledger: "L4-collected", stage: "collect", selected: null };
  return { ledger: "L5-replenish", stage: "replenish", selected: f >= T.oatClick && f < T.brandIn - 2 ? SKU.reorder : null };
}

// ── Camera ────────────────────────────────────────────────────────────────
type ShotKey = Key<number[]>; // [fx, fy, fz, sx, sy, logZoom]
const S = (f: number, focus: [number, number, number], sx: number, sy: number, zoom: number, e?: (t: number) => number): ShotKey => ({
  f,
  v: [...focus, sx, sy, Math.log(zoom)],
  e,
});

const OVER: [number, number, number] = [50, 0, 36];
const SHOTS: ShotKey[] = [
  // Hook: the floor assembles; a slow push-in
  S(0, OVER, 960, 610, 12.4),
  S(30, OVER, 980, 600, 14.4, easeOutCubic),
  // Capture: inbound dock and C-3-01 on the left two-thirds, receipt on the right
  S(44, [21, 0, 31], 700, 610, 17.2, easeInOutCubic),
  S(74, [20, 0, 32], 690, 615, 17.8, easeInOutCubic),
  // product click #1 — punch in on the posted chairs, then out
  S(82, P.receipt, 760, 600, 58, easeInOutQuint),
  S(85, P.receipt, 760, 600, 60),
  // Detect: travel across the racks to zone A
  S(97, [12, 0.3, 14.5], 780, 560, 30, easeInOutCubic),
  // product click #2 — punch in on the ageing sofa batch
  S(105, P.ageA, 690, 560, 64, easeInOutQuint),
  S(121, P.ageA, 690, 566, 66),
  // out, over the outbound dock: the delivery route leaves from its door
  S(134, P.outDoor, 760, 790, 17, easeInOutQuint),
  S(172, P.outDoor, 752, 786, 17.4, easeInOutCubic),
  // Approve & dispatch: A-1-01 → walkway → outbound dock, framed right of the approval cards
  S(188, P.ageA, 640, 372, 21, easeInOutCubic),
  // approved → push in on the reserved bay; the collected units leave frame toward the dock
  S(203, P.ageA, 820, 600, 31, easeInOutCubic),
  S(226, P.ageA, 800, 590, 32, easeInOutCubic),
  // Insight: back to zone A, then product click #3 on the 3-seater
  S(237, [30, 0.3, 18], 900, 620, 27, easeInOutCubic),
  S(246, P.reorderA, 980, 600, 60, easeInOutQuint),
  S(253, P.reorderA, 980, 604, 61),
  // Brand: pull back to the whole floor, low in frame under the logo
  S(282, OVER, 960, 842, 9.8, easeInOutQuint),
  S(300, OVER, 960, 846, 9.6, easeOutCubic),
];

export function shotAt(f: number): Shot {
  const v = track(SHOTS, f);
  return { focus: [v[0]!, v[1]!, v[2]!], sx: v[3]!, sy: v[4]!, zoom: Math.exp(v[5]!) };
}

/** Kept for the camera API; the product-click zooms are camera moves, so the view offset stays at 1. */
export function clickAt(_f: number) {
  return { z: 1, px: 960, py: 540 };
}

/** Film look per frame (tilt-shift focus band follows the subject; tighter at close-ups). */
export function lookAt(f: number) {
  const close = (a: number, b: number, c: number, d: number) => prog(f, a, b) * (1 - prog(f, c, d));
  const k = Math.max(close(T.chairsClick, 82, 86, 95), close(T.sofaClick, 105, T.handed, 132), close(T.oatClick, 246, 253, 266));
  return {
    focusY: lerp(0.47, 0.44, k),
    band: lerp(0.24, 0.12, k),
    blur: lerp(2.0, 4.2, k),
    vignette: 0.36,
    dim: 0.42 * easeInOutCubic(prog(f, 262, 282)),
  };
}

// ── Story motion on specific units ──────────────────────────────────────────
const V = new THREE.Vector3();
export function eventPose(f: number, m: InstMeta, kind: Kind): Pose | null {
  if (kind === "rack") return null;
  // Delivery DN-2291: the wrapped units in the inbound dock lift away when the receipt is posted
  if (m.owner === "pending" && f >= T.posted - 1) {
    const t = prog(f, T.posted - 1, T.chairsLand);
    const e = easeInCubic(t);
    if (kind === "blob") return pose(0, 1, 1 - e, t < 1);
    return pose(e * 1.6, 1 - 0.85 * e, 1 - 0.85 * e, t < 1);
  }
  // Posted stock lands in C-3-01 with a little weight
  if (m.owner === BAY.receipt && f >= T.chairsLand && f < T.chairsLand + 20) {
    const t0 = T.chairsLand + m.j * 4;
    const r = drop(f - t0, 5, 5, 0.18, 9);
    if (kind === "blob") return pose(0, 1, r.visible ? lerp(0.35, 1, 1 - r.dy / 5) : 0, r.visible);
    return pose(r.dy, r.sy, r.sxz, r.visible);
  }
  // Confirmed collection: the two units in A-1-01 lift, travel to the outbound dock and leave
  if (m.owner === BAY.dispatch && f >= T.leaveStart - 2 && f < T.freed) {
    if (kind === "blob") return pose(0, 1, 1 - easeOutCubic(prog(f, T.leaveStart, T.leaveStart + 4)), true);
    const p = dispatchPath(f, m);
    return pose(p.y, p.sy, p.sxz, p.visible, p.dx, p.dz);
  }
  return null;
}

/** Path from A-1-01 down to the walkway, along it to the outbound dock, and out through the door. */
export function dispatchPath(f: number, m: { pos: THREE.Vector3 }) {
  const start = new THREE.Vector3(m.pos.x, 0, m.pos.z);
  const lane = m.pos.x - 7.8;
  const pts = [start, new THREE.Vector3(m.pos.x, 0, 9.2), new THREE.Vector3(66 + lane, 0, 9.2), new THREE.Vector3(66 + lane, 0, -3)];
  const lens = [pts[0]!.distanceTo(pts[1]!), pts[1]!.distanceTo(pts[2]!), pts[2]!.distanceTo(pts[3]!)];
  const total = lens.reduce((a, b) => a + b, 0);
  const pre = prog(f, T.leaveStart - 2, T.leaveStart);
  const lift = easeOutCubic(prog(f, T.leaveStart, T.leaveStart + 4));
  const travel = easeInOutCubic(prog(f, T.leaveStart + 2, T.leaveEnd - 1));
  let d = travel * total;
  let i = 0;
  while (i < 2 && d > lens[i]!) d -= lens[i++]!;
  V.copy(pts[i]!).lerp(pts[i + 1]!, lens[i]! ? d / lens[i]! : 0);
  const squash = pre < 1 ? 1 - 0.08 * Math.sin(pre * Math.PI) : 1;
  const exit = prog(f, T.leaveEnd - 4, T.leaveEnd);
  return {
    dx: V.x - start.x,
    dz: V.z - start.z,
    y: lift * 0.9 * (1 - exit) + Math.sin(travel * Math.PI) * 0.25,
    sy: squash * (1 - exit),
    sxz: (1 + (1 - squash) * 0.5) * (1 - exit),
    visible: exit < 1,
    world: new THREE.Vector3(V.x, 0.9, V.z),
  };
}

export { clamp, prog, easeOutCubic, easeOutQuart, easeInOutCubic, lerp };
