// One continuous line. Segments are appended end-to-start, so the stroke never breaks.
// The drawing tip slows at corners and speeds along straights (time is warped by corner sharpness),
// keeps a constant width with round caps, and carries a small glowing point the eye follows.
import type { Cam, UV } from "./plane";
import { toScreen } from "./plane";

export interface Seg {
  id: string;
  /** Plane points; a function for segments whose shape changes over time (morphs). */
  pts: UV[] | ((f: number) => UV[]);
  f0: number;
  f1: number;
  color: string;
  /** Optional time-warp table (0..1 time → 0..1 arc length), built from the rest shape. */
  warp?: Float32Array;
  ease?: (t: number) => number;
  /** Never erased by the final retraction (the mark outline). */
  keep?: boolean;
  /** Drawn thinner/softer (inner details). */
  weight?: number;
  /** Part of the stock's physical journey (lights up in the final pull-back). */
  journey?: boolean;
}

const dist = (a: UV, b: UV) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function cumLen(p: UV[]) {
  const c = new Float32Array(p.length);
  for (let i = 1; i < p.length; i++) c[i] = c[i - 1]! + dist(p[i - 1]!, p[i]!);
  return c;
}

/** Arc-length resampling to n points. */
export function resample(p: UV[], n: number): UV[] {
  const c = cumLen(p);
  const L = c[c.length - 1]!;
  const out: UV[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (j < p.length - 1 && c[j]! < s) j++;
    const a = p[j - 1]!;
    const b = p[j]!;
    const seg = c[j]! - c[j - 1]! || 1;
    const t = Math.min(1, Math.max(0, (s - c[j - 1]!) / seg));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Time-warp so the tip slows down through sharp corners (natural hand movement). */
export function buildWarp(p: UV[], cornerSlow = 2.6, radius = 0.9): Float32Array {
  const q = resample(p, Math.max(24, Math.min(600, Math.round(cumLen(p)[p.length - 1]! * 6))));
  const c = cumLen(q);
  const turn = new Float32Array(q.length);
  for (let i = 1; i < q.length - 1; i++) {
    const a = q[i - 1]!;
    const b = q[i]!;
    const d = q[i + 1]!;
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [d[0] - b[0], d[1] - b[1]];
    const nu = Math.hypot(u[0]!, u[1]!) || 1;
    const nv = Math.hypot(v[0]!, v[1]!) || 1;
    const cos = (u[0]! * v[0]! + u[1]! * v[1]!) / (nu * nv);
    turn[i] = Math.acos(Math.max(-1, Math.min(1, cos)));
  }
  // slowness density along the path
  const w = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) {
    let s = 1;
    for (let k = Math.max(1, i - 40); k < Math.min(q.length - 1, i + 40); k++) {
      if (turn[k]! < 0.05) continue;
      const d = Math.abs(c[i]! - c[k]!);
      s += cornerSlow * Math.min(1, turn[k]! * 1.2) * Math.exp(-(d * d) / (radius * radius)) * 0.35;
    }
    w[i] = s;
  }
  const time = new Float32Array(q.length);
  for (let i = 1; i < q.length; i++) time[i] = time[i - 1]! + (c[i]! - c[i - 1]!) * (w[i]! + w[i - 1]!) * 0.5;
  const T = time[q.length - 1]! || 1;
  const L = c[q.length - 1]! || 1;
  // table: 64 time samples → arc fraction
  const tab = new Float32Array(65);
  let j = 0;
  for (let k = 0; k <= 64; k++) {
    const t = (k / 64) * T;
    while (j < q.length - 1 && time[j + 1]! < t) j++;
    const span = time[j + 1]! - time[j]! || 1;
    const a = c[j]! + (c[j + 1]! - c[j]!) * Math.min(1, (t - time[j]!) / span);
    tab[k] = a / L;
  }
  tab[64] = 1;
  return tab;
}

const warpAt = (tab: Float32Array, t: number) => {
  const x = Math.min(64, Math.max(0, t * 64));
  const i = Math.floor(x);
  const r = x - i;
  return i >= 64 ? tab[64]! : tab[i]! + (tab[i + 1]! - tab[i]!) * r;
};

export interface LineState {
  tip: UV | null;
  tipColor: string;
  /** Plane-space polylines currently visible (after drawing progress and retraction). */
  visible: { seg: Seg; pts: UV[] }[];
}

/** Partial polyline from arc length a to b. */
function slice(p: UV[], c: Float32Array, a: number, b: number): UV[] {
  if (b <= a) return [];
  const out: UV[] = [];
  const at = (s: number): UV => {
    let j = 1;
    while (j < p.length - 1 && c[j]! < s) j++;
    const seg = c[j]! - c[j - 1]! || 1;
    const t = Math.min(1, Math.max(0, (s - c[j - 1]!) / seg));
    const A = p[j - 1]!;
    const B = p[j]!;
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
  };
  out.push(at(a));
  for (let i = 0; i < p.length; i++) if (c[i]! > a && c[i]! < b) out.push(p[i]!);
  out.push(at(b));
  return out;
}

export function lineAt(segs: Seg[], f: number, retract: number /* 0..1 of erasable length */): LineState {
  const visible: LineState["visible"] = [];
  let tip: UV | null = null;
  let tipColor = "#8db1f3";
  // total erasable drawn length (for retraction)
  const geo = segs.map((s) => {
    const p = typeof s.pts === "function" ? s.pts(f) : s.pts;
    return { p, c: cumLen(p) };
  });
  let erasable = 0;
  const drawn: number[] = [];
  segs.forEach((s, i) => {
    const L = geo[i]!.c[geo[i]!.p.length - 1]!;
    let d = 0;
    if (f >= s.f1) d = 1;
    else if (f > s.f0) {
      const t = (f - s.f0) / (s.f1 - s.f0);
      const e = (s.ease ?? ((x: number) => x))(t);
      d = s.warp ? warpAt(s.warp, e) : e;
    }
    drawn.push(d * L);
    if (!s.keep) erasable += d * L;
  });
  let erase = retract * erasable;
  segs.forEach((s, i) => {
    const { p, c } = geo[i]!;
    const len = drawn[i]!;
    if (len <= 0) return;
    let a = 0;
    if (!s.keep && erase > 0) {
      const cut = Math.min(len, erase);
      a = cut;
      erase -= cut;
    }
    if (len > a + 1e-4) visible.push({ seg: s, pts: slice(p, c, a, len) });
    if (len > 0) {
      const end = slice(p, c, Math.max(0, len - 1e-3), len);
      tip = end[end.length - 1] ?? tip;
      tipColor = s.color;
    }
  });
  return { tip, tipColor, visible };
}

/** Draw the line + tip onto a 2D canvas (CSS px coordinates; ctx already scaled for DPR). */
export function drawLine(ctx: CanvasRenderingContext2D, cam: Cam, st: LineState, opts: { width: number; tipAlpha: number; ageFade: (seg: Seg) => number }) {
  for (const { seg, pts } of st.visible) {
    if (pts.length < 2) continue;
    const a = opts.ageFade(seg);
    const w = opts.width * (seg.weight ?? 1);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = toScreen(cam, p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // soft bloom under the stroke
    ctx.globalAlpha = 0.22 * a;
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = w * 3.2;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (st.tip && opts.tipAlpha > 0) {
    const [x, y] = toScreen(cam, st.tip);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * opts.tipAlpha})`);
    g.addColorStop(0.18, `rgba(220,232,255,${0.85 * opts.tipAlpha})`);
    g.addColorStop(0.45, hexA(st.tipColor, 0.32 * opts.tipAlpha));
    g.addColorStop(1, hexA(st.tipColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}
