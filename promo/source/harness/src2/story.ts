// "One line" — the WareOrb film as data. 30 fps, frames 0–299, beats every 15 frames (120 BPM).
// A single unbroken line is the ledger trail of one batch's journey. It draws the WareOrb mark, opens into
// the real warehouse twin, checks a delivery in, stores it, spots ageing stock, carries it out to a buyer,
// is approved, frees the bay, explains a reorder — and is pulled back into the mark.
import * as THREE from "three";
import type { Stage } from "@/store";
import { drop, easeInCubic, easeInOutCubic, easeInOutQuint, easeInOutSine, easeOutCubic, lerp, prog, track, type Key } from "../src/ease";
import { pose, type InstMeta, type Kind, type Pose } from "../src/anim3d";
import { buildWarp, resample, type Seg } from "./line";
import { toPlane, type Cam, type UV, type W3 } from "./plane";

export const BEAT = 15;

export const C = {
  blue: "#4F8BEA",
  blueLight: "#8db1f3",
  violet: "#a78bfa",
  teal: "#2dd4bf",
  green: "#22c55e",
};

export const LEDGERS = ["L0-seed", "L1-posted", "L2a-ageing", "L2-handed", "L3-approved", "L4-collected", "L5-replenish"] as const;
type LedgerName = (typeof LEDGERS)[number];

export const SKU = { chair: "CHAIR-LUMA-0410", ageing: "SOFA-HAVN-2140", reorder: "SOFA-NORDE-3301" } as const;
export const BAY = { receipt: "1C20", dispatch: "1A00" } as const;

/** Key moments (frames). */
export const T = {
  markDone: 12,
  morph0: 12,
  morph1: 26,
  twinOpen: 22,
  dockClose: 42,
  noteClose: 54,
  tick: 60,
  posted: 62,
  chairsLand: 76,
  ageLock: 104,
  ageCardIn: 118,
  handoff: 128,
  pin: 143,
  lowest: 168,
  approved: 190,
  leaveStart: 202,
  leaveEnd: 218,
  freed: 219,
  reorderClose: 234,
  pull: 254,
  markClose: 266,
} as const;

export function sceneState(f: number): { ledger: LedgerName; stage: Stage; selected: string | null } {
  if (f < 74) return { ledger: "L0-seed", stage: "receive", selected: null };
  if (f < 96) return { ledger: "L1-posted", stage: "receive", selected: f >= 80 ? SKU.chair : null };
  if (f < T.handoff) return { ledger: "L2a-ageing", stage: "ageing", selected: f >= 104 && f < 122 ? SKU.ageing : null };
  if (f < T.approved) return { ledger: "L2-handed", stage: "deals", selected: null };
  if (f < T.freed) return { ledger: "L3-approved", stage: "collect", selected: null };
  if (f < 226) return { ledger: "L4-collected", stage: "collect", selected: null };
  return { ledger: "L5-replenish", stage: "replenish", selected: f >= 232 && f < 250 ? SKU.reorder : null };
}

// ── Geometry (world metres → picture plane) ─────────────────────────────────
const P = (x: number, y: number, z: number): UV => toPlane([x, y, z] as W3);
const isoRect = (x0: number, z0: number, x1: number, z1: number, y = 0.03): UV[] => [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1), P(x0, y, z0)];
const lerpUV = (a: UV, b: UV, t: number): UV => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dense = (pts: UV[], step = 0.25): UV[] => {
  const out: UV[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push(lerpUV(a, b, k / n));
  }
  return out;
};
const bez = (a: UV, c1: UV, c2: UV, b: UV, n = 60): UV[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const m = 1 - t;
    return [m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0], m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1]] as UV;
  });
/** Rounded rectangle in the plane, starting at the left end of the top edge, clockwise. */
function roundRect(x: number, y: number, w: number, h: number, r: number, startCorner: "bl" | "tl" | "tr" = "tl"): UV[] {
  const arc = (cx: number, cy: number, a0: number, a1: number) =>
    Array.from({ length: 9 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / 8;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as UV;
    });
  const tl = arc(x + r, y + r, Math.PI, Math.PI * 1.5);
  const tr = arc(x + w - r, y + r, -Math.PI / 2, 0);
  const br = arc(x + w - r, y + h - r, 0, Math.PI / 2);
  const bl = arc(x + r, y + h - r, Math.PI / 2, Math.PI);
  let loop = [...tl, ...tr, ...br, ...bl, tl[0]!];
  if (startCorner === "bl") loop = [...bl, ...tl, ...tr, ...br, bl[0]!];
  if (startCorner === "tr") loop = [...tr, ...br, ...bl, ...tl, tr[0]!];
  return dense(loop, 0.2);
}

