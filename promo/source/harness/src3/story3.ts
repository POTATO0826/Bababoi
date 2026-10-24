// "One line", 21-second cut (v3). 30 fps, frames 0–629, beats every 15 frames (120 BPM).
// Same film language as v2 (one unbroken line = the ledger trail of one batch's journey), re-timed for
// readability and extended with:
//   · a cinematic opening: the app's own warehouse twin assembles itself inside the mark's silhouette;
//   · four real button presses. Each card shows consecutive captures of the real app around one real click
//     (Post to stock, Hand to Arif, Approve, Confirm 2 left the warehouse);
//   · a longer brand ending with the team credit.
// Everything is a pure function of the frame number n.
import * as THREE from "three";
import type { Stage } from "@/store";
import { drop, easeInCubic, easeInOutCubic, easeInOutQuint, easeInOutSine, easeOutCubic, lerp, prog, track, type Key } from "../src/ease";
import { pose, type InstMeta, type Kind, type Pose } from "../src/anim3d";
import { buildWarp, resample, type Seg } from "./line";
import { toPlane, type Cam, type UV, type W3 } from "./plane";

export const FPS = 30;
export const FRAMES = 630;
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

/** Key moments (frames, 30 fps). Exported for the score and the sound design. */
export const T = {
  markStart: 3,
  markDone: 33,
  morph0: 38,
  morph1: 66,
  twinOpen: 58,
  asm0: 60, // the warehouse assembles (v1 hook, slowed ×1.45)
  dockClose: 128,
  rcptClose: 147,
  tick: 165, // "Counted and checked"
  pressPost: 180,
  posted: 182,
  chairsLand: 208,
  bayClose: 212,
  ageLock: 244,
  ageClose: 252,
  ageCardClose: 270,
  pressHand: 300,
  pin: 326,
  quotesClose: 338,
  lowest: 355,
  apprClose: 370,
  pressApprove: 390,
  reservedClose: 434,
  collClose: 447,
  pressConfirm: 465,
  leaveStart: 471,
  leaveEnd: 494,
  freed: 495,
  reorderClose: 514,
  repClose: 525,
  underline: 536,
  journey: 546,
  retract: 556,
  markClose: 571, // ≈ beat 38
  word: 572,
  tag: 576,
  credit: 580,
} as const;

