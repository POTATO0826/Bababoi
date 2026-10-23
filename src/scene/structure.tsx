import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { FloorId } from "@/shared/contracts";
import { AREAS, BAY_GAP, FLOOR_D, FLOOR_W, LIFT_H, LIFTS, RACK_ROWS, type Rect } from "@/data/layout";
import { rig } from "./camera-rig";
import { pendingRect } from "./furniture/placements";

const SLAB_H = 1.6;
export const WALL_H = 3.4;
const WALL_LOW = 0.32;
const WALL_T = 0.35;

/** Flat painted rectangle on the floor. */
export function FloorPaint({ rect, y = 0.01, color, opacity = 1 }: { rect: Rect; y?: number; color: string; opacity?: number }) {
  const [x0, z0, x1, z1] = rect;
  return (
    <mesh position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function rectLoop(rect: Rect, y: number): [number, number, number][] {
  const [x0, z0, x1, z1] = rect;
  return [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
    [x0, y, z0],
  ];
}

export function DashedRect({ rect, y = 0.02, color, width = 1, opacity = 1 }: { rect: Rect; y?: number; color: string; width?: number; opacity?: number }) {
  const points = useMemo(() => rectLoop(rect, y), [rect, y]);
  return (
    <Line
      points={points}
      color={color}
      lineWidth={width}
      dashed
      dashSize={0.9}
      gapSize={0.6}
      transparent
      opacity={opacity}
      depthWrite={false}
      toneMapped={false}
      renderOrder={2}
    />
  );
}

/** Tiling concrete texture: speckle noise and a faint 5 m grid of expansion joints. */
function useConcreteTexture() {
  return useMemo(() => {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = "#808080";
    g.fillRect(0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() - 0.5) * 22;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    // soft blotches
    for (let i = 0; i < 40; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 30 + rnd() * 90;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.04 + rnd() * 0.05;
      grad.addColorStop(0, rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    }
    // joint lines on the tile edge (tile = 5 m)
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, size, 2);
    g.fillRect(0, 0, 2, size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(FLOOR_W / 5, FLOOR_D / 5);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, []);
}

/** Soft dark ellipse under the slab so the floor sits in space. */
function useGroundShadowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,0,0,0.75)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.35)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
}

function Slab() {
  const concrete = useConcreteTexture();
  const ground = useGroundShadowTexture();
  return (
    <group>
      <mesh position={[FLOOR_W / 2, -SLAB_H - 0.02, FLOOR_D / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[FLOOR_W * 1.5, FLOOR_D * 1.6]} />
        <meshBasicMaterial map={ground} transparent depthWrite={false} />
      </mesh>
      <mesh position={[FLOOR_W / 2, -SLAB_H / 2, FLOOR_D / 2]} receiveShadow>
        <boxGeometry args={[FLOOR_W, SLAB_H, FLOOR_D]} />
        {/* +x, -x, +y, -y, +z, -z */}
        <meshStandardMaterial attach="material-0" color="#0f0f14" roughness={0.9} />
        <meshStandardMaterial attach="material-1" color="#0f0f14" roughness={0.9} />
        <meshStandardMaterial attach="material-2" color="#24242b" map={concrete} roughness={0.93} metalness={0} />
        <meshStandardMaterial attach="material-3" color="#09090b" />
        <meshStandardMaterial attach="material-4" color="#121218" roughness={0.9} />
        <meshStandardMaterial attach="material-5" color="#121218" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Painted aisles, docks, staging and wayfinding (docs/design-handoff.md → Geometry). */
function Markings() {
  const chevrons = useMemo(() => {
    // Arrows down the central aisle toward the docks.
    const out: Rect[] = [];
    for (let z = 58; z > 14; z -= 8) out.push([49.4, z, 50.6, z + 0.25]);
    return out;
  }, []);
  return (
    <group>
      <FloorPaint rect={AREAS.walkway} color="#ffffff" opacity={0.035} />
      <FloorPaint rect={AREAS.centralAisle} color="#ffffff" opacity={0.035} />
      <FloorPaint rect={AREAS.crossAisle} color="#ffffff" opacity={0.03} />
      <FloorPaint rect={AREAS.inbound} color="#4f8bea" opacity={0.07} />
      <FloorPaint rect={AREAS.outbound} color="#e3bd78" opacity={0.07} />
      <FloorPaint rect={AREAS.inboundLine} y={0.015} color="#e3bd78" opacity={0.6} />
      <FloorPaint rect={AREAS.outboundLine} y={0.015} color="#e3bd78" opacity={0.6} />
      <FloorPaint rect={AREAS.staging} color="#ffffff" opacity={0.025} />
      <DashedRect rect={AREAS.inbound} color="#52525b" />
      <DashedRect rect={AREAS.outbound} color="#52525b" />
      <DashedRect rect={AREAS.staging} color="#52525b" />
      {/* safety lines along the aisles */}
      {(
        [
          [46, 10, 46.12, 32],
          [53.88, 10, 54, 32],
          [46, 38, 46.12, 62],
          [53.88, 38, 54, 62],
          [0, 32, 46, 32.12],
          [54, 32, 100, 32.12],
          [0, 37.88, 46, 38],
          [54, 37.88, 100, 38],
        ] as Rect[]
      ).map((r, i) => (
        <FloorPaint key={i} rect={r} y={0.012} color="#e3bd78" opacity={0.22} />
      ))}
      {chevrons.map((r, i) => (
        <group key={i}>
          <FloorPaint rect={[r[0] - 0.9, r[1], r[0] + 0.3, r[3]]} y={0.012} color="#ffffff" opacity={0.06} />
          <FloorPaint rect={[r[2] - 0.3, r[1], r[2] + 0.9, r[3]]} y={0.012} color="#ffffff" opacity={0.06} />
        </group>
      ))}
    </group>
  );
}

/** Pending delivery footprint in the receiving dock (amber, awaiting verification). */
function PendingMark({ rect }: { rect: Rect }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const a = 0.55 + 0.35 * Math.sin(clock.elapsedTime * 2.2);
    g.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (mat && "opacity" in mat) mat.opacity = a;
    });
  });
  return (
    <group ref={ref}>
      <DashedRect rect={rect} y={0.025} color="#e3bd78" width={1.2} />
    </group>
  );
}