// The WareOrb mark (Lucide "warehouse", the app's favicon/header icon), placed in the plane.
export const MARK_C: UV = (() => {
  const c = P(50, 0, 35);
  return [c[0], c[1] - 3.2];
})();
export const MARK_S = 0.98; // metres per icon unit (≈ 290 px across at the overview zoom)
export const markPt = (x: number, y: number): UV => [MARK_C[0] + (x - 12) * MARK_S, MARK_C[1] + (y - 12) * MARK_S];
export const MARK_OUTER_D = "M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z";
const MARK_INNER: [number, number][] = [
  [6, 22],
  [6, 10],
  [18, 10],
  [18, 22],
  [18, 18],
  [6, 18],
  [6, 14],
  [18, 14],
];

// Bounding silhouette of the warehouse box (slab 1.6 m below, walls 3.4 m above) — 6 corners from the far top.
const SIL: UV[] = [P(0, 3.4, 0), P(100, 3.4, 0), P(100, -1.6, 0), P(100, -1.6, 70), P(0, -1.6, 70), P(0, 3.4, 70), P(0, 3.4, 0)];
const N_MORPH = 260;
/** Segments that trace where the stock physically went (lit together in the final pull-back). */
const JOURNEY = new Set(["toDock", "dock", "toBay", "bay", "toAge", "lock1", "lock2", "toDoor", "route", "back", "reserved", "freed", "toReorder", "reorder"]);

export interface Card {
  id: string;
  srcs: string[];
  tl: UV; // plane top-left
  w: number; // plane width (m)
  aspect: number; // h / w
  reveal: [number, number]; // frames: radial fill from the line's closing point
  origin: UV;
  out: [number, number]; // frames: fade out
  swap?: (f: number) => number;
}
export interface Window3D {
  poly: UV[][]; // union of polygons (plane)
  origin: UV;
  r: [number, number]; // reveal frames
  h: [number, number]; // fade back to ghost
}

export interface Story {
  segs: Seg[];
  cards: Card[];
  windows: Window3D[];
  houseOuter: UV[];
  houseInner: UV[];
  silhouette: UV[];
  pin: { at: UV; label: string; r: [number, number]; out: [number, number] };
}

