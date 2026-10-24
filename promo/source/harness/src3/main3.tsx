// WareOrb promo v3 — "One line", 21 s cut. Deterministic frame renderer (frames 0–629).
// The 3D twin is the app's own scene (Structure, BaysLayer, FurnitureLayer from the Vince branch), fed with
// ledger snapshots captured from the real app, shown through a mask: ghosted by default, full colour only
// inside shapes the line has closed.
import { clock } from "../src/clock";
import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { FLOOR_D, FLOOR_W } from "@/data/layout";
import { toSkuRecords } from "@/domain/stock";
import { BaysLayer } from "@/scene/bays";
import { rig } from "@/scene/camera-rig";
import { FurnitureLayer } from "@/scene/furniture/furniture-layer";
import { Structure } from "@/scene/structure";
import { getInventory, setWare, useWare, type Snapshot } from "@/store";
import { SceneAnimator } from "../src/anim3d";
import { applyShot, ISO_AZ, ISO_EL } from "../src/cam";
import { Overlay3 } from "./overlay3";
import { lineAt } from "./line";
import { H, W, shotOf, toPlane, toScreen } from "./plane";
import { ASM_END, LEDGERS, T, blurAt, buildStory, camAt, cues, dispatchAt, eventPose, sceneState } from "./story3";

declare global {
  interface Window {
    renderFrame: (f: number) => Promise<void>;
    /** Farthest on-screen travel (CSS px) of anything moving between frames f0 and f1: camera, pen tip, dispatched units. */
    motionAt: (f0: number, f1: number) => number;
    /** Cues and per-frame curves for the score (score.py reads them via export-sound.mjs). */
    soundData: () => unknown;
    harnessReady: boolean;
    __r3f?: RootState;
    __committed?: number;
  }
}

const CENTER = new THREE.Vector3(FLOOR_W / 2, 0, FLOOR_D / 2);
const DPR = Number(new URLSearchParams(location.search).get("dpr") ?? 1);
/** Per-frame post parameters (tilt-shift strength), set by renderFrame. */
const postFx = { blur: 1.6 };

/** The app's light rig (warehouse-canvas.tsx), re-balanced for film: lower, stronger warm key. */
function Lights() {
  return (
    <>
      <hemisphereLight args={["#cfd8ff", "#16161b", 0.38]} />
      <ambientLight intensity={0.1} />
      <directionalLight
        position={[CENTER.x - 52, 58, CENTER.z + 66]}
        intensity={3.6}
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
      <directionalLight position={[CENTER.x + 60, 40, CENTER.z - 50]} intensity={0.5} color="#b9c8ff">
        <object3D attach="target" position={CENTER.toArray()} />
      </directionalLight>
      <Environment resolution={128} environmentIntensity={0.45} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#c9d6ff" position={[-10, 3, 6]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#ffe4c4" position={[10, 3, -6]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
      </Environment>
    </>
  );
}

/** Shared mask canvas (CSS-pixel space), uploaded each frame. */
export const maskCanvas = document.createElement("canvas");
maskCanvas.width = W;
maskCanvas.height = H;
const maskTex = new THREE.CanvasTexture(maskCanvas);
maskTex.colorSpace = THREE.NoColorSpace;
maskTex.minFilter = THREE.LinearFilter;
maskTex.magFilter = THREE.LinearFilter;
maskTex.generateMipmaps = false;

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */ `
  uniform sampler2D tSrc; uniform sampler2D tMask; uniform vec2 uRes; uniform vec2 uDir; uniform float uBlur; uniform float uFocus; uniform float uBand; uniform float uFinal;
  varying vec2 vUv;
  void main(){
    float d = max(0.0, abs(vUv.y - uFocus) - uBand) / max(0.0001, 1.0 - uBand);
    float r = uBlur * smoothstep(0.0, 1.0, d * 1.7);
    vec4 c;
    if (r < 0.05) c = texture2D(tSrc, vUv);
    else {
      vec4 acc = vec4(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) { float x = float(i) / 6.0; float w = exp(-x * x * 2.0); acc += texture2D(tSrc, vUv + uDir * x * r / uRes) * w; ws += w; }
      c = acc / ws;
    }
    if (uFinal < 0.5) { gl_FragColor = vec4(c.rgb, 1.0); return; }
    float m = texture2D(tMask, vUv).r;
    // outside the windows the twin is a cool, desaturated ghost
    float full = smoothstep(0.3, 0.92, m);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 ghost = vec3(l) * vec3(0.86, 0.9, 1.08) * 1.15;
    vec3 col = mix(ghost, c.rgb, full);
    gl_FragColor = vec4(col * m, m);
  }`;

