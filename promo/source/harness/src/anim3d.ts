// Per-frame motion layered on top of the app's real scene graph, without changing the app's code:
// we read the instance matrices the app built, remember them as "rest", and write animated copies.
import * as THREE from "three";
import type { Bay } from "@/data/inventory";
import { AREAS } from "@/data/layout";
import { clamp, drop, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, hash01, prog, lerp } from "./ease";

type Kind = "furniture" | "rack" | "blob" | "outline";
interface InstMeta {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  owner: string;
  d: number; // assembly order 0..1 (back → front)
  j: number; // jitter 0..1
}
interface InstRec {
  mesh: THREE.InstancedMesh;
  kind: Kind;
  count: number;
  metas: InstMeta[];
}
interface MeshRec {
  obj: THREE.Object3D;
  baseY: number;
  baseScale: THREE.Vector3;
  minY: number;
  d: number;
  kind: "slab" | "grow" | "flat";
}
interface FadeRec {
  mat: THREE.Material & { opacity: number };
  base: number;
  d: number;
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const box = new THREE.Box3();
const center = new THREE.Vector3();

export interface Events {
  /** Bay ids (slot ids) by role in the story. */
  receiptBay: string; // C-3-01
  dispatchBay: string; // A-1-01
}

export class SceneAnimator {
  inst = new Map<string, InstRec>();
  meshes: MeshRec[] = [];
  fades: FadeRec[] = [];
  indexedStructure = false;
  bays: readonly Bay[] = [];

  ownerOf(x: number, z: number) {
    for (const b of this.bays) {
      const [x0, z0, x1, z1] = b.rect;
      if (x >= x0 - 0.6 && x <= x1 + 0.6 && z >= z0 - 0.6 && z <= z1 + 0.6) return b.id;
    }
    const [ix0, , ix1] = AREAS.inbound;
    if (x >= ix0 && x <= ix1 && z < 8) return "pending";
    return "";
  }

  static order(x: number, z: number) {
    // back (far from the camera, small x+z) → front
    return clamp((x + z - 8) / 150);
  }

  /** (Re)index instanced meshes whose identity or count changed since the last frame. */
  index(groups: { structure: THREE.Object3D; furniture: THREE.Object3D; bays: THREE.Object3D }, bays: readonly Bay[]) {
    this.bays = bays;
    const seen = new Set<string>();
    const visit = (root: THREE.Object3D, kindOf: (m: THREE.InstancedMesh) => Kind) => {
      root.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (!m.isInstancedMesh) return;
        seen.add(m.uuid);
        const kind = kindOf(m);
        // The app rewrites selection outlines itself; they are never animated here.
        if (kind === "outline") return;
        const prev = this.inst.get(m.uuid);
        // Outline instances are rewritten by the app whenever selection changes; re-read them every frame.
        if (prev && prev.count === m.count && kind !== "outline") return;
        const metas: InstMeta[] = [];
        for (let i = 0; i < m.count; i++) {
          m.getMatrixAt(i, tmpM);
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          tmpM.decompose(pos, quat, scale);
          if (prev && kind !== "outline" && prev.metas[i]) {
            metas.push(prev.metas[i]!);
            continue;
          }
          metas.push({ pos, quat, scale, owner: this.ownerOf(pos.x, pos.z), d: SceneAnimator.order(pos.x, pos.z), j: hash01(i * 7919 + m.count) });
        }
        this.inst.set(m.uuid, { mesh: m, kind, count: m.count, metas });
      });
    };
    visit(groups.furniture, (m) => {
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      if ((mat as THREE.MeshBasicMaterial).side === THREE.BackSide) return "outline";
      if (mat.map && m.geometry.type === "PlaneGeometry") return "blob";
      return "furniture";
    });
    visit(groups.structure, () => "rack");
    for (const k of [...this.inst.keys()]) if (!seen.has(k)) this.inst.delete(k);