/** Build the whole path. `sample` turns an SVG path string into points (needs the DOM). */
export function buildStory(sample: (d: string, n: number) => [number, number][]): Story {
  // house outline in icon units, rotated so it starts at the roof peak (12, 3.3) and runs clockwise
  const raw = sample(MARK_OUTER_D, 400);
  let k0 = 0;
  raw.forEach((p, i) => {
    if (p[1] < raw[k0]![1]) k0 = i;
  });
  const ring = [...raw.slice(k0), ...raw.slice(0, k0), raw[k0]!].map(([x, y]) => markPt(x, y));
  // corner-to-corner correspondence keeps every in-between shape clean and convex:
  // peak→far corner, shoulders→side corners, bottom corners→front corners, bottom middle→near corner
  const anchorsIcon: [number, number][] = [[12, 3.3], [22, 8.35], [21.4, 21.4], [12, 22], [2.6, 21.4], [2, 8.35]];
  const nearest = (q: UV) => ring.reduce((bi, p, i) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(ring[bi]![0] - q[0], ring[bi]![1] - q[1]) ? i : bi), 0);
  const ai = anchorsIcon.map(([x, y]) => nearest(markPt(x, y)));
  ai[0] = 0;
  const silEdges = SIL.slice(0, 6).map((a, i) => [a, SIL[i + 1]!] as [UV, UV]);
  const edgeLen = silEdges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const totalLen = edgeLen.reduce((x, y) => x + y, 0);
  const counts = edgeLen.map((l) => Math.max(8, Math.round((l / totalLen) * N_MORPH)));
  const house: UV[] = [];
  const sil: UV[] = [];
  for (let k = 0; k < 6; k++) {
    const i0 = ai[k]!;
    const i1 = k === 5 ? ring.length - 1 : ai[k + 1]!;
    const chunk = ring.slice(i0, i1 + 1);
    const hc = resample(chunk.length > 1 ? chunk : [chunk[0]!, chunk[0]!], counts[k]! + 1);
    const sc = resample(dense(silEdges[k]!, 0.3), counts[k]! + 1);
    house.push(...(k ? hc.slice(1) : hc));
    sil.push(...(k ? sc.slice(1) : sc));
  }
  const morphPts = (m: number): UV[] => {
    // a little squash, stretch and rotation through the middle of the morph
    const c: UV = lerpUV(MARK_C, P(50, 0, 35), m);
    const rot = Math.sin(m * Math.PI) * 0.06;
    const sq = 1 + Math.sin(m * Math.PI) * 0.05;
    return house.map((h, i) => {
      const p = lerpUV(h, sil[i]!, m);
      const dx = (p[0] - c[0]) * sq;
      const dy = (p[1] - c[1]) / sq;
      return [c[0] + dx * Math.cos(rot) - dy * Math.sin(rot), c[1] + dx * Math.sin(rot) + dy * Math.cos(rot)] as UV;
    });
  };
  const morphAt = (f: number) => {
    const open = easeInOutQuint(prog(f, T.morph0, T.morph1));
    const close = easeInOutQuint(prog(f, 255, 264));
    return open * (1 - close);
  };

  const segs: Seg[] = [];
  let cur: UV = house[0]!;
  const add = (id: string, pts: UV[], f0: number, f1: number, color: string, o: Partial<Seg> = {}) => {
    const p = [cur, ...pts];
    const seg: Seg = { id, pts: p, f0, f1, color, warp: buildWarp(p), journey: JOURNEY.has(id), ...o };
    segs.push(seg);
    cur = p[p.length - 1]!;
    return seg;
  };

  // 0 · the mark's outline, which opens into the warehouse silhouette and closes back at the end
  segs.push({ id: "mark", pts: (f) => morphPts(morphAt(f)), f0: 1, f1: T.markDone, color: C.blue, warp: buildWarp(house), keep: true });
  cur = sil[0]!; // the peak becomes the far corner of the warehouse

  // Travel happens along the building's own aisles (true-isometric axes), so the trail stays architectural.
  const via = (...w: [number, number, number][]) => dense(w.map(([x, y, z]) => P(x, y, z)), 0.4);
  const card = (tl: UV, w: number, aspect: number, r = 0.8, start: "bl" | "tl" = "bl") => {
    const h = w * aspect;
    return { tl, w, aspect, h, rect: roundRect(tl[0] - 0.5, tl[1] - 0.5, w + 1, h + 1, r, start) };
  };
  const at = (c: { tl: UV; w: number; h: number }, x: number, y: number, cw: number, ch: number): UV => [c.tl[0] + (x / cw) * c.w, c.tl[1] + (y / ch) * c.h];

  // 1 · Capture — along the back wall to the inbound dock, outline it, draw the delivery-note card, tick it
  const dock = isoRect(20, 0, 46, 8);
  add("toDock", [P(10, 3.4, 0), P(20, 0.03, 0)], T.morph1, 35, C.blue, { ease: easeInOutSine });
  add("dock", dock.slice(1), 35, T.dockClose, C.blue);
  const note = card([16, -2.6], 21.5, 278 / 772, 0.9);
  add("toNote", [note.rect[0]!], T.dockClose, 46, C.blue, { ease: easeInOutSine });
  add("noteCard", note.rect.slice(1), 46, T.noteClose, C.blue);
  const box = at(note, 58, 224, 772, 278);
  add("toTick", [[box[0] - 0.35, box[1] + 0.02]], T.noteClose, 57, C.blue, { ease: easeInOutSine });
  add("tick", [[box[0] - 0.08, box[1] + 0.3], [box[0] + 0.45, box[1] - 0.38]], 57, T.tick, C.blue);
  // the checked stock travels to its bay: down to the walkway, along it, down the side aisle to C-3-01
  const c301 = isoRect(4.6, 54.2, 11.0, 57.4);
  add("toBay", [...dense([cur, P(18, 0.03, 0)], 0.4).slice(1), ...via([18, 0.03, 0], [18, 0.03, 9.2], [2, 0.03, 9.2], [2, 0.03, 54.2], [4.6, 0.03, 54.2]).slice(1)], T.tick + 1, 73, C.blue, { ease: easeInOutSine });
  add("bay", c301.slice(1), 73, T.chairsLand + 2, C.blue);

  // 2 · Spot — back up the side aisle to zone A and lock onto batch B-2140-A (A-1-01 + A-1-02), two violet laps
  const ageA = isoRect(4.2, 11.8, 18.3, 15.8);
  const ageB = isoRect(3.7, 11.3, 18.8, 16.3);
  add("toAge", via([4.6, 0.03, 54.2], [2, 0.03, 54.2], [2, 0.03, 11.8], [4.2, 0.03, 11.8]).slice(1), 86, 97, C.blue, { ease: easeInOutSine });
  add("lock1", ageA.slice(1), 97, 103, C.violet);
  add("lock2", [ageB[0]!, ...ageB.slice(1)], 103, 109, C.violet);
  const age = card([-2, -10.6], 18.8, 212 / 800);
  add("toAgeCard", [...via([3.7, 0.03, 11.3], [2, 0.03, 11.3], [2, 0.03, 0.4]).slice(1), age.rect[0]!], 109, 113, C.violet, { ease: easeInOutSine });
  add("ageCard", age.rect.slice(1), 113, T.ageCardIn, C.violet);

  // 3 · Hand off & quote — the flag becomes Arif's task; the line follows the wall out through the outbound door
  const deal = card([24, 1.4], 17.6, 106 / 632, 0.7);
  add("toDeal", [deal.rect[0]!], T.ageCardIn, 122, C.violet, { ease: easeInOutSine });
  add("dealCard", deal.rect.slice(1), 122, T.handoff, C.blue);
  const door = P(66, 0.03, 0);
  add("toDoor", [door], T.handoff, 136, C.blue, { ease: easeInOutSine });
  const pinW: [number, number, number] = [71, 0, -14];
  const pin = P(...pinW);
  add("route", bez(door, P(66, 0, -5), P(68, 0, -11), pin, 50).slice(1), 136, T.pin, C.blue, { ease: easeInOutSine });
  const quotes = card([58, 2.5], 25, 422 / 756, 0.9);
  add("toQuotes", [quotes.rect[0]!], T.pin, 145, C.blue, { ease: easeInOutSine });
  add("quotesCard", quotes.rect.slice(1), 145, 151, C.blue);
  // circle the lowest (synthetic) quote
  const lowest = at(quotes, 213, 77, 756, 422);
  const loop: UV[] = Array.from({ length: 49 }, (_, i) => {
    const a = Math.PI * 0.85 + (i / 48) * Math.PI * 2.15;
    return [lowest[0] + Math.cos(a) * 2.8, lowest[1] + Math.sin(a) * 1.2] as UV;
  });
  add("toLowest", [loop[0]!], 157, 160, C.blue, { ease: easeInOutSine });
  add("lowest", loop.slice(1), 160, T.lowest, C.blue);

  // 4 · Approve, then dispatch — the owner's tick, the decision, back in through the door to A-1-01
  const dec = card([89, 2.5], 25, 444 / 756, 0.9, "tl");
  const chk0: UV = [dec.tl[0] - 5.4, dec.tl[1] + 7.5];
  add("toCheck", bez(cur, [cur[0] + 4, cur[1] + 8], [chk0[0] - 2, chk0[1] + 3], chk0, 40).slice(1), T.lowest, 172, C.teal, { ease: easeInOutSine });
  add("check", [[chk0[0] + 1.5, chk0[1] + 1.8], [chk0[0] + 4.2, chk0[1] - 2.7]], 172, 177, C.teal);
  add("toDec", [dec.rect[0]!], 177, 178, C.teal);
  add("decCard", dec.rect.slice(1), 178, T.approved - 4, C.teal);
  add(
    "back",
    [...bez(cur, [cur[0] - 6, cur[1] + 10], P(70, 0, -9), pin, 40).slice(1), ...bez(pin, P(68, 0, -11), P(66, 0, -5), door, 30).slice(1), ...via([66, 0.03, 0], [66, 0.03, 9.2], [7.8, 0.03, 9.2], [7.8, 0.03, 12.2]).slice(1)],
    T.approved,
    205,
    C.teal,
    { ease: easeInOutSine },
  );
  const freed = isoRect(4.6, 12.2, 11.0, 15.4);
  add("reserved", [freed[1]!, freed[2]!, freed[3]!, freed[0]!, freed[1]!], 205, 211, C.teal);
  add("freed", [freed[2]!, freed[3]!, freed[0]!, freed[1]!], T.freed - 1, T.freed + 5, C.green);

  // 5 · Reorder with reasons — 3-Seater Sofa · Oatmeal (A-2-04, A-2-05), reached along the row aisle
  const ro = isoRect(25.2, 19.0, 38.7, 22.6);
  add("toReorder", via([11, 0.03, 12.2], [11.3, 0.03, 17.3], [25.2, 0.03, 17.3], [25.2, 0.03, 19.0]).slice(1), T.freed + 5, 229, C.blue, { ease: easeInOutSine });
  add("reorder", ro.slice(1), 229, T.reorderClose, C.blue);
  const rep = card([8, -8.6], 17.2, 294 / 632);
  add("toRep", bez(cur, [cur[0] + 1, cur[1] - 8], [rep.rect[0]![0] + 1, rep.rect[0]![1] + 6], rep.rect[0]!, 40).slice(1), T.reorderClose, 238, C.blue, { ease: easeInOutSine });
  add("repCard", rep.rect.slice(1), 238, 244, C.blue);
  const ul0 = at(rep, 30, 198, 632, 294);
  const ul1 = at(rep, 462, 198, 632, 294);
  add("toUnderline", [ul0], 244, 246, C.blue);
  add("underline", [ul1], 246, 251, C.blue);

  // 6 · Brand — the tip races home and draws the inner mark while the trail is pulled in behind it
  const inner = MARK_INNER.map(([x, y]) => markPt(x, y));
  add("home", bez(cur, [cur[0] - 4, cur[1] + 10], [inner[0]![0] + 10, inner[0]![1] + 6], inner[0]!, 60).slice(1), 253, 260, C.blue, { ease: easeInOutCubic });
  add("inner", dense(inner.slice(1), 0.25), 260, T.markClose, C.blue, { keep: true, weight: 0.9 });

  // ── UI cards revealed by the line (real WareOrb captures)
  const cards: Card[] = [
    { id: "note", srcs: ["k1-note", "k2-note-checked"], tl: note.tl, w: note.w, aspect: note.aspect, reveal: [T.noteClose - 1, T.noteClose + 6], origin: note.rect[0]!, out: [80, 86], swap: (f) => (f < T.tick ? 0 : 1) },
    { id: "age", srcs: ["k3-ageing"], tl: age.tl, w: age.w, aspect: age.aspect, reveal: [T.ageCardIn - 1, T.ageCardIn + 6], origin: age.rect[0]!, out: [140, 146] },
    { id: "deal", srcs: ["k4-deal"], tl: deal.tl, w: deal.w, aspect: deal.aspect, reveal: [T.handoff - 2, T.handoff + 4], origin: deal.rect[0]!, out: [148, 154] },
    { id: "quotes", srcs: ["k5-quotes"], tl: quotes.tl, w: quotes.w, aspect: quotes.aspect, reveal: [149, 156], origin: quotes.rect[0]!, out: [200, 207] },
    { id: "decision", srcs: ["k6-decision"], tl: dec.tl, w: dec.w, aspect: dec.aspect, reveal: [T.approved - 6, T.approved + 1], origin: dec.rect[0]!, out: [202, 209] },
    { id: "replen", srcs: ["k7-replen"], tl: rep.tl, w: rep.w, aspect: rep.aspect, reveal: [243, 249], origin: rep.rect[0]!, out: [250, 256] },
  ];

  // ── 3D windows: full-colour reveals of the real twin inside shapes the line has closed
  const windows: Window3D[] = [
    { poly: [isoRect(19.6, -0.4, 46.4, 8.4)], origin: P(20, 0, 0), r: [T.dockClose - 1, T.dockClose + 6], h: [70, 78] },
    { poly: [c301], origin: c301[0]!, r: [T.chairsLand + 1, T.chairsLand + 6], h: [94, 102] },
    { poly: [ageB], origin: ageA[0]!, r: [100, 108], h: [128, 136] },
    {
      poly: [isoRect(4.2, 11.8, 11.4, 15.8), isoRect(5.6, 8.0, 68.4, 10.6), isoRect(63.6, -1.0, 68.4, 10.6)],
      origin: P(66, 0, 0),
      r: [196, 204],
      h: [226, 234],
    },
    { poly: [ro], origin: ro[0]!, r: [T.reorderClose - 2, T.reorderClose + 4], h: [250, 258] },
  ];

  return {
    segs,
    cards,
    windows,
    houseOuter: house,
    houseInner: inner,
    silhouette: sil,
    pin: { at: pin, label: "Petaling Jaya · SS2", r: [T.pin - 2, T.pin + 4], out: [200, 207] },
    // morph accessor for the twin mask
    ...{ morphPts, morphAt },
  } as Story & { morphPts: (m: number) => UV[]; morphAt: (f: number) => number };
}

