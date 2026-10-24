// Film look for the 3D layer. The scene is rendered exactly as the app renders it (renderer tone mapping,
// sRGB output, MSAA), then the frame is copied to a texture and finished with a tilt-shift depth of field
// (the "miniature" cue), a soft vignette and an optional dim for the end card.
// UI panels are DOM above the canvas and are never blurred.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Per-frame look parameters, written by the timeline before each render. */
export const look = {
  focusY: 0.5, // focus band centre (0 = bottom, 1 = top of frame)
  band: 0.2, // half-height of the sharp band
  blur: 2.4, // max blur radius in px at the frame edges
  vignette: 0.34,
  dim: 0, // 0..1 darkens the scene (brand end card)
  glow: 0.0, // extra lift on bright pixels (restrained bloom)
};

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BLUR = /* glsl */ `
  uniform sampler2D tSrc; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uBlur; uniform vec2 uDir;
  uniform float uVignette; uniform float uDim; uniform float uFinal;
  varying vec2 vUv;
  void main(){
    float d = max(0.0, abs(vUv.y - uFocus) - uBand) / max(0.0001, 1.0 - uBand);
    float r = uBlur * smoothstep(0.0, 1.0, d * 1.7);
    vec4 c;
    if (r < 0.05) c = texture2D(tSrc, vUv);
    else {
      vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -7; i <= 7; i++) {
        float x = float(i) / 7.0;
        float w = exp(-x * x * 2.0);
        acc += texture2D(tSrc, vUv + uDir * x * r / uRes) * w;
        wsum += w;
      }
      c = acc / wsum;
    }
    if (uFinal > 0.5) {
      vec2 p = (vUv - 0.5) * vec2(1.0, 0.5625) * 2.0;
      float v = 1.0 - uVignette * smoothstep(0.38, 1.3, length(p));
      c.rgb *= v * (1.0 - uDim);
    }
    gl_FragColor = vec4(c.rgb, 1.0);
  }`;

export function Post() {
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
        fragmentShader: BLUR,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          tSrc: { value: null },
          uRes: { value: new THREE.Vector2(w, h) },
          uFocus: { value: 0.5 },
          uBand: { value: 0.2 },
          uBlur: { value: 2.4 },
          uDir: { value: new THREE.Vector2(...dir) },
          uVignette: { value: 0.34 },
          uDim: { value: 0 },
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
    return { copy, rt, h1, v1, quad, qScene, qCam, pr };
  }, [gl, size.width, size.height]);

  useEffect(
    () => () => {
      res.copy.dispose();
      res.rt.dispose();
    },
    [res],
  );

  useFrame(() => {
    const { copy, rt, h1, v1, quad, qScene, qCam, pr } = res;
    // 1 · the app's own render, to the canvas
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    // 2 · grab it
    gl.copyFramebufferToTexture(copy, new THREE.Vector2(0, 0));
    for (const m of [h1, v1]) {
      m.uniforms.uFocus!.value = look.focusY;
      m.uniforms.uBand!.value = look.band;
      m.uniforms.uBlur!.value = look.blur * pr;
      m.uniforms.uVignette!.value = look.vignette;
      m.uniforms.uDim!.value = look.dim;
    }
    // 3 · horizontal blur → rt, vertical blur + grade → canvas
    const tm = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    h1.uniforms.tSrc!.value = copy;
    quad.material = h1;
    gl.setRenderTarget(rt);
    gl.render(qScene, qCam);
    v1.uniforms.tSrc!.value = rt.texture;
    quad.material = v1;
    gl.setRenderTarget(null);
    gl.render(qScene, qCam);
    gl.toneMapping = tm;
  }, 1);
  return null;
}