export function sceneState(f: number): { ledger: LedgerName; stage: Stage; selected: string | null } {
  if (f < T.chairsLand - 2) return { ledger: "L0-seed", stage: "receive", selected: null };
  if (f < 232) return { ledger: "L1-posted", stage: "receive", selected: f >= 213 ? SKU.chair : null };
  if (f < T.pressHand) return { ledger: "L2a-ageing", stage: "ageing", selected: f >= 242 && f < 268 ? SKU.ageing : null };
  if (f < T.pressApprove) return { ledger: "L2-handed", stage: "deals", selected: null };
  if (f < T.freed) return { ledger: "L3-approved", stage: "collect", selected: null };
  if (f < 505) return { ledger: "L4-collected", stage: "collect", selected: null };
  return { ledger: "L5-replenish", stage: "replenish", selected: f >= 512 && f < 530 ? SKU.reorder : null };
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
/** Rounded rectangle in the plane, clockwise. "tl" starts on the left edge just under the top-left corner. */
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
export const MARK_S = 0.98;
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

const SIL: UV[] = [P(0, 3.4, 0), P(100, 3.4, 0), P(100, -1.6, 0), P(100, -1.6, 70), P(0, -1.6, 70), P(0, 3.4, 70), P(0, 3.4, 0)];
const N_MORPH = 260;
const JOURNEY = new Set(["toDock", "dock", "toBay", "bay", "toAge", "lock1", "lock2", "toDoor", "route", "back", "reserved", "freed", "toReorder", "reorder"]);

// ── Real UI states (crops of consecutive captures; see make-ui3.py) ──────────
export interface CardState {
  src: string; // path under the dist root
  px: [number, number]; // source pixel size (2x DPR)
}
/**
 * A real state change on a card: the press at `at` (the control's centre, in the outgoing state's source pixels)
 * sends a wave across the card; the next capture is revealed inside it. No frame shows two layouts on top of each
 * other (a cross-dissolve between different layouts reads as a muddy double exposure).
 */
export interface CardSwap {
  f: number; // the wave leaves the pressed control
  at: [number, number];
  soft?: boolean; // a checkbox: a soft, ringless spread instead of the press wave
}
export interface Card {
  id: string;
  states: CardState[];
  swaps: CardSwap[]; // swap i: state i → i+1
  tl: UV; // plane top-left
  w: number; // plane width (m)
  reveal: [number, number];
  origin: UV;
  out: [number, number];
}
/** Frames for the wave to cross the whole card. */
export const WAVE = 9;
/** The card eases to the next state's height once the wave has cleared its bottom edge. */
const SETTLE = [2, 12] as const;
/** State blend at frame f: [from, to, wave progress 0..1]. */
export function cardBlend(c: Card, f: number): [number, number, number] {
  let i = 0;
  while (i < c.swaps.length && f >= c.swaps[i]!.f + WAVE) i++;
  if (i < c.swaps.length && f >= c.swaps[i]!.f) return [i, i + 1, easeOutCubic(prog(f, c.swaps[i]!.f, c.swaps[i]!.f + WAVE))];
  return [i, i, 0];
}
const stateH = (c: Card, i: number) => (c.states[i]!.px[1] / c.states[i]!.px[0]) * c.w;
/** Card height (plane metres) at frame f — real states differ in height; it eases between them. */
export function cardH(c: Card, f: number) {
  let h = stateH(c, 0);
  c.swaps.forEach((s, i) => (h = lerp(h, stateH(c, i + 1), easeInOutCubic(prog(f, s.f + SETTLE[0], s.f + SETTLE[1])))));
  return h;
}

export interface Press {
  card: string;
  state: number;
  btn: [number, number, number, number]; // button rect in the state's source pixels
  f: number; // press frame
  color: string;
  kind: "button" | "checkbox";
}

export interface Window3D {
  poly: UV[][];
  origin: UV;
  r: [number, number];
  h: [number, number];
}

export interface Story {
  segs: Seg[];
  cards: Card[];
  presses: Press[];
  windows: Window3D[];
  houseOuter: UV[];
  houseInner: UV[];
  silhouette: UV[];
  pin: { at: UV; label: string; r: [number, number]; out: [number, number] };
  morphPts: (m: number) => UV[];
  morphAt: (f: number) => number;
  /** Plane point of a source pixel on a card. */
  cardPt: (id: string, x: number, y: number) => UV;
}

const S = (src: string, w: number, h: number): CardState => ({ src, px: [w, h] });

export function buildStory(sample: (d: string, n: number) => [number, number][]): Story {
  // house outline in icon units, rotated so it starts at the roof peak and runs clockwise
  const raw = sample(MARK_OUTER_D, 400);
  let k0 = 0;
  raw.forEach((p, i) => {
    if (p[1] < raw[k0]![1]) k0 = i;
  });
  const ring = [...raw.slice(k0), ...raw.slice(0, k0), raw[k0]!].map(([x, y]) => markPt(x, y));
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
    const close = easeInOutQuint(prog(f, T.retract + 4, T.retract + 14));
    return open * (1 - close);
  };

  // ── cards (real UI states)
  const cards: Card[] = [];
  const cardById = (id: string) => cards.find((c) => c.id === id)!;
  const defCard = (id: string, states: CardState[], swaps: number[], tl: UV, w: number, reveal: [number, number], out: [number, number]) => {
    const c: Card = { id, states, swaps, tl, w, reveal, origin: [tl[0] - 0.5, tl[1] + 0.4], out };
    cards.push(c);
    return c;
  };
  const cardPt = (id: string, x: number, y: number): UV => {
    const c = cardById(id);
    return [c.tl[0] + (x / c.states[0]!.px[0]) * c.w, c.tl[1] + (y / c.states[0]!.px[0]) * c.w];
  };
  /** The card's outline as drawn by the line: follows the card when a real state change resizes it. */
  const outline = (c: Card, r = 0.85) => (f: number) => roundRect(c.tl[0] - 0.5, c.tl[1] - 0.5, c.w + 1, cardH(c, f) + 1, r, "tl");
  const outline0 = (c: Card, r = 0.85) => outline(c, r)(-1);
  /** The line's selection loop around a real button; it closes at the bottom-left, where the press lands. */
  const btnLoop = (id: string, b: [number, number, number, number], pad = 0.32) => {
    const a = cardPt(id, b[0], b[1]);
    const z = cardPt(id, b[2], b[3]);
    return roundRect(a[0] - pad, a[1] - pad, z[0] - a[0] + 2 * pad, z[1] - a[1] + 2 * pad, Math.min(0.6, (z[1] - a[1]) / 2 + pad), "bl");
  };

  const BTN = {
    post: [12, 356, 759, 427] as [number, number, number, number],
    hand: [26, 634, 773, 705] as [number, number, number, number],
    approve: [12, 523, 575, 594] as [number, number, number, number],
    confirm: [12, 132, 591, 203] as [number, number, number, number],
  };
  const CHECKBOX: [number, number] = [58, 177];
  const mid = (b: [number, number, number, number]): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

  // each real state change starts one frame after its press, from the control that was pressed
  const rcpt = defCard("rcpt", [S("ui3/r0-unchecked", 772, 440), S("ui3/r1-checked", 772, 440), S("ui3/r2-posted", 772, 440)], [{ f: T.tick, at: CHECKBOX, soft: true }, { f: T.pressPost + 1, at: mid(BTN.post) }], [15.5, -7.6], 21.5, [T.rcptClose - 1, T.rcptClose + 6], [208, 216]);
  const age = defCard("age", [S("ui3/a0-ageing", 800, 730), S("ui3/a1-handed", 800, 588)], [{ f: T.pressHand + 1, at: mid(BTN.hand) }], [-12, -12.3], 15, [T.ageCardClose - 1, T.ageCardClose + 6], [326, 334]);
  const quotes = defCard("quotes", [S("ui2/k5-quotes", 756, 422)], [], [58, 2.5], 25, [T.quotesClose - 1, T.quotesClose + 6], [380, 388]);
  const appr = defCard("appr", [S("ui3/p0-approval", 756, 606), S("ui3/p1-decision", 756, 444)], [{ f: T.pressApprove + 1, at: mid(BTN.approve) }], [89, 2.5], 25, [T.apprClose - 1, T.apprClose + 6], [418, 426]);
  const coll = defCard("coll", [S("ui3/q0-confirm", 756, 216), S("ui3/q1-collected", 756, 156)], [{ f: T.pressConfirm + 1, at: mid(BTN.confirm) }], [2, 1.0], 17, [T.collClose - 1, T.collClose + 6], [492, 500]);
  const rep = defCard("rep", [S("ui2/k7-replen", 632, 294)], [], [8, -8.6], 17.2, [T.repClose - 1, T.repClose + 5], [544, 550]);
  const presses: Press[] = [
    { card: "rcpt", state: 0, btn: [CHECKBOX[0] - 18, CHECKBOX[1] - 18, CHECKBOX[0] + 18, CHECKBOX[1] + 18], f: T.tick, color: C.blue, kind: "checkbox" },
    { card: "rcpt", state: 1, btn: BTN.post, f: T.pressPost, color: C.blue, kind: "button" },
    { card: "age", state: 0, btn: BTN.hand, f: T.pressHand, color: C.blue, kind: "button" },
    { card: "appr", state: 0, btn: BTN.approve, f: T.pressApprove, color: C.teal, kind: "button" },
    { card: "coll", state: 0, btn: BTN.confirm, f: T.pressConfirm, color: C.teal, kind: "button" },
  ];

  const segs: Seg[] = [];
  let cur: UV = house[0]!;
  const add = (id: string, pts: UV[], f0: number, f1: number, color: string, o: Partial<Seg> = {}) => {
    const p = [cur, ...pts];
    const seg: Seg = { id, pts: p, f0, f1, color, warp: buildWarp(p), journey: JOURNEY.has(id), ...o };
    segs.push(seg);
    cur = p[p.length - 1]!;
    return seg;
  };
  /** A card outline whose shape follows the card's live height. */
  const addCard = (id: string, c: Card, f0: number, f1: number, color: string) => {
    const r0 = outline0(c);
    const fn = outline(c);
    const p0 = [cur, ...r0];
    const seg: Seg = { id, pts: (f: number) => [p0[0]!, ...fn(f)], f0, f1, color, warp: buildWarp(p0) };
    segs.push(seg);
    cur = r0[r0.length - 1]!;
  };
  /** A segment whose start follows a card (see leaveCard); its end point is fixed. */
  const addLive = (id: string, fn: (f: number) => UV[], f0: number, f1: number, color: string, o: Partial<Seg> = {}) => {
    const p0 = fn(f0);
    segs.push({ id, pts: fn, f0, f1, color, warp: buildWarp(p0), journey: JOURNEY.has(id), ...o });
    cur = p0[p0.length - 1]!;
  };
  /**
   * Where the pen rests after a press. The control it pressed may not exist in the next real state (the card shrinks),
   * so once the selection loop has faded the rest point glides to the bottom-left corner of the card's outline, and it
   * never hangs below the card's live bottom edge.
   */
  const anchor = (c: Card, press: number, from: UV) => (f: number): UV => {
    const h = cardH(c, f);
    const s = lerpUV(from, [c.tl[0] - 0.25, c.tl[1] + h + 0.25], easeInOutCubic(prog(f, press + 5, press + 13)));
    return [s[0], Math.min(s[1], c.tl[1] + h + 0.25)];
  };
  /** The selection loop around a control: the tip rests where it closes, which follows `anchor` after the press. */
  const pressLoop = (c: Card, press: number, loop: UV[]) => {
    const rest = anchor(c, press, loop[0]!);
    return (f: number): UV[] => [...loop.slice(0, -1), rest(f)];
  };
  /** After a press the line leaves from the pen's rest point, never from the empty space where a control used to be. */
  const leaveCard = (c: Card, press: number, from: UV, rest: (s: UV) => UV[]) => {
    const at = anchor(c, press, from);
    return (f: number): UV[] => {
      const s = at(f);
      return [s, ...rest(s)];
    };
  };
  const via = (...w: [number, number, number][]) => dense(w.map(([x, y, z]) => P(x, y, z)), 0.4);
  // the selection loop and its approach belong to the control: they leave with it as the next state rolls in
  const fadeAfter = (f: number): Partial<Seg> => ({ fade: [f + 1, f + 6], top: true });
  /** Approach a point inside a card the way a hand would: down the card's left margin, then straight in. */
  const margin = (c: Card, to: UV): UV[] => {
    const x = c.tl[0] - 0.5;
    return [[x, cur[1]], [x, to[1]], to];
  };

  // 0 · the mark's outline, which opens into the warehouse silhouette and closes back at the end
  segs.push({ id: "mark", pts: (f) => morphPts(morphAt(f)), f0: T.markStart, f1: T.markDone, color: C.blue, warp: buildWarp(house), keep: true });
  cur = sil[0]!; // the peak becomes the far corner of the warehouse

  // 1 · Capture — along the back wall to the inbound dock, outline it, open the delivery's line item, tick it,
  //     press Post to stock, and carry the stock to its bay
  const dock = isoRect(20, 0, 46, 8);
  add("toDock", [P(10, 3.4, 0), P(20, 0.03, 0)], 100, 116, C.blue, { ease: easeInOutSine });
  add("dock", dock.slice(1), 116, T.dockClose, C.blue);
  add("toRcpt", [outline0(rcpt)[0]!], T.dockClose, 134, C.blue, { ease: easeInOutSine });
  addCard("rcptCard", rcpt, 134, T.rcptClose, C.blue);
  const box = cardPt("rcpt", CHECKBOX[0], CHECKBOX[1]);
  add("toTick", margin(rcpt, [box[0] - 0.35, box[1] + 0.02]).slice(1), 152, 158, C.blue, { ease: easeInOutSine, top: true, fade: [192, 202] });
  add("tick", [[box[0] - 0.08, box[1] + 0.3], [box[0] + 0.45, box[1] - 0.38]], 158, T.tick, C.blue, { top: true, fade: [192, 202] });
  const postLoop = btnLoop("rcpt", BTN.post);
  add("toPost", margin(rcpt, postLoop[0]!), T.tick, 170, C.blue, { ease: easeInOutSine, ...fadeAfter(T.pressPost) });
  addLive("post", pressLoop(rcpt, T.pressPost, postLoop), 170, T.pressPost, C.blue, fadeAfter(T.pressPost));
  const c301 = isoRect(4.6, 54.2, 11.0, 57.4);
  const bayRun = via([18, 0.03, 0], [18, 0.03, 9.2], [2, 0.03, 9.2], [2, 0.03, 54.2], [4.6, 0.03, 54.2]).slice(1);
  addLive("toBay", leaveCard(rcpt, T.pressPost, cur, (s) => [...dense([s, P(18, 0.03, 0)], 0.4).slice(1), ...bayRun]), T.pressPost + 4, 204, C.blue, { ease: easeInOutSine });
  add("bay", c301.slice(1), 204, T.bayClose, C.blue);

  // 2 · Spot — up the side aisle to zone A, lock onto batch B-2140-A (A-1-01 + A-1-02), open it, hand it to Arif
  const ageA = isoRect(4.2, 11.8, 18.3, 15.8);
  const ageB = isoRect(3.7, 11.3, 18.8, 16.3);
  add("toAge", via([4.6, 0.03, 54.2], [2, 0.03, 54.2], [2, 0.03, 11.8], [4.2, 0.03, 11.8]).slice(1), 222, 236, C.blue, { ease: easeInOutSine });
  add("lock1", ageA.slice(1), 236, T.ageLock, C.violet);
  add("lock2", [ageB[0]!, ...ageB.slice(1)], T.ageLock, T.ageClose, C.violet);
  add("toAgeCard", [...via([3.7, 0.03, 11.3], [2, 0.03, 11.3], [2, 0.03, 0.4]).slice(1), outline0(age)[0]!], T.ageClose, 258, C.violet, { ease: easeInOutSine });
  addCard("ageCard", age, 258, T.ageCardClose, C.violet);
  const handLoop = btnLoop("age", BTN.hand);
  add("toHand", margin(age, handLoop[0]!).slice(1), 280, 288, C.blue, { ease: easeInOutSine, ...fadeAfter(T.pressHand) });
  addLive("hand", pressLoop(age, T.pressHand, handLoop), 288, T.pressHand, C.blue, fadeAfter(T.pressHand));

  // 3 · Hand off & quote — along the back wall, out through the outbound door to the buyer; synthetic quotes
  const door = P(66, 0.03, 0);
  const wallRun = via([10, 0.03, 0], [66, 0.03, 0]).slice(1);
  addLive("toDoor", leaveCard(age, T.pressHand, cur, (s) => [...dense([s, P(10, 0.03, 0)], 0.4).slice(1), ...wallRun]), T.pressHand + 2, 314, C.blue, { ease: easeInOutSine });
  const pinW: [number, number, number] = [71, 0, -14];
  const pin = P(...pinW);
  add("route", bez(door, P(66, 0, -5), P(68, 0, -11), pin, 50).slice(1), 314, T.pin, C.blue, { ease: easeInOutSine });
  add("toQuotes", [outline0(quotes)[0]!], T.pin, 329, C.blue, { ease: easeInOutSine });
  addCard("quotesCard", quotes, 329, T.quotesClose, C.blue);
  const lowest = cardPt("quotes", 213, 77);
  const loop: UV[] = Array.from({ length: 49 }, (_, i) => {
    const a = Math.PI * 0.85 + (i / 48) * Math.PI * 2.15;
    return [lowest[0] + Math.cos(a) * 2.8, lowest[1] + Math.sin(a) * 1.2] as UV;
  });
  add("toLowest", [loop[0]!], 341, 344, C.blue, { ease: easeInOutSine, top: true, fade: [380, 388] });
  add("lowest", loop.slice(1), 344, T.lowest, C.blue, { top: true, fade: [380, 388] });

  // 4 · Approve — the owner's decision card; the line selects Approve and presses it
  add("toAppr", bez(cur, [cur[0] + 6, cur[1] - 4], [outline0(appr)[0]![0] - 4, outline0(appr)[0]![1] - 2], outline0(appr)[0]!, 30).slice(1), 356, 360, C.teal, { ease: easeInOutSine });
  addCard("apprCard", appr, 360, T.apprClose, C.teal);
  const apprLoop = btnLoop("appr", BTN.approve);
  add("toApprove", margin(appr, apprLoop[0]!).slice(1), 376, 381, C.teal, { ease: easeInOutSine, ...fadeAfter(T.pressApprove) });
  addLive("approve", pressLoop(appr, T.pressApprove, apprLoop), 381, T.pressApprove, C.teal, fadeAfter(T.pressApprove));

  // 5 · Reserve, confirm the collection, dispatch, free the bay
  // back to the buyer's pin (decision travels with the deal), then in through the door to A-1-01 (the stock's journey)
  addLive("toPinBack", leaveCard(appr, T.pressApprove, cur, (s) => bez(s, [s[0] - 8, s[1] + 6], P(72, 0, -8), pin, 40).slice(1)), T.pressApprove + 11, 412, C.teal, { ease: easeInOutSine });
  add(
    "back",
    [...bez(pin, P(68, 0, -11), P(66, 0, -5), door, 30).slice(1), ...via([66, 0.03, 0], [66, 0.03, 9.2], [7.8, 0.03, 9.2], [7.8, 0.03, 12.2]).slice(1)],
    412,
    426,
    C.teal,
    { ease: easeInOutSine },
  );
  const freed = isoRect(4.6, 12.2, 11.0, 15.4);
  add("reserved", [freed[1]!, freed[2]!, freed[3]!, freed[0]!, freed[1]!], 426, T.reservedClose, C.teal);
  add("toColl", bez(cur, [cur[0] + 0.5, cur[1] - 3], [outline0(coll)[0]![0] - 2.5, outline0(coll)[0]![1] + 1], outline0(coll)[0]!, 30).slice(1), T.reservedClose, 439, C.teal, { ease: easeInOutSine });
  addCard("collCard", coll, 439, T.collClose, C.teal);
  const confLoop = btnLoop("coll", BTN.confirm);
  add("toConfirm", margin(coll, confLoop[0]!).slice(1), 450, 455, C.teal, { ease: easeInOutSine, ...fadeAfter(T.pressConfirm) });
  addLive("confirm", pressLoop(coll, T.pressConfirm, confLoop), 455, T.pressConfirm, C.teal, fadeAfter(T.pressConfirm));
  addLive("toFreed", leaveCard(coll, T.pressConfirm, cur, (s) => bez(s, [s[0] - 1, s[1] + 2], [freed[1]![0] + 1.5, freed[1]![1] - 2], freed[1]!, 30).slice(1)), 484, 494, C.teal, { ease: easeInOutSine });
  add("freed", [freed[2]!, freed[3]!, freed[0]!, freed[1]!], T.freed - 1, 501, C.green);

  // 6 · Reorder with reasons — 3-Seater Sofa · Oatmeal (A-2-04, A-2-05), reached along the row aisle
  const ro = isoRect(25.2, 19.0, 38.7, 22.6);
  add("toReorder", via([11, 0.03, 12.2], [11.3, 0.03, 17.3], [25.2, 0.03, 17.3], [25.2, 0.03, 19.0]).slice(1), 501, 508, C.blue, { ease: easeInOutSine });
  add("reorder", ro.slice(1), 508, T.reorderClose, C.blue);
  const repR0 = outline0(rep);
  add("toRep", bez(cur, [cur[0] + 1, cur[1] - 8], [repR0[0]![0] + 1, repR0[0]![1] + 6], repR0[0]!, 40).slice(1), T.reorderClose, 518, C.blue, { ease: easeInOutSine });
  addCard("repCard", rep, 518, T.repClose, C.blue);
  const ul0 = cardPt("rep", 30, 198);
  const ul1 = cardPt("rep", 462, 198);
  add("toUnderline", [ul0], 528, 530, C.blue, { top: true, fade: [544, 550] });
  add("underline", [ul1], 530, T.underline, C.blue, { top: true, fade: [544, 550], tipFade: true });

  // 7 · Brand — the tip races home and draws the inner mark while the trail is pulled in behind it
  const inner = MARK_INNER.map(([x, y]) => markPt(x, y));
  add("home", bez(cur, [cur[0] - 4, cur[1] + 10], [inner[0]![0] + 10, inner[0]![1] + 6], inner[0]!, 60).slice(1), T.retract - 2, T.retract + 7, C.blue, { ease: easeInOutCubic });
  add("inner", dense(inner.slice(1), 0.25), T.retract + 7, T.markClose, C.blue, { keep: true, weight: 0.9 });

  // ── 3D windows: full-colour reveals of the real twin inside shapes the line has closed
  const windows: Window3D[] = [
    { poly: [isoRect(19.6, -0.4, 46.4, 8.4)], origin: P(20, 0, 0), r: [T.dockClose - 1, T.dockClose + 6], h: [196, 206] },
    { poly: [c301], origin: c301[0]!, r: [T.bayClose - 1, T.bayClose + 5], h: [244, 252] },
    { poly: [ageB], origin: ageA[0]!, r: [240, 250], h: [304, 314] },
    {
      poly: [isoRect(4.2, 11.8, 11.4, 15.8), isoRect(5.6, 8.0, 68.4, 10.6), isoRect(63.6, -1.0, 68.4, 10.6)],
      origin: P(66, 0, 0),
      r: [420, 434],
      h: [506, 514],
    },
    { poly: [ro], origin: ro[0]!, r: [T.reorderClose - 2, T.reorderClose + 4], h: [540, 548] },
  ];

  return {
    segs,
    cards,
    presses,
    windows,
    houseOuter: house,
    houseInner: inner,
    silhouette: sil,
    pin: { at: pin, label: "Petaling Jaya · SS2", r: [T.pin - 2, T.pin + 4], out: [416, 424] },
    morphPts,
    morphAt,
    cardPt,
  };
}

