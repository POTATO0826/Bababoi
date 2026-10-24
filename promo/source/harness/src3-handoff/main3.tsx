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
import { H, W, shotOf } from "./plane";
import { ASM_END, LEDGERS, T, blurAt, buildStory, camAt, eventPose, sceneState } from "./story3";

declare global {
  interface Window {
    renderFrame: (f: number) => Promise<void>;
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
  let t = 0;
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
    // monotonic clock for the app's damped wall cut-away (frames may be rendered out of order)
    t += 1000 / 30;
    r3f.advance(t);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  };
  // settle the app's wall cut-away and the environment map
  for (let i = 0; i < 12; i++) await window.renderFrame(0);
  window.harnessReady = true;
}

boot().catch((e) => {
  console.error("boot failed", e);
  document.body.dataset.error = String(e?.stack ?? e);
});