    if (!this.indexedStructure) {
      this.indexedStructure = true;
      const addFades = (root: THREE.Object3D) =>
        root.traverse((o) => {
          const mm = o as THREE.Mesh;
          if (!mm.isMesh || (mm as unknown as THREE.InstancedMesh).isInstancedMesh) return;
          box.setFromObject(mm);
          box.getCenter(center);
          const mats = (Array.isArray(mm.material) ? mm.material : [mm.material]) as (THREE.Material & { opacity: number })[];
          const flat = box.max.y - box.min.y < 0.25 && box.min.y > -0.5;
          const big = box.max.x - box.min.x > 60;
          if (big && box.min.y < -0.1) {
            this.meshes.push({ obj: mm, baseY: mm.position.y, baseScale: mm.scale.clone(), minY: box.min.y, d: 0, kind: "slab" });
          } else if (flat) {
            for (const mat of mats) if (mat.transparent) this.fades.push({ mat, base: mat.opacity, d: SceneAnimator.order(center.x, center.z) });
            else this.meshes.push({ obj: mm, baseY: mm.position.y, baseScale: mm.scale.clone(), minY: box.min.y, d: SceneAnimator.order(center.x, center.z), kind: "flat" });
          } else if (box.min.y > -0.5) {
            this.meshes.push({ obj: mm, baseY: mm.position.y, baseScale: mm.scale.clone(), minY: box.min.y, d: SceneAnimator.order(center.x, center.z), kind: "grow" });
          } else if (box.min.y <= -0.5 && !big) {
            // ground-shadow plane under the slab etc.
            for (const mat of mats) if (mat.transparent) this.fades.push({ mat, base: mat.opacity, d: 0 });
          }
        });
      addFades(groups.structure);
      // bay pads / zone lines are recreated by React on state changes; they are faded only during the hook.
    }
  }

  /** Hook: the warehouse assembles (frames 0–30). Returns true if anything is still moving. */
  assemble(f: number, baysGroup: THREE.Object3D) {
    if (f >= 32) return false;
    // slab rises with weight
    for (const r of this.meshes) {
      if (r.kind === "slab") {
        const t = easeOutBack(prog(f, 0, 11), 0.6);
        r.obj.position.y = r.baseY - (1 - t) * 3.2;
      } else if (r.kind === "grow") {
        const s = clamp(easeOutBack(prog(f, 3 + 11 * r.d, 11 + 11 * r.d), 1.1), 0, 1.06);
        const k = Math.max(0.0001, s);
        r.obj.scale.set(r.baseScale.x, r.baseScale.y * k, r.baseScale.z);
        // keep the base on the floor while growing
        r.obj.position.y = r.minY + (r.baseY - r.minY) * k;
        r.obj.visible = s > 0.001;
      } else {
        r.obj.visible = f >= 3 + 12 * r.d;
      }
    }
    for (const fd of this.fades) fd.mat.opacity = fd.base * easeOutCubic(prog(f, 3 + 12 * fd.d, 10 + 12 * fd.d));
    baysGroup.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      const mat = mm.material as THREE.Material & { opacity: number; userData: { base?: number } };
      if (!mat.transparent) return;
      if (mat.userData.base === undefined) mat.userData.base = mat.opacity;
      box.setFromObject(mm);
      box.getCenter(center);
      const d = SceneAnimator.order(center.x, center.z);
      mat.opacity = mat.userData.base * easeOutCubic(prog(f, 6 + 12 * d, 13 + 12 * d));
    });
    return true;
  }

  restoreStatic() {
    for (const r of this.meshes) {
      r.obj.position.y = r.baseY;
      r.obj.scale.copy(r.baseScale);
      r.obj.visible = true;
    }
    for (const fd of this.fades) fd.mat.opacity = fd.base;
  }

  restoreBays(baysGroup: THREE.Object3D) {
    baysGroup.traverse((o) => {
      const mm = o as THREE.Mesh;
      const mat = mm.material as (THREE.Material & { opacity: number; userData: { base?: number } }) | undefined;
      if (mat && mat.userData?.base !== undefined) {
        mat.opacity = mat.userData.base;
        delete mat.userData.base;
      }
    });
  }

  /**
   * Write every instance for frame f. `fx` returns a per-instance transform (offset, squash, visibility) or null
   * for rest pose.
   */
  writeInstances(fx: (meta: InstMeta, kind: Kind) => Pose | null) {
    for (const rec of this.inst.values()) {
      const { mesh, metas, kind } = rec;
      let dirty = false;
      for (let i = 0; i < metas.length; i++) {
        const m = metas[i]!;
        const p = fx(m, kind);
        if (!p) {
          tmpM.compose(m.pos, m.quat, m.scale);
        } else {
          tmpP.copy(m.pos).add(p.offset);
          tmpS.copy(m.scale).multiply(p.scale);
          if (!p.visible) tmpS.setScalar(0);
          tmpQ.copy(m.quat);
          if (p.rotY) tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY));
          tmpM.compose(tmpP, tmpQ, tmpS);
        }
        mesh.setMatrixAt(i, tmpM);
        dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

export interface Pose {
  offset: THREE.Vector3;
  scale: THREE.Vector3;
  visible: boolean;
  rotY?: number;
}

const pose = (dy: number, sy = 1, sxz = 1, visible = true, dx = 0, dz = 0, rotY = 0): Pose => ({
  offset: new THREE.Vector3(dx, dy, dz),
  scale: new THREE.Vector3(sxz, sy, sxz),
  visible,
  rotY,
});

/** Assembly pose for an instance during the hook. */
export function assemblyPose(f: number, m: InstMeta, kind: Kind): Pose | null {
  if (f >= 32) return null;
  if (kind === "rack") {
    const t0 = 2 + 12 * m.d + m.j * 1.5;
    const r = drop(f - t0, 4.5, 5, 0.04, 6);
    return pose(r.dy, r.sy, r.sxz, r.visible);
  }
  const t0 = 8 + 15 * m.d + m.j * 3;
  const r = drop(f - t0, 6, 5, 0.17, 8);
  if (kind === "blob") {
    const s = r.visible ? lerp(0.35, 1, 1 - r.dy / 6) : 0;
    return pose(0, 1, s, r.visible);
  }
  return pose(r.dy, r.sy, r.sxz, r.visible);
}

export { easeInCubic, easeInOutCubic, easeOutCubic, prog, clamp, lerp, drop, pose };
export type { InstMeta, Kind };