// ── Camera (plane centre + zoom) ─────────────────────────────────────────────
const K = (f: number, u: number, v: number, z: number, e?: (t: number) => number): Key<number[]> => ({ f, v: [u, v, Math.log(z)], e });
const OV = (() => {
  const c = P(50, 0, 35);
  return [c[0], c[1] - 0.6] as const;
})();
const easeInOutQuintK = easeInOutQuint;
const CAM: Key<number[]>[] = [
  K(0, OV[0], OV[1], 12.9),
  K(36, OV[0], OV[1], 12.6, easeInOutSine),
  K(62, OV[0], OV[1] - 0.6, 12.4, easeInOutSine),
  // the warehouse builds itself — slow push-in
  K(104, 12.5, 29.5, 14.6, easeInOutSine),
  // capture: dock + the delivery's line item
  K(128, 22, 7.5, 27, easeInOutCubic),
  K(156, 24, 2.2, 29.5, easeInOutSine),
  // press in on "Post to stock"
  K(176, 26.2, 2.6, 35.5, easeInOutCubic),
  K(186, 26.2, 2.8, 36, easeInOutSine),
  // hold while the posted state settles (the history row is the proof), then chase the line to the bay
  K(192, 26.2, 2.9, 36.2, easeInOutSine),
  K(205, -22, 18, 26, easeInOutCubic),
  // product close-up #1 — the chairs that just landed in C-3-01
  K(214, -33.9, 25.7, 56, easeInOutQuintK),
  K(222, -33.9, 25.7, 58, easeInOutSine),
  K(236, -3, 6.5, 30, easeInOutCubic),
  // product close-up #2 — the ageing sofas
  K(246, -1.8, 10.4, 50, easeInOutQuintK),
  K(254, -1.8, 10.4, 51, easeInOutSine),
  K(270, -3, 1.2, 33, easeInOutCubic),
  K(282, -3.5, 0.8, 34, easeInOutSine),
  // press in on "Hand to Arif"
  K(296, -4.5, -4.2, 39.5, easeInOutCubic),
  K(302, -4.5, -4.0, 40, easeInOutSine),
  // hold on "Finding buyer" while the card settles, then chase the line out of the door
  K(312, -4.6, -5.2, 40.5, easeInOutSine),
  K(324, 34, 13, 20.5, easeInOutCubic),
  K(334, 66, 11.5, 24, easeInOutCubic),
  K(352, 71.5, 11.5, 25, easeInOutSine),
  K(370, 92, 12.5, 23, easeInOutCubic),
  // press in on "Approve"
  K(386, 98.5, 18, 27, easeInOutCubic),
  K(394, 98.5, 18, 27.5, easeInOutSine),
  K(404, 98.5, 15.5, 27.5, easeInOutSine),
  K(418, 50, 22, 20.5, easeInOutCubic),
  K(432, -3, 8, 30, easeInOutCubic),
  K(448, 4, 6, 33, easeInOutSine),
  // press in on "Confirm 2 left the warehouse"
  K(461, 8, 4.8, 41, easeInOutCubic),
  K(468, 8, 4.8, 41.5, easeInOutSine),
  // hold on "2 collected", then follow the units out along the rail
  K(475, 8, 4.6, 41.5, easeInOutSine),
  K(486, 10, 14, 29, easeInOutCubic),
  K(496, 20, 17, 29.5, easeInOutSine),
  K(506, 12, 12, 27, easeInOutSine),
  // product close-up #3 — the 3-seater flagged for reorder
  K(516, 7.9, 21.4, 40, easeInOutQuintK),
  K(526, 11.5, 6, 27, easeInOutCubic),
  K(535, 11.5, 5.5, 27.5, easeInOutSine),
  K(545, 11.5, 5.4, 27.6, easeInOutSine),
  // pull back: the whole journey lights up and is reeled straight home
  K(557, OV[0], OV[1], 12.4, easeInOutQuintK),
  K(571, OV[0], OV[1] + 0.8, 12.25, easeInOutSine),
  K(629, OV[0], OV[1] + 1.4, 12.1, easeOutCubic),
];
export function camAt(f: number): Cam {
  const v = track(CAM, f);
  return { u: v[0]!, v: v[1]!, zoom: Math.exp(v[2]!) };
}

