// Pure, frame-based easing helpers. Everything in the promo is a function of the frame number.
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const prog = (f: number, a: number, b: number) => clamp((f - a) / (b - a));

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
/** Controlled overshoot, for objects that land with a little weight. */
export const easeOutBack = (t: number, s = 1.2) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Under-damped spring response 0→1 (t in seconds). */
export function spring(t: number, freq = 2.2, damping = 0.55) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const wd = w * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
}

/**
 * A falling object under gravity that lands, compresses and settles.
 * Returns the vertical offset (m) and a squash factor (1 = rest) for a local time `t` in frames.
 */
export function drop(t: number, height: number, fallFrames: number, squash = 0.16, settleFrames = 8) {
  if (t <= 0) return { dy: height, sy: 1, sxz: 1, visible: false };
  if (t < fallFrames) {
    const u = t / fallFrames;
    // y = h (1 − u²): accelerating fall; slight stretch while falling fast
    return { dy: height * (1 - u * u), sy: 1 + 0.05 * u, sxz: 1 - 0.02 * u, visible: true };
  }
  const s = (t - fallFrames) / settleFrames;
  if (s >= 1) return { dy: 0, sy: 1, sxz: 1, visible: true };
  // impact: damped oscillation of the squash, plus a tiny rebound
  const osc = Math.exp(-4.2 * s) * Math.cos(s * Math.PI * 2.6);
  const sy = 1 - squash * osc;
  const sxz = 1 + squash * 0.45 * osc;
  const dy = Math.max(0, Math.sin(s * Math.PI * 2.6) * Math.exp(-5 * s) * height * 0.025);
  return { dy, sy, sxz, visible: true };
}

/** Piecewise keyframe track with per-segment easing. Values are numbers or number arrays. */
export type Key<T> = { f: number; v: T; e?: (t: number) => number };
export function track<T extends number | number[]>(keys: Key<T>[], f: number): T {
  if (f <= keys[0]!.f) return keys[0]!.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (f <= b.f) {
      const t = (b.e ?? easeInOutCubic)(prog(f, a.f, b.f));
      if (typeof a.v === "number") return lerp(a.v, b.v as number, t) as T;
      return (a.v as number[]).map((x, k) => lerp(x, (b.v as number[])[k]!, t)) as T;
    }
  }
  return keys[keys.length - 1]!.v;
}

/** Deterministic 0..1 hash. */
export function hash01(n: number) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}