// ── Racking ───────────────────────────────────────────────────────────────

const RACK_H = 2.55;

function Racks() {
  const { uprights, beams } = useMemo(() => {
    const ups: THREE.Matrix4[] = [];
    const bms: THREE.Matrix4[] = [];
    const m = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    for (const row of RACK_ROWS) {
      const [x0, z0, x1, z1] = row.rect;
      const back = z0 - 0.42;
      const front = z1 + 0.42;
      const xs: number[] = [x0 - BAY_GAP / 2];
      for (let x = x0 - BAY_GAP / 2; x < x1; ) {
        x += 5.8 + BAY_GAP;
        xs.push(Math.min(x, x1 + BAY_GAP / 2));
      }
      for (const x of xs) {
        ups.push(m(x, RACK_H / 2, back, 0.1, RACK_H, 0.1));
        ups.push(m(x, RACK_H / 2, front, 0.1, RACK_H, 0.1));
        // side frame: top tie and diagonal-ish mid tie
        bms.push(m(x, RACK_H - 0.05, (back + front) / 2, 0.06, 0.08, front - back));
        bms.push(m(x, 0.35, (back + front) / 2, 0.05, 0.05, front - back));
        // floor foot plates
        ups.push(m(x, 0.01, back, 0.2, 0.02, 0.2));
        ups.push(m(x, 0.01, front, 0.2, 0.02, 0.2));
      }
      const span = xs[xs.length - 1]! - xs[0]!;
      const mid = (xs[0]! + xs[xs.length - 1]!) / 2;
      // Open-fronted frames: beams along the back only, so stock stays readable from the aisle.
      bms.push(m(mid, RACK_H - 0.08, back, span, 0.12, 0.06));
      bms.push(m(mid, 1.3, back, span, 0.1, 0.06));
    }
    return { uprights: ups, beams: bms };
  }, []);

  return (
    <group>
      <Instanced matrices={uprights} color="#3d4350" roughness={0.6} metalness={0.4} />
      <Instanced matrices={beams} color="#4a5163" roughness={0.5} metalness={0.35} />
    </group>
  );
}

function Instanced({ matrices, color, roughness, metalness }: { matrices: THREE.Matrix4[]; color: string; roughness: number; metalness: number }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    return im;
  }, [matrices, color, roughness, metalness]);
  return <primitive object={mesh} />;
}

// ── Lifts ─────────────────────────────────────────────────────────────────

function Lift({ rect }: { rect: Rect }) {
  const [x0, z0, x1, z1] = rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, LIFT_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, LIFT_H, d]} />
        <meshStandardMaterial color="#3a3a42" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* doors on both aisle faces */}
      {[1, -1].map((s) => (
        <group key={s} position={[0, 0, (s * d) / 2]}>
          <mesh position={[0, 1.15, s * 0.015]}>
            <boxGeometry args={[w * 0.62, 2.3, 0.03]} />
            <meshStandardMaterial color="#5b5d66" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 1.15, s * 0.035]}>
            <boxGeometry args={[0.025, 2.3, 0.01]} />
            <meshBasicMaterial color="#1b1b1f" />
          </mesh>
          <mesh position={[0, 2.5, s * 0.03]}>
            <boxGeometry args={[0.5, 0.12, 0.02]} />
            <meshBasicMaterial color="#8db1f3" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, LIFT_H + 0.06, 0]} castShadow>
        <boxGeometry args={[w + 0.12, 0.12, d + 0.12]} />
        <meshStandardMaterial color="#4a4a54" roughness={0.6} />
      </mesh>
    </group>
  );
}