// ── Camera (plane centre + zoom) ─────────────────────────────────────────────
const K = (f: number, u: number, v: number, z: number, e?: (t: number) => number): Key<number[]> => ({ f, v: [u, v, Math.log(z)], e });
const OV = (() => {
  const c = P(50, 0, 35);
  return [c[0], c[1] - 0.6] as const;
})();
const CAM: Key<number[]>[] = [
  K(0, OV[0], OV[1], 12.6),
  K(30, OV[0], OV[1], 12.4),
  K(44, 24, 9, 26, easeInOutCubic),
  K(60, 23, 9.5, 26.5, easeInOutSine),
  K(73, -30, 20, 24, easeInOutCubic),
  // product close-up #1 — the chairs that just landed
  K(81, -33.9, 25.7, 56, easeInOutQuint),
  K(86, -33.9, 25.7, 58),
  K(97, -3, 6.5, 27, easeInOutCubic),
  // product close-up #2 — the ageing sofas
  K(105, -1.8, 10.4, 50, easeInOutQuint),
  K(109, -1.8, 10.4, 51),
  K(118, 5, 0, 29, easeInOutCubic),
  K(128, 18, 4, 26, easeInOutSine),
  K(146, 62, 11, 17.4, easeInOutCubic),
  K(170, 66, 12, 17.8, easeInOutSine),
  K(190, 71, 12, 17.8, easeInOutSine),
  K(203, 14, 13.5, 29, easeInOutCubic),
  K(214, 22, 18, 29.5, easeInOutSine),
  K(222, 18, 16, 28, easeInOutSine),
  K(230, 11, 9, 26, easeInOutCubic),
  // product close-up #3 — the 3-seater flagged for reorder
  K(236, 7.9, 21.4, 40, easeInOutQuint),
  K(242, 11.5, 6, 27, easeInOutCubic),
  K(256, OV[0], OV[1], 12.4, easeInOutQuint),
  K(300, OV[0], OV[1], 12.1, easeOutCubic),
];
export function camAt(f: number): Cam {
  const v = track(CAM, f);
  return { u: v[0]!, v: v[1]!, zoom: Math.exp(v[2]!) };
}

