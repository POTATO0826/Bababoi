// WareOrb promo — deterministic frame renderer.
// The 3D warehouse is the app's own scene (Structure, BaysLayer, FurnitureLayer from the Vince branch),
// fed with ledger snapshots captured from the real app at each step of its demo workflow.
import { clock } from "./clock";
import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useThree, type RootState } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { FLOOR_D, FLOOR_W } from "@/data/layout";
import { toSkuRecords } from "@/domain/stock";
import { BaysLayer } from "@/scene/bays";
import { rig } from "@/scene/camera-rig";
import { FurnitureLayer } from "@/scene/furniture/furniture-layer";
import { Structure } from "@/scene/structure";
import { getInventory, setWare, useWare, type Snapshot } from "@/store";
import { SceneAnimator, assemblyPose } from "./anim3d";
import { applyShot, H, ISO_AZ, ISO_EL, W } from "./cam";
import { Overlay } from "./overlay";
import { Post } from "./post";
import { LEDGERS, sceneState, shotAt, clickAt, eventPose } from "./timeline";

declare global {
  interface Window {
    renderFrame: (f: number) => Promise<void>;
    harnessReady: boolean;
    __r3f?: RootState;
    __committed?: number;
  }
}

const CENTER = new THREE.Vector3(FLOOR_W / 2, 0, FLOOR_D / 2);

/**
 * Lighting: the app's rig (warehouse-canvas.tsx `Lights`, not exported there) re-balanced for film —
 * a stronger, lower warm key so contact shadows read on the dark concrete, less flat fill, same cool rim
 * and the same studio Lightformer reflections.
 */
const LIGHT = (() => {
  const q = new URLSearchParams(location.search);
  const n = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
  return { key: n("key", 3.6), hemi: n("hemi", 0.38), amb: n("amb", 0.1), keyY: n("keyY", 58), env: n("env", 0.45), fill: n("fill", 0.5) };
})();
function Lights() {
  return (
    <>
      <hemisphereLight args={["#cfd8ff", "#16161b", LIGHT.hemi]} />
      <ambientLight intensity={LIGHT.amb} />
      <directionalLight
        position={[CENTER.x - 52, LIGHT.keyY, CENTER.z + 66]}
        intensity={LIGHT.key}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={1}
        shadow-camera-far={260}
      >
        <object3D attach="target" position={CENTER.toArray()} />
      </directionalLight>
      <directionalLight position={[CENTER.x + 60, 40, CENTER.z - 50]} intensity={LIGHT.fill} color="#b9c8ff">
        <object3D attach="target" position={CENTER.toArray()} />
      </directionalLight>
      <Environment resolution={128} environmentIntensity={LIGHT.env} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#c9d6ff" position={[-10, 3, 6]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#ffe4c4" position={[10, 3, -6]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
      </Environment>
    </>
  );
}

/** Studio backdrop: a soft pool of light under the model, rendered inside the 3D frame. */
function Backdrop() {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(960, 600, 40, 960, 600, 1250);
    grad.addColorStop(0, "#26262e");
    grad.addColorStop(0.45, "#15151a");
    grad.addColorStop(1, "#070709");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1920, 1080);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }, [scene]);
  return null;
}

function Expose() {
  const state = useThree();
  useLayoutEffect(() => {
    window.__r3f = state;
  }, [state]);
  return null;
}

function Probe() {
  const k = useWare((s) => (s as unknown as { __k: number }).__k);
  useLayoutEffect(() => {
    window.__committed = k;
  }, [k]);
  return null;
}

const groups = {
  structure: new THREE.Group(),
  bays: new THREE.Group(),
  furniture: new THREE.Group(),
};

function Scene() {
  return (
    <>
      <Expose />
      <Probe />
      <Backdrop />
      <Lights />
      <primitive object={groups.structure}>
        <Structure floor={1} />
      </primitive>
      <primitive object={groups.bays}>
        <BaysLayer floor={1} />
      </primitive>
      <primitive object={groups.furniture}>
        <FurnitureLayer floor={1} />
      </primitive>
      <Post />
    </>
  );
}

// ── boot ──────────────────────────────────────────────────────────────────
const ledgers = new Map<string, { now: number; ledger: Snapshot; skus: ReturnType<typeof toSkuRecords> }>();
const FINAL_NOW = { v: 0 };

async function boot() {
  for (const name of LEDGERS) {
    const j = (await (await fetch(`./ledger/${name}.json`)).json()) as { now: number; ledger: Snapshot };
    ledgers.set(name, { now: j.now, ledger: j.ledger, skus: [] as never });
  }
  // One clock for the whole film: the moment the last snapshot was taken.
  FINAL_NOW.v = Math.max(...[...ledgers.values()].map((l) => l.now));
  clock.now = FINAL_NOW.v;
  for (const l of ledgers.values()) l.skus = toSkuRecords(l.ledger, FINAL_NOW.v);

  await document.fonts.ready;
  const overlay = new Overlay(document.getElementById("ui")!, document.getElementById("hud")!);
  await overlay.load();

  const root = createRoot(document.getElementById("gl")!);
  root.render(
    <Canvas
      orthographic
      frameloop="never"
      shadows="soft"
      dpr={Number(new URLSearchParams(location.search).get("dpr") ?? 1)}
      style={{ width: W, height: H }}
      camera={{ position: [150, 150, 150], zoom: 8, near: 1, far: 1000, manual: true } as never}
      gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.25;
        gl.setClearColor(0x000000, 0);
      }}
    >
      <Scene />
    </Canvas>,
  );
  while (!window.__r3f) await new Promise((r) => setTimeout(r, 20));

  const anim = new SceneAnimator();
  let key = "";
  let k = 0;
  let assembling = true;

  window.renderFrame = async (f: number) => {
    const st = sceneState(f);
    const nextKey = `${st.ledger}|${st.stage}|${st.selected ?? ""}`;
    if (nextKey !== key) {
      key = nextKey;
      const l = ledgers.get(st.ledger)!;
      k++;
      setWare((s) => ({
        ...({ __k: k } as object),
        ledger: l.ledger,
        skus: l.skus,
        ledgerReady: true,
        stage: st.stage,
        selected: st.selected,
        floor: 1,
        zone: null,
        hoverBay: null,
        detail: null,
        panelOpen: false,
        settings: { ...s.settings, lowStockThreshold: l.ledger.settings.lowStockThreshold, showEmptyBays: true, autoSpin: false },
      }));
      for (let i = 0; i < 400 && window.__committed !== k; i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 30)); // passive effects (glow / outline instances)
    }
    const r3f = window.__r3f!;
    anim.index(groups, getInventory().bays[1]);
    if (f < 32) {
      anim.assemble(f, groups.bays);
      assembling = true;
    } else if (assembling) {
      anim.restoreStatic();
      anim.restoreBays(groups.bays);
      assembling = false;
    }
    anim.writeInstances((m, kind) => eventPose(f, m, kind) ?? assemblyPose(f, m, kind));

    rig.az = ISO_AZ;
    rig.el = ISO_EL;
    const shot = shotAt(f);
    const click = clickAt(f);
    applyShot(r3f.camera as THREE.OrthographicCamera, shot, click);
    overlay.update(f, shot, click);
    r3f.advance(f * (1000 / 30));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  };
  window.harnessReady = true;
}

boot().catch((e) => {
  console.error("boot failed", e);
  document.body.dataset.error = String(e?.stack ?? e);
});