function Post() {
  const { gl, scene, camera, size } = useThree();
  const res = useMemo(() => {
    const pr = gl.getPixelRatio();
    const w = Math.round(size.width * pr);
    const h = Math.round(size.height * pr);
    const copy = new THREE.FramebufferTexture(w, h);
    const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.NoColorSpace, depthBuffer: false });
    const mk = (dir: [number, number], final: number) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        transparent: false,
        blending: THREE.NoBlending,
        uniforms: {
          tSrc: { value: null },
          tMask: { value: maskTex },
          uRes: { value: new THREE.Vector2(w, h) },
          uDir: { value: new THREE.Vector2(...dir) },
          uBlur: { value: 1.6 * pr },
          uFocus: { value: 0.5 },
          uBand: { value: 0.26 },
          uFinal: { value: final },
        },
      });
    const h1 = mk([1, 0], 0);
    const v1 = mk([0, 1], 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), h1);
    quad.frustumCulled = false;
    const qScene = new THREE.Scene();
    qScene.add(quad);
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { copy, rt, h1, v1, quad, qScene, qCam };
  }, [gl, size.width, size.height]);
  useEffect(() => () => (res.copy.dispose(), res.rt.dispose()), [res]);
  useFrame(() => {
    const { copy, rt, h1, v1, quad, qScene, qCam } = res;
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 1);
    gl.render(scene, camera);
    gl.copyFramebufferToTexture(copy, new THREE.Vector2(0, 0));
    maskTex.needsUpdate = true;
    const tm = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    const pr = gl.getPixelRatio();
    h1.uniforms.uBlur!.value = postFx.blur * pr;
    v1.uniforms.uBlur!.value = postFx.blur * pr;
    h1.uniforms.tSrc!.value = copy;
    quad.material = h1;
    gl.setRenderTarget(rt);
    gl.render(qScene, qCam);
    v1.uniforms.tSrc!.value = rt.texture;
    quad.material = v1;
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(qScene, qCam);
    gl.toneMapping = tm;
  }, 1);
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

const groups = { structure: new THREE.Group(), bays: new THREE.Group(), furniture: new THREE.Group() };

