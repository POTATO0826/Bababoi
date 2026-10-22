import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { FLOOR_D, FLOOR_W, ZONES, type Rect } from "@/data/layout";
import { getWare, setWare } from "@/store";

// True isometric: camera along (1,1,1) — azimuth 45°, elevation asin(1/√3) ≈ 35.26°.
const ISO_EL = Math.asin(1 / Math.sqrt(3));
const TOP_EL = Math.PI / 2;
const DIST = 300;
/** Width of the Details popup + its margins, kept clear when framing. */
const PANEL_W = 344;
/** Jarvis drawer (fixed, under 980px wide) overlapping the viewport. */
const DRAWER_W = 352;

/** Current (eased) camera angles, read by the walls for the cutaway. */
export const rig = { az: Math.PI / 4, el: ISO_EL };

const damp = (cur: number, goal: number, lambda: number, dt: number) => cur + (goal - cur) * (1 - Math.exp(-lambda * dt));

const v3 = new THREE.Vector3();

/** Fit a box (rect × [y0, y1]) into the available screen area for a camera at (az, el). */
function frame(rect: Rect, y0: number, y1: number, az: number, el: number, availW: number, availH: number, factor: number) {
  const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
  const up = new THREE.Vector3(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az));
  const [x0, z0, x1, z1] = rect;
  const origin = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [x0, x1])
    for (const z of [z0, z1])
      for (const y of [y0, y1]) {
        v3.set(x, y, z).sub(origin);
        const sx = v3.dot(right);
        const sy = v3.dot(up);
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
  const zoom = Math.min(availW / (maxX - minX), availH / (maxY - minY)) * factor;
  const target = origin
    .addScaledVector(right, (minX + maxX) / 2)
    .addScaledVector(up, (minY + maxY) / 2);
  return { target, zoom, right };
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const cur = useRef<{ az: number; el: number; target: THREE.Vector3; zoom: number } | null>(null);
  const spinClock = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = getWare();

    // Optional auto-spin while idle in the overview.
    if (s.settings.autoSpin && !s.zone && !s.dragging && !s.hoverBay && !s.fading) {
      spinClock.current += dt;
      if (spinClock.current > 0.04) {
        setWare({ theta: s.theta + 0.14 * spinClock.current });
        spinClock.current = 0;
      }
    }

    const top = s.view === "top";
    const goalAz = (top ? 0 : Math.PI / 4) + s.theta;
    const goalEl = top ? TOP_EL : ISO_EL;

    // Keep clear whatever covers the right of the viewport: the Details popup, or the Jarvis drawer (<980px).
    const drawer = s.agentOpen && window.innerWidth < 980 ? DRAWER_W : 0;
    const panel = s.panelOpen && size.width > 720 ? PANEL_W : 0;
    const reserve = size.width - Math.max(drawer, panel) > 240 ? Math.max(drawer, panel) : 0;
    const availW = Math.max(120, size.width - reserve - 24);
    const availH = Math.max(120, size.height - 104);
    const f = s.zone
      ? frame(ZONES[s.zone], 0, 3, goalAz, goalEl, availW, availH, 0.9)
      : frame([0, 0, FLOOR_W, FLOOR_D], -1.6, 2.4, goalAz, goalEl, availW, availH, 1.0);
    const goalZoom = f.zoom * s.zoomMul;
    // Centre the framed area in the space that's left.
    const goalTarget = f.target.addScaledVector(f.right, reserve / 2 / goalZoom);

    if (!cur.current) cur.current = { az: goalAz, el: goalEl, target: goalTarget.clone(), zoom: goalZoom };
    const c = cur.current;
    c.az = damp(c.az, goalAz, s.dragging ? 16 : 7, dt);
    c.el = damp(c.el, goalEl, 5, dt);
    c.target.x = damp(c.target.x, goalTarget.x, 5.5, dt);
    c.target.y = damp(c.target.y, goalTarget.y, 5.5, dt);
    c.target.z = damp(c.target.z, goalTarget.z, 5.5, dt);
    c.zoom = Math.exp(damp(Math.log(c.zoom), Math.log(goalZoom), 5.5, dt));
    rig.az = c.az;
    rig.el = c.el;

    const ce = Math.cos(c.el);
    camera.position.set(
      c.target.x + DIST * ce * Math.sin(c.az),
      c.target.y + DIST * Math.sin(c.el),
      c.target.z + DIST * ce * Math.cos(c.az),
    );
    // Horizontal "away" vector as up: identical to world-up when tilted, still valid straight down.
    camera.up.set(-Math.sin(c.az), 0, -Math.cos(c.az));
    camera.lookAt(c.target);
    if (Math.abs(camera.zoom - c.zoom) > 1e-4) {
      camera.zoom = c.zoom;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
