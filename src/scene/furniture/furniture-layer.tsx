import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FloorId } from "@/data/catalog";
import { BAYS } from "@/data/layout";
import { useWare } from "@/store";
import { placementsFor, type Placement } from "./placements";
import { getTemplate, type TemplateId } from "./templates";

// ── Materials ─────────────────────────────────────────────────────────────

/** Standard material patched so fixed parts ignore the instance colour, and each instance can glow. */
function furnitureMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aTint;\nattribute vec3 aGlow;\nvarying vec3 vGlow;")
      .replace(
        "#include <color_vertex>",
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec3( 1.0 );
        #endif
        #ifdef USE_COLOR
          vColor *= color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= mix( vec3( 1.0 ), instanceColor.rgb, aTint );
        #endif
        vGlow = aGlow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;");
  };
  m.customProgramCacheKey = () => "wareorb-furniture";
  return m;
}

const outlineThickness = { value: 0.06 };

/** Inverted-hull outline: back faces pushed out along smooth normals by a screen-constant width. */
function outlineMaterial() {
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = outlineThickness;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uThickness;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize( normal ) * uThickness;");
  };
  m.customProgramCacheKey = () => "wareorb-outline";
  return m;
}

/** Soft rounded-rect shadow, stretched under each unit standing on the floor (cheap contact shadow). */
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.filter = "blur(13px)";
  g.fillStyle = "#ffffff";
  g.fillRect(26, 26, 76, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BLOB_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const MATERIALS = {
  blob: new THREE.MeshBasicMaterial({
    map: blobTexture(),
    color: "#000000",
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    toneMapped: false,
  }),
  solid: furnitureMaterial(),
  glass: new THREE.MeshPhysicalMaterial({
    transparent: true,
    opacity: 0.55,
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    depthWrite: false,
  }),
  outline: outlineMaterial(),
};

const SELECT_GLOW = new THREE.Color("#4f8bea").multiplyScalar(0.07);
const HOVER_GLOW = new THREE.Color("#ffffff").multiplyScalar(0.05);
const SELECT_LINE = new THREE.Color("#8db1f3");
const HOVER_LINE = new THREE.Color("#fafafa");

// ── Layer ─────────────────────────────────────────────────────────────────

export function FurnitureLayer({ floor }: { floor: FloorId }) {
  const groups = useMemo(() => {
    const by = new Map<TemplateId, Placement[]>();
    for (const p of placementsFor(floor)) {
      const list = by.get(p.tpl) ?? [];
      list.push(p);
      by.set(p.tpl, list);
    }
    return [...by.entries()];
  }, [floor]);

  useFrame(({ camera }) => {
    // Keep the outline about 2px wide whatever the zoom.
    outlineThickness.value = 2 / (camera as THREE.OrthographicCamera).zoom;
  });

  return (
    <group>
      {groups.map(([tpl, items]) => (
        <TemplateInstances key={`${floor}-${tpl}`} floor={floor} tpl={tpl} items={items} />
      ))}
    </group>
  );
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function matrixFor(p: Placement) {
  tmpPos.set(p.x, p.y, p.z);
  tmpQuat.setFromAxisAngle(UP, p.ry);
  tmpScale.set(...(p.scale ?? ([1, 1, 1] as const)));
  return tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
}

/** Geometry that shares the template's buffers but owns its per-instance glow attribute. */
function shareGeometry(src: THREE.BufferGeometry, glow?: THREE.InstancedBufferAttribute) {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  if (src.index) g.setIndex(src.index);
  if (glow) g.setAttribute("aGlow", glow);
  return g;
}

function TemplateInstances({ floor, tpl, items }: { floor: FloorId; tpl: TemplateId; items: Placement[] }) {
  const selected = useWare((s) => s.selected);
  const hoverBay = useWare((s) => s.hoverBay);

  const meshes = useMemo(() => {
    const t = getTemplate(tpl);
    const count = items.length;
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const solid = new THREE.InstancedMesh(shareGeometry(t.solid, glow), MATERIALS.solid, count);
    const glass = t.glass ? new THREE.InstancedMesh(shareGeometry(t.glass), MATERIALS.glass, count) : null;
    const outline = new THREE.InstancedMesh(shareGeometry(t.outline), MATERIALS.outline, count);
    t.solid.computeBoundingBox();
    const bb = t.solid.boundingBox!;
    const grounded = items.filter((p) => p.y < 0.01);
    const blob = new THREE.InstancedMesh(BLOB_GEOMETRY, MATERIALS.blob, Math.max(grounded.length, 1));
    blob.count = grounded.length;
    blob.renderOrder = 4;
    grounded.forEach((p, i) => {
      const [sx, , sz] = p.scale ?? [1, 1, 1];
      tmpPos.set(p.x, 0.028, p.z);
      tmpQuat.setFromAxisAngle(UP, p.ry);
      tmpScale.set((bb.max.x - bb.min.x) * sx * 1.45, 1, (bb.max.z - bb.min.z) * sz * 1.5);
      blob.setMatrixAt(i, tmpMatrix.compose(tmpPos, tmpQuat, tmpScale));
    });
    items.forEach((p, i) => {
      const m = matrixFor(p);
      solid.setMatrixAt(i, m);
      glass?.setMatrixAt(i, m);
      solid.setColorAt(i, tmpColor.set(p.color));
      glass?.setColorAt(i, tmpColor.set(p.color));
      outline.setColorAt(i, HOVER_LINE);
    });
    solid.castShadow = solid.receiveShadow = true;
    if (glass) glass.receiveShadow = true;
    outline.count = 0;
    for (const m of [solid, glass, outline, blob]) if (m) m.frustumCulled = false;
    return { solid, glass, outline, blob, glow };
  }, [tpl, items]);

  useEffect(
    () => () => {
      for (const m of [meshes.solid, meshes.glass, meshes.outline]) m?.geometry.dispose();
    },
    [meshes],
  );

  // Highlight: glow + outline on every unit of the selected SKU, and on the hovered bay.
  useEffect(() => {
    const selectedBays = new Set(
      selected ? BAYS[floor].filter((b) => b.sku?.sku === selected).map((b) => b.id) : [],
    );
    const { glow, outline } = meshes;
    let n = 0;
    items.forEach((p, i) => {
      const isSel = selectedBays.has(p.owner);
      const isHover = p.owner === hoverBay;
      const c = isSel ? SELECT_GLOW : isHover ? HOVER_GLOW : null;
      glow.setXYZ(i, c?.r ?? 0, c?.g ?? 0, c?.b ?? 0);
      if (isSel || isHover) {
        outline.setMatrixAt(n, matrixFor(p));
        outline.setColorAt(n, isHover ? HOVER_LINE : SELECT_LINE);
        n++;
      }
    });
    glow.needsUpdate = true;
    outline.count = n;
    outline.instanceMatrix.needsUpdate = true;
    if (outline.instanceColor) outline.instanceColor.needsUpdate = true;
  }, [meshes, items, selected, hoverBay, floor]);

  return (
    <>
      <primitive object={meshes.blob} />
      <primitive object={meshes.solid} />
      {meshes.glass && <primitive object={meshes.glass} />}
      <primitive object={meshes.outline} />
    </>
  );
}