/** Twin visibility outside windows: 0 hidden, ghost ≈ 0.2, 1 full. */
export function twinLevel(f: number) {
  if (f < T.twinOpen) return 0;
  const open = easeOutCubic(prog(f, T.twinOpen, T.twinOpen + 10));
  const ghost = lerp(1, 0.3, easeInOutCubic(prog(f, 38, 52)));
  const end = lerp(1, 1.6, easeInOutCubic(prog(f, 244, 252))) * (1 - easeInCubic(prog(f, 256, 263)));
  return open * ghost * end;
}

// ── Story motion on specific units (the app's own instances) ─────────────────
const V = new THREE.Vector3();
export function eventPose(f: number, m: InstMeta, kind: Kind): Pose | null {
  if (kind === "rack") return null;
  // opening: stock drops into the freshly revealed twin with weight
  if (f < 54 && kind !== "blob") {
    const t0 = T.twinOpen + 2 + 16 * m.d + 3 * m.j;
    const r = drop(f - t0, 5, 5, 0.17, 8);
    if (f < t0 + 13) return pose(r.dy, r.sy, r.sxz, r.visible);
  }
  if (f < 54 && kind === "blob") {
    const t0 = T.twinOpen + 2 + 16 * m.d + 3 * m.j;
    const r = drop(f - t0, 5, 5, 0.17, 8);
    if (f < t0 + 13) return pose(0, 1, r.visible ? lerp(0.35, 1, 1 - r.dy / 5) : 0, r.visible);
  }
  // delivery DN-2291: wrapped units lift away once checked and posted
  if (m.owner === "pending" && f >= T.posted) {
    const t = prog(f, T.posted, T.posted + 8);
    const e = easeInCubic(t);
    if (kind === "blob") return pose(0, 1, 1 - e, t < 1);
    return pose(e * 1.8, 1 - 0.85 * e, 1 - 0.85 * e, t < 1);
  }
  // posted stock lands in C-3-01
  if (m.owner === BAY.receipt && f >= T.chairsLand - 2 && f < T.chairsLand + 20) {
    const t0 = T.chairsLand - 2 + m.j * 4;
    const r = drop(f - t0, 5, 5, 0.18, 9);
    if (kind === "blob") return pose(0, 1, r.visible ? lerp(0.35, 1, 1 - r.dy / 5) : 0, r.visible);
    return pose(r.dy, r.sy, r.sxz, r.visible);
  }
  // confirmed collection: the two units in A-1-01 ride the line out through the outbound door
  if (m.owner === BAY.dispatch && f >= T.leaveStart - 2 && f < T.freed) {
    if (kind === "blob") return pose(0, 1, 1 - easeOutCubic(prog(f, T.leaveStart, T.leaveStart + 4)), true);
    const start = new THREE.Vector3(m.pos.x, 0, m.pos.z);
    const lane = m.pos.x - 7.8;
    const pts = [start, new THREE.Vector3(m.pos.x, 0, 9.2), new THREE.Vector3(66 + lane, 0, 9.2), new THREE.Vector3(66 + lane, 0, -3)];
    const lens = [pts[0]!.distanceTo(pts[1]!), pts[1]!.distanceTo(pts[2]!), pts[2]!.distanceTo(pts[3]!)];
    const total = lens[0]! + lens[1]! + lens[2]!;
    const pre = prog(f, T.leaveStart - 2, T.leaveStart);
    const lift = easeOutCubic(prog(f, T.leaveStart, T.leaveStart + 4));
    const travel = easeInOutCubic(prog(f, T.leaveStart + 2, T.leaveEnd - 1));
    let d = travel * total;
    let i = 0;
    while (i < 2 && d > lens[i]!) d -= lens[i++]!;
    V.copy(pts[i]!).lerp(pts[i + 1]!, lens[i]! ? d / lens[i]! : 0);
    const squash = pre < 1 ? 1 - 0.08 * Math.sin(pre * Math.PI) : 1;
    const exit = prog(f, T.leaveEnd - 4, T.leaveEnd);
    return pose(lift * 0.9 * (1 - exit) + Math.sin(travel * Math.PI) * 0.25, squash * (1 - exit), (1 + (1 - squash) * 0.5) * (1 - exit), exit < 1, V.x - start.x, V.z - start.z);
  }
  return null;
}