/** Twin visibility outside windows: 0 hidden, ghost ≈ 0.3, 1 full. */
export function twinLevel(f: number) {
  if (f < T.twinOpen) return 0;
  const open = easeOutCubic(prog(f, T.twinOpen, T.twinOpen + 14));
  const ghost = lerp(1, 0.3, easeInOutCubic(prog(f, 112, 130)));
  const end = lerp(1, 1.6, easeInOutCubic(prog(f, T.journey, T.journey + 10))) * (1 - easeInCubic(prog(f, T.retract + 6, T.retract + 16)));
  return open * ghost * end;
}

/** Tilt-shift strength (device-independent px of blur at the frame edges). */
export function blurAt(f: number) {
  return 1.6 + 1.3 * easeInOutSine(prog(f, 56, 76)) * (1 - easeInOutSine(prog(f, 104, 124)));
}

// ── Motion on the app's own instances ─────────────────────────────────────────
const V = new THREE.Vector3();
const ASM_SCALE = 1.45;
export const ASM_END = T.asm0 + 32 * ASM_SCALE; // structure (slab, walls) settled
/** Opening: racks and stock drop into the freshly built twin, back to front, with weight. */
function assemblyPose(a: number, m: InstMeta, kind: Kind): Pose | null {
  if (a >= 60) return null;
  if (kind === "rack") {
    const t0 = (2 + 12 * m.d + 1.5 * m.j) * ASM_SCALE;
    const r = drop(a - t0, 4.5, 6, 0.04, 7);
    return pose(r.dy, r.sy, r.sxz, r.visible);
  }
  const t0 = (8 + 15 * m.d + 3 * m.j) * ASM_SCALE;
  const r = drop(a - t0, 6, 6, 0.17, 9);
  if (kind === "blob") return pose(0, 1, r.visible ? lerp(0.35, 1, 1 - r.dy / 6) : 0, r.visible);
  return pose(r.dy, r.sy, r.sxz, r.visible);
}

