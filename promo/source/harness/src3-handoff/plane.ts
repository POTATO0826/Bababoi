// The picture plane of the app's true-isometric camera. Every element of the film — the 3D twin, the line,
// the UI cards and the grid — lives in this one plane, so a single 2D camera (pan + zoom) moves them together
// and the line can trace the real 3D geometry exactly.
import type { Shot } from "../src/cam";

export type UV = [number, number];
export type W3 = [number, number, number];
export const W = 1920;
export const H = 1080;

const S45 = Math.SQRT1_2;
const SE = 1 / Math.sqrt(3); // sin(iso elevation)
const CE = Math.sqrt(2 / 3); // cos(iso elevation)

/** World (m) → plane (m). Matches src/cam.ts `project` for azimuth 45°. */
export function toPlane([x, y, z]: W3): UV {
  return [S45 * (x - z), SE * S45 * (x + z) - CE * y];
}

export interface Cam {
  u: number;
  v: number;
  zoom: number; // px per metre
}

export const toScreen = (c: Cam, [u, v]: UV): UV => [(u - c.u) * c.zoom + W / 2, (v - c.v) * c.zoom + H / 2];
export const worldToScreen = (c: Cam, p: W3) => toScreen(c, toPlane(p));

/** The R3F camera shot that shows plane point (c.u, c.v) at the frame centre. */
export function shotOf(c: Cam): Shot {
  const a = c.u / S45; // x − z
  const b = c.v / (SE * S45); // x + z  (on y = 0)
  return { focus: [(a + b) / 2, 0, (b - a) / 2], sx: W / 2, sy: H / 2, zoom: c.zoom };
}