/** Centre of the collected units on their way out (world), for the light that runs ahead of them on the rail. */
export function dispatchAt(f: number): [number, number, number] | null {
  if (f < T.leaveStart + 2 || f > T.leaveEnd) return null;
  const pts: [number, number][] = [[7.8, 13.8], [7.8, 9.2], [66, 9.2], [66, -3]];
  const lens = [4.6, 58.2, 12.2];
  const total = lens[0]! + lens[1]! + lens[2]!;
  let d = easeInOutCubic(prog(f, T.leaveStart + 2, T.leaveEnd - 1)) * total;
  let i = 0;
  while (i < 2 && d > lens[i]!) d -= lens[i++]!;
  const t = d / lens[i]!;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  return [a[0] + (b[0] - a[0]) * t, 0.6, a[1] + (b[1] - a[1]) * t];
}

// ── Typography ───────────────────────────────────────────────────────────────
export const CAPTIONS = [
  { a: 34, b: 86, idea: "01", head: "Capture stock.", subs: [{ a: 34, text: "Check the delivery. Post it to a bay." }] },
  {
    a: 92,
    b: 216,
    idea: "02",
    head: "Turn inventory into action.",
    subs: [
      { a: 92, text: "Spot stock that isn't selling." },
      { a: 122, text: "Hand it to sales. Compare carrier quotes." },
      { a: 170, text: "Approve. Collect. Free the bay." },
    ],
  },
  { a: 222, b: 248, idea: "03", head: "Make better decisions.", subs: [{ a: 222, text: "Reorders come with their arithmetic." }] },
];
export const FOOT = [
  { a: 34, b: 140, text: "Real WareOrb UI · seeded demo data" },
  { a: 140, b: 222, text: "Real WareOrb UI · synthetic carrier quotes · simulated booking" },
  { a: 222, b: 250, text: "Real WareOrb UI · seeded demo data" },
];