export function eventPose(f: number, m: InstMeta, kind: Kind): Pose | null {
  if (f < T.asm0 + 60) {
    const p = assemblyPose(Math.max(-1, f - T.asm0), m, kind);
    if (p) return p;
  }
  if (kind === "rack") return null;
  // delivery DN-2291: the wrapped units lift away once Post to stock is pressed
  if (m.owner === "pending" && f >= T.posted) {
    const t = prog(f, T.posted, T.posted + 9);
    const e = easeInCubic(t);
    if (kind === "blob") return pose(0, 1, 1 - e, t < 1);
    return pose(e * 1.8, 1 - 0.85 * e, 1 - 0.85 * e, t < 1);
  }
  // posted stock lands in C-3-01
  if (m.owner === BAY.receipt && f >= T.chairsLand - 2 && f < T.chairsLand + 22) {
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
  { a: 108, b: 222, idea: "01", head: "Capture stock.", subs: [{ a: 108, text: "Check the delivery. Post it to a bay." }] },
  {
    a: 230,
    b: 494,
    idea: "02",
    head: "Turn inventory into action.",
    subs: [
      { a: 230, text: "Spot stock that isn't selling." },
      { a: 292, text: "Hand it to sales. Compare carrier quotes." },
      { a: 372, text: "The owner approves. Stock is reserved." },
      { a: 434, text: "Confirm the collection. The bay is freed." },
    ],
  },
  { a: 500, b: 547, idea: "03", head: "Make better decisions.", subs: [{ a: 500, text: "Reorders come with their arithmetic." }] },
];
export const FOOT = [
  { a: 64, b: 120, text: "Real WareOrb 3D twin · seeded demo data" },
  { a: 120, b: 320, text: "Real WareOrb UI · seeded demo data" },
  { a: 320, b: 500, text: "Real WareOrb UI · synthetic carrier quotes · simulated booking" },
  { a: 500, b: 556, text: "Real WareOrb UI · seeded demo data" },
];
export const END = {
  word: "WareOrb",
  tag: "Every move, one live ledger.",
  credit: "WareOrb — by Team Bababoi",
  foot: "Hackathon prototype · real WareOrb UI · seeded demo data",
};

/** Event list for the score / sound design (frame, kind). */
export function cues() {
  return [
    { f: T.markStart, k: "draw", d: T.markDone - T.markStart },
    { f: T.morph0, k: "whoosh", d: T.morph1 - T.morph0 },
    { f: T.asm0, k: "assemble", d: 48 },
    { f: T.dockClose, k: "close" },
    { f: T.rcptClose, k: "card" },
    { f: T.tick, k: "tick" },
    { f: T.pressPost, k: "press" },
    { f: T.posted, k: "lift" },
    { f: T.chairsLand, k: "land" },
    { f: T.bayClose, k: "close" },
    { f: 214, k: "zoom" },
    { f: T.ageLock, k: "lock" },
    { f: T.ageClose, k: "lock" },
    { f: 246, k: "zoom" },
    { f: T.ageCardClose, k: "card" },
    { f: T.pressHand, k: "press" },
    { f: T.pin, k: "pin" },
    { f: T.quotesClose, k: "card" },
    { f: T.lowest, k: "close" },
    { f: T.apprClose, k: "card" },
    { f: T.pressApprove, k: "press" },
    { f: T.reservedClose, k: "close" },
    { f: T.collClose, k: "card" },
    { f: T.pressConfirm, k: "press" },
    { f: T.leaveStart, k: "rail", d: T.leaveEnd - T.leaveStart },
    { f: T.freed, k: "freed" },
    { f: T.reorderClose, k: "close" },
    { f: 516, k: "zoom" },
    { f: T.repClose, k: "card" },
    { f: T.retract, k: "reel", d: T.markClose - T.retract },
    { f: T.markClose, k: "fill" },
    { f: T.credit, k: "credit" },
  ];
}
