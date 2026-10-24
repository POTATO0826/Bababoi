// The app's true-isometric orthographic camera (src/scene/camera-rig.tsx: azimuth 45°, elevation asin(1/√3)),
// driven by explicit per-frame parameters instead of the interactive rig.
import * as THREE from "three";

export const W = 1920;
export const H = 1080;
export const ISO_EL = Math.asin(1 / Math.sqrt(3));
export const ISO_AZ = Math.PI / 4;
const DIST = 300;

export interface Shot {
  /** World point that should sit at screen position (sx, sy). */
  focus: [number, number, number];
  sx: number;
  sy: number;
  /** Ortho zoom: pixels per metre. */
  zoom: number;
  az?: number;
}

export function basis(az = ISO_AZ, el = ISO_EL) {
  const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
  const up = new THREE.Vector3(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az));
  return { right, up };
}

export function targetFor(s: Shot) {
  const az = s.az ?? ISO_AZ;
  const { right, up } = basis(az);
  const f = new THREE.Vector3(...s.focus);
  // screen x = W/2 + dot(p − target, right)·zoom ; screen y = H/2 − dot(p − target, up)·zoom
  return f.addScaledVector(right, -(s.sx - W / 2) / s.zoom).addScaledVector(up, (s.sy - H / 2) / s.zoom);
}

/** Base projection (no click-zoom): world → CSS pixels of the 1920×1080 frame. */
export function project(s: Shot, p: [number, number, number]): [number, number] {
  const az = s.az ?? ISO_AZ;
  const { right, up } = basis(az);
  const t = targetFor(s);
  const d = new THREE.Vector3(...p).sub(t);
  return [W / 2 + d.dot(right) * s.zoom, H / 2 - d.dot(up) * s.zoom];
}

/**
 * Apply the shot to the R3F camera, plus a "click zoom" (scale `z` about frame point px,py) done as a view
 * offset, so the 3D is re-rendered sharp instead of being upscaled.
 */
export function applyShot(camera: THREE.OrthographicCamera, s: Shot, click: { z: number; px: number; py: number }) {
  const az = s.az ?? ISO_AZ;
  const el = ISO_EL;
  const t = targetFor(s);
  const ce = Math.cos(el);
  camera.position.set(t.x + DIST * ce * Math.sin(az), t.y + DIST * Math.sin(el), t.z + DIST * ce * Math.cos(az));
  camera.up.set(0, 1, 0);
  camera.lookAt(t);
  camera.zoom = s.zoom;
  camera.left = -W / 2;
  camera.right = W / 2;
  camera.top = H / 2;
  camera.bottom = -H / 2;
  if (click.z > 1.0001) {
    const w = W / click.z;
    const h = H / click.z;
    camera.setViewOffset(W, H, click.px * (1 - 1 / click.z), click.py * (1 - 1 / click.z), w, h);
  } else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