// ── Walls (cutaway: the walls facing the camera drop to a kerb) ───────────

interface WallSpec {
  /** Outward normal on the floor plane. */
  n: [number, number];
  pos: [number, number];
  len: number;
  alongX: boolean;
}

const WALLS: WallSpec[] = [
  { n: [0, -1], pos: [FLOOR_W / 2, -WALL_T / 2], len: FLOOR_W + WALL_T * 2, alongX: true },
  { n: [0, 1], pos: [FLOOR_W / 2, FLOOR_D + WALL_T / 2], len: FLOOR_W + WALL_T * 2, alongX: true },
  { n: [-1, 0], pos: [-WALL_T / 2, FLOOR_D / 2], len: FLOOR_D, alongX: false },
  { n: [1, 0], pos: [FLOOR_W + WALL_T / 2, FLOOR_D / 2], len: FLOOR_D, alongX: false },
];

function Wall({ spec, docks }: { spec: WallSpec; docks: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const current = useRef(1);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // Camera horizontal direction from the rig's azimuth.
    const facing = spec.n[0] * Math.sin(rig.az) + spec.n[1] * Math.cos(rig.az);
    const goal = THREE.MathUtils.smoothstep(facing, 0.05, 0.35) > 0.5 ? WALL_LOW / WALL_H : 1;
    current.current += (goal - current.current) * (1 - Math.exp(-dt * 7));
    g.scale.y = current.current;
    g.visible = current.current > 0.02;
  });

  const pilasters = useMemo(() => {
    const out: number[] = [];
    for (let s = -spec.len / 2 + 5; s < spec.len / 2 - 2; s += 10) out.push(s);
    return out;
  }, [spec.len]);

  const inward = [-spec.n[0], -spec.n[1]] as const;
  const along = (s: number, inset: number): [number, number, number] =>
    spec.alongX ? [s, 0, inward[1] * inset] : [inward[0] * inset, 0, s];

  return (
    <group position={[spec.pos[0], 0, spec.pos[1]]}>
      <group ref={ref}>
        <mesh position={[0, WALL_H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={spec.alongX ? [spec.len, WALL_H, WALL_T] : [WALL_T, WALL_H, spec.len]} />
          <meshStandardMaterial color="#1b1b21" roughness={0.92} />
        </mesh>
        <mesh position={[0, WALL_H - 0.03, 0]}>
          <boxGeometry args={spec.alongX ? [spec.len, 0.06, WALL_T + 0.02] : [WALL_T + 0.02, 0.06, spec.len]} />
          <meshStandardMaterial color="#2c2c34" roughness={0.8} />
        </mesh>
        {pilasters.map((s) => {
          const [px, , pz] = along(s, WALL_T / 2 + 0.2);
          return (
            <mesh key={s} position={[px, WALL_H / 2, pz]} castShadow>
              <boxGeometry args={[0.45, WALL_H, 0.45]} />
              <meshStandardMaterial color="#202027" roughness={0.9} />
            </mesh>
          );
        })}
        {docks &&
          [23.25, 29.75, 36.25, 42.75, 57.25, 63.75, 70.25, 76.75].map((x) => (
            <DockDoor key={x} x={x - FLOOR_W / 2} />
          ))}
      </group>
    </group>
  );
}

function DockDoor({ x }: { x: number }) {
  const z = WALL_T / 2 + 0.03;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[4.2, 3.0, 0.05]} />
        <meshStandardMaterial color="#30333b" roughness={0.5} metalness={0.45} />
      </mesh>
      {[0.5, 1.0, 1.5, 2.0, 2.5].map((y) => (
        <mesh key={y} position={[0, y, 0.03]}>
          <boxGeometry args={[4.1, 0.03, 0.02]} />
          <meshStandardMaterial color="#22252b" roughness={0.6} />
        </mesh>
      ))}
      {[-1.6, 1.6].map((bx) => (
        <mesh key={bx} position={[bx, 0.45, 0.12]}>
          <boxGeometry args={[0.3, 0.4, 0.22]} />
          <meshStandardMaterial color="#111114" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 3.18, 0.05]}>
        <boxGeometry args={[0.22, 0.1, 0.06]} />
        <meshBasicMaterial color="#e3bd78" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Structure({ floor, pendingUnits }: { floor: FloorId; pendingUnits: number }) {
  const pending = floor === 1 ? pendingRect(pendingUnits) : null;
  return (
    <group>
      <Slab />
      <Markings />
      {pending && <PendingMark key={pending.join(",")} rect={pending} />}
      <Racks />
      {LIFTS.map((r, i) => (
        <Lift key={i} rect={r} />
      ))}
      {WALLS.map((w, i) => (
        <Wall key={i} spec={w} docks={floor === 1 && w.n[1] === -1} />
      ))}
    </group>
  );
}