function Scene() {
  return (
    <>
      <Expose />
      <Probe />
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

const ledgers = new Map<string, { now: number; ledger: Snapshot; skus: ReturnType<typeof toSkuRecords> }>();

function sampler(d: string, n: number): [number, number][] {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  svg.appendChild(p);
  document.body.appendChild(svg);
  const L = p.getTotalLength();
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const q = p.getPointAtLength((L * i) / n);
    out.push([q.x, q.y]);
  }
  svg.remove();
  return out;
}

async function boot() {
  for (const name of LEDGERS) {
    const j = (await (await fetch(`./ledger/${name}.json`)).json()) as { now: number; ledger: Snapshot };
    ledgers.set(name, { now: j.now, ledger: j.ledger, skus: [] as never });
  }
  const NOW = Math.max(...[...ledgers.values()].map((l) => l.now));
  clock.now = NOW;
  for (const l of ledgers.values()) l.skus = toSkuRecords(l.ledger, NOW);

  await document.fonts.ready;
  const story = buildStory(sampler);
  const overlay = new Overlay3(document.getElementById("frame")!, story, maskCanvas, DPR);
  await overlay.load();

  createRoot(document.getElementById("gl")!).render(
    <Canvas
      orthographic
      frameloop="never"
      shadows="soft"
      dpr={DPR}
      style={{ width: W, height: H }}
      camera={{ position: [150, 150, 150], zoom: 8, near: 1, far: 1000, manual: true } as never}
      gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.25;
      }}
    >
      <Scene />
    </Canvas>,
  );
  while (!window.__r3f) await new Promise((r) => setTimeout(r, 20));

  const anim = new SceneAnimator();
  let key = "";
  let k = 0;
  /** The app's clock (R3F, seconds) at frame 0. During the warm-up it steps 10 s at a time instead (see below). */
  const CLOCK0 = 600;
  let warm = -1;
  let assembling = false;

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
      await new Promise((r) => setTimeout(r, 30));
    }
    const r3f = window.__r3f!;
    anim.index(groups, getInventory().bays[1]);
    // opening: the app's own structure assembles (slab rises, walls grow, markings fade in), slowed ×1.45.
    // Stateless per frame, so frames can be rendered in any order.
    if (f < ASM_END) {
      anim.assemble(Math.max(0, (f - T.asm0) / 1.45), groups.bays);
      assembling = true;
    } else if (assembling) {
      anim.restoreStatic();
      anim.restoreBays(groups.bays);
      assembling = false;
    }
    anim.writeInstances((m, kind) => eventPose(f, m, kind));
    postFx.blur = blurAt(f);
    rig.az = ISO_AZ;
    rig.el = ISO_EL;
    const cam = camAt(f);
    applyShot(r3f.camera as THREE.OrthographicCamera, shotOf(cam), { z: 1, px: 960, py: 540 });
    overlay.update(f, cam); // draws grid, mask, cards, line, type
    // The app's clock is a pure function of the frame: its pending-delivery mark pulses with clock.elapsedTime
    // (structure.tsx), so an accumulating counter made a frame depend on how many sub-frames came before it.
    r3f.advance(warm >= 0 ? CLOCK0 - 10 * (12 - warm) : CLOCK0 + f / 30);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  };
  // On-screen travel between two times, for the renderer's shutter (it sizes the number of sub-frame samples from it).
  window.motionAt = (f0: number, f1: number) => {
    const c0 = camAt(f0);
    const c1 = camAt(f1);
    // the camera: how far the frame's corners and centre move
    let m = 0;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]] as const) {
      const p: [number, number] = [c0.u + (x - W / 2) / c0.zoom, c0.v + (y - H / 2) / c0.zoom];
      const [x1, y1] = toScreen(c1, p);
      m = Math.max(m, Math.hypot(x1 - x, y1 - y));
    }
    // the pen tip
    const t0 = lineAt(story.segs, f0, 0).tip;
    const t1 = lineAt(story.segs, f1, 0).tip;
    if (t0 && t1) {
      const [a, b] = [toScreen(c0, t0), toScreen(c1, t1)];
      m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    // the outline morphing between the mark and the warehouse: its sides travel far further than its peak (where the
    // pen rests), so without this the opening's morph was sampled for the pen's speed and stepped into copies
    // (only while it is changing shape, and only what is on screen: the camera's own travel is measured above)
    const k0 = story.morphAt(f0);
    const k1 = story.morphAt(f1);
    if (Math.abs(k1 - k0) > 1e-6) {
      const m0 = story.morphPts(k0);
      const m1 = story.morphPts(k1);
      const on = ([x, y]: [number, number]) => x > -50 && x < W + 50 && y > -50 && y < H + 50;
      for (let i = 0; i < m0.length; i += 4) {
        const [a, b] = [toScreen(c0, m0[i]!), toScreen(c1, m1[i]!)];
        if (on(a) || on(b)) m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
    }
    // the collected units riding out
    const d0 = dispatchAt(f0);
    const d1 = dispatchAt(f1);
    if (d0 && d1) {
      const [a, b] = [toScreen(c0, toPlane(d0)), toScreen(c1, toPlane(d1))];
      m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    return m;
  };
  // What the score needs, straight from the film (so a retimed beat takes its sound with it):
  // the event cues, and per frame the pen tip on screen, its speed, the camera's own screen speed, the dispatch light.
  window.soundData = () => {
    const tip: ([number, number] | null)[] = [];
    const cam: number[] = [];
    const rail: ([number, number] | null)[] = [];
    for (let f = 0; f < 630; f++) {
      const c = camAt(f);
      const t = lineAt(story.segs, f, 0).tip;
      tip.push(t ? toScreen(c, t) : null);
      const c0 = camAt(f - 0.5);
      const c1 = camAt(f + 0.5);
      let m = 0;
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]] as const) {
        const [x1, y1] = toScreen(c1, [c0.u + (x - W / 2) / c0.zoom, c0.v + (y - H / 2) / c0.zoom]);
        m = Math.max(m, Math.hypot(x1 - x, y1 - y));
      }
      cam.push(m);
      const d = dispatchAt(f);
      rail.push(d ? toScreen(c, toPlane(d)) : null);
    }
    return { fps: 30, frames: 630, T, cues: cues(), tip, cam, rail };
  };
  // settle the app's wall cut-away and the environment map; 10 s steps settle the cut-away's damping exactly, so later
  // clock steps (forward or back, when frames are rendered out of order) leave it unchanged
  for (warm = 0; warm < 12; warm++) await window.renderFrame(0);
  warm = -1;
  window.harnessReady = true;
}

boot().catch((e) => {
  console.error("boot failed", e);
  document.body.dataset.error = String(e?.stack ?? e);
});
