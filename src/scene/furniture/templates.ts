// Furniture unit templates. Each template is merged into one BufferGeometry that is drawn
// once per unit with InstancedMesh. Dimensions are metres; the footprint is centred on the
// origin, y = 0 is the floor and the front faces +z.
//
// Vertex attributes:
//   color  — tone multiplier (tinted parts) or absolute colour (fixed parts), linear
//   aTint  — 1 = multiply by the SKU's material colour (instanceColor), 0 = fixed colour
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type TemplateId =
  | "sofa"
  | "sofaL"
  | "recliner"
  | "table"
  | "glass"
  | "tableRound"
  | "coffee"
  | "side"
  | "console"
  | "desk"
  | "chair"
  | "kids"
  | "stool"
  | "armchair"
  | "office"
  | "lounge"
  | "rocking"
  | "wardrobe2"
  | "wardrobe3"
  | "cabinet"
  | "bed"
  | "bedSingle"
  | "bunk"
  | "daybed"
  | "mattress"
  | "rugRoll"
  | "lamp"
  | "carton"
  | "cartonTop"
  | "pallet"
  | "mirrorCrate"
  | "wrapped";

export interface Template {
  solid: THREE.BufferGeometry;
  /** Inflatable copy with smooth normals for the outline hull. */
  outline: THREE.BufferGeometry;
  glass: THREE.BufferGeometry | null;
  height: number;
}

const FIX = {
  legDark: "#1f1f23",
  metal: "#9aa0a8",
  chrome: "#c5cad1",
  linen: "#ebe8e0",
  pillow: "#f4f2ec",
  pallet: "#9b7a52",
  plywood: "#c9a878",
  wrap: "#d9dee5",
  strap: "#3b4252",
  shade: "#efe6d2",
  tape: "#e2d2b5",
  label: "#f1efe9",
  rubber: "#26272c",
  seam: "#141417",
} as const;

interface PartOpts {
  /** Multiplier on the SKU colour (sRGB-ish; 1 = as is). Ignored when `color` is set. */
  tone?: number;
  /** Fixed colour, not tinted by the SKU. */
  color?: string;
  /** Corner radius for rounded boxes. */
  r?: number;
  rotY?: number;
  glass?: boolean;
}

interface Part {
  geo: THREE.BufferGeometry;
  rgb: THREE.Color;
  tint: number;
  glass: boolean;
}

class Builder {
  parts: Part[] = [];
  maxY = 0;

  /** Axis-aligned box from min to max corner (optionally rounded / rotated about its centre). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: PartOpts = {}) {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    const r = Math.min(o.r ?? 0, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
    const geo = r > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    if (o.rotY) geo.rotateY(o.rotY);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(geo, o, y1);
  }

  /** Box by centre and size. */
  boxC(cx: number, cy: number, cz: number, w: number, h: number, d: number, o: PartOpts = {}) {
    this.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, o);
  }

  /** Vertical cylinder standing on y0. */
  cyl(x: number, y0: number, z: number, h: number, rTop: number, rBot = rTop, o: PartOpts = {}, seg = 20) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    geo.translate(x, y0 + h / 2, z);
    this.add(geo, o, y0 + h);
  }

  /** Horizontal cylinder along x, centred on (cx, cy, cz). */
  cylX(cx: number, cy: number, cz: number, len: number, r: number, o: PartOpts = {}, seg = 20) {
    const geo = new THREE.CylinderGeometry(r, r, len, seg);
    geo.rotateZ(Math.PI / 2);
    geo.translate(cx, cy, cz);
    this.add(geo, o, cy + r);
  }

  private add(geo: THREE.BufferGeometry, o: PartOpts, top: number) {
    const rgb = o.color
      ? new THREE.Color(o.color)
      : new THREE.Color().setRGB(o.tone ?? 1, o.tone ?? 1, o.tone ?? 1, THREE.SRGBColorSpace);
    this.parts.push({ geo, rgb, tint: o.color ? 0 : 1, glass: !!o.glass });
    this.maxY = Math.max(this.maxY, top);
  }

  build(): Template {
    const prep = (p: Part) => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      g.deleteAttribute("uv");
      const n = g.getAttribute("position").count;
      const col = new Float32Array(n * 3);
      const tint = new Float32Array(n).fill(p.tint);
      for (let i = 0; i < n; i++) col.set([p.rgb.r, p.rgb.g, p.rgb.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
      return g;
    };
    const solidParts = this.parts.filter((p) => !p.glass).map(prep);
    const glassParts = this.parts.filter((p) => p.glass).map(prep);
    const solid = mergeGeometries(solidParts)!;
    const glass = glassParts.length ? mergeGeometries(glassParts)! : null;

    // Outline hull: positions only, welded so normals are smooth and the inflated shell has no cracks.
    const outlineSrc = new THREE.BufferGeometry();
    const all = glass ? mergeGeometries([solid, glass])! : solid;
    outlineSrc.setAttribute("position", all.getAttribute("position"));
    const outline = mergeVertices(outlineSrc, 1e-3);
    outline.computeVertexNormals();

    return { solid, outline, glass, height: this.maxY };
  }
}

// ── Templates ────────────────────────────────────────────────────────────

function sofaBody(b: Builder, w: number, d: number, dz: number, opts: { arms: "both" | "left"; cushions: number; armW: number; backH: number; backD: number }) {
  const z0 = dz - d / 2;
  const z1 = dz + d / 2;
  const x0 = -w / 2;
  const x1 = w / 2;
  const { armW } = opts;
  // legs
  for (const [lx, lz] of [
    [x0 + 0.1, z0 + 0.1],
    [x1 - 0.1, z0 + 0.1],
    [x0 + 0.1, z1 - 0.1],
    [x1 - 0.1, z1 - 0.1],
  ] as const)
    b.cyl(lx, 0, lz, 0.07, 0.025, 0.02, { color: FIX.legDark }, 10);
  // base, back, arms
  b.box(x0 + 0.02, 0.06, z0 + 0.04, x1 - 0.02, 0.31, z1 - 0.02, { tone: 0.84, r: 0.03 });
  b.box(x0, 0.06, z0, x1, opts.backH, z0 + opts.backD, { tone: 0.9, r: 0.06 });
  b.box(x0, 0.06, z0 + 0.04, x0 + armW, 0.62, z1, { tone: 0.94, r: 0.06 });
  if (opts.arms === "both") b.box(x1 - armW, 0.06, z0 + 0.04, x1, 0.62, z1, { tone: 0.94, r: 0.06 });
  // seat + back cushions
  const inner0 = x0 + armW + 0.01;
  const inner1 = (opts.arms === "both" ? x1 - armW : x1) - 0.01;
  const cw = (inner1 - inner0) / opts.cushions;
  for (let i = 0; i < opts.cushions; i++) {
    const cx0 = inner0 + i * cw + 0.006;
    const cx1 = inner0 + (i + 1) * cw - 0.006;
    b.box(cx0, 0.31, z0 + opts.backD - 0.02, cx1, 0.46, z1 - 0.01, { tone: 1.06, r: 0.05 });
    b.box(cx0, 0.44, z0 + opts.backD - 0.08, cx1, opts.backH - 0.06, z0 + opts.backD + 0.12, { tone: 1.02, r: 0.07 });
  }
}

const TEMPLATE_BUILDERS: Record<TemplateId, (b: Builder) => void> = {
  sofa(b) {
    sofaBody(b, 2.5, 0.95, 0, { arms: "both", cushions: 3, armW: 0.24, backH: 0.86, backD: 0.22 });
  },
  recliner(b) {
    sofaBody(b, 1.9, 0.95, 0, { arms: "both", cushions: 2, armW: 0.3, backH: 1.0, backD: 0.28 });
    // folded footrest panel and headrest bolsters
    b.box(-0.62, 0.1, 0.46, 0.62, 0.36, 0.5, { tone: 0.78, r: 0.02 });
    b.box(-0.62, 0.86, -0.4, -0.02, 0.98, -0.2, { tone: 1.04, r: 0.05 });
    b.box(0.02, 0.86, -0.4, 0.62, 0.98, -0.2, { tone: 1.04, r: 0.05 });
  },
  sofaL(b) {
    const w = 2.5;
    // main run (back at z = -0.85), open on the right where the chaise continues
    sofaBody(b, w, 0.95, -0.375, { arms: "left", cushions: 2, armW: 0.24, backH: 0.86, backD: 0.22 });
    // chaise
    const cx0 = w / 2 - 0.9;
    b.box(cx0, 0.06, 0.08, w / 2 - 0.02, 0.31, 0.84, { tone: 0.84, r: 0.03 });
    b.box(cx0 + 0.006, 0.31, 0.08, w / 2 - 0.25, 0.46, 0.83, { tone: 1.06, r: 0.05 });
    b.box(w / 2 - 0.24, 0.06, -0.81, w / 2, 0.62, 0.85, { tone: 0.94, r: 0.06 });
    b.cyl(cx0 + 0.1, 0, 0.75, 0.07, 0.025, 0.02, { color: FIX.legDark }, 10);
  },
  table(b) {
    const w = 1.5;
    const d = 1.1;
    for (const [lx, lz] of [
      [-w / 2 + 0.08, -d / 2 + 0.08],
      [w / 2 - 0.08, -d / 2 + 0.08],
      [-w / 2 + 0.08, d / 2 - 0.08],
      [w / 2 - 0.08, d / 2 - 0.08],
    ] as const)
      b.boxC(lx, 0.35, lz, 0.07, 0.7, 0.07, { tone: 0.72 });
    b.box(-w / 2 + 0.08, 0.6, -d / 2 + 0.08, w / 2 - 0.08, 0.7, d / 2 - 0.08, { tone: 0.82 });
    b.box(-w / 2, 0.7, -d / 2, w / 2, 0.76, d / 2, { tone: 1.08, r: 0.01 });
  },
  glass(b) {
    const w = 1.5;
    const d = 1.1;
    for (const [lx, lz] of [
      [-w / 2 + 0.1, -d / 2 + 0.1],
      [w / 2 - 0.1, -d / 2 + 0.1],
      [-w / 2 + 0.1, d / 2 - 0.1],
      [w / 2 - 0.1, d / 2 - 0.1],
    ] as const)
      b.cyl(lx, 0, lz, 0.71, 0.022, 0.022, { color: FIX.chrome }, 12);
    b.box(-w / 2 + 0.1, 0.68, -d / 2 + 0.09, w / 2 - 0.1, 0.71, -d / 2 + 0.12, { color: FIX.chrome });
    b.box(-w / 2 + 0.1, 0.68, d / 2 - 0.12, w / 2 - 0.1, 0.71, d / 2 - 0.09, { color: FIX.chrome });
    b.box(-w / 2, 0.71, -d / 2, w / 2, 0.73, d / 2, { glass: true, r: 0.006 });
  },
  tableRound(b) {
    b.cyl(0, 0, 0, 0.04, 0.3, 0.32, { tone: 0.66 }, 28);
    b.cyl(0, 0.04, 0, 0.66, 0.06, 0.09, { tone: 0.74 }, 20);
    b.cyl(0, 0.7, 0, 0.045, 0.6, 0.6, { tone: 1.06 }, 40);
  },
  coffee(b) {
    for (const [lx, lz] of [
      [-0.54, -0.24],
      [0.54, -0.24],
      [-0.54, 0.24],
      [0.54, 0.24],
    ] as const)
      b.boxC(lx, 0.2, lz, 0.05, 0.4, 0.05, { tone: 0.7 });
    b.box(-0.58, 0.1, -0.27, 0.58, 0.13, 0.27, { tone: 0.88 });
    b.box(-0.6, 0.4, -0.3, 0.6, 0.45, 0.3, { tone: 1.06, r: 0.012 });
  },
  side(b) {
    b.cyl(0, 0, 0, 0.025, 0.2, 0.2, { tone: 0.55 }, 24);
    b.cyl(0, 0.025, 0, 0.52, 0.025, 0.03, { color: FIX.metal }, 12);
    b.cyl(0, 0.545, 0, 0.03, 0.25, 0.25, { tone: 1.05 }, 32);
  },
  console(b) {
    for (const [lx, lz] of [
      [-0.66, -0.16],
      [0.66, -0.16],
      [-0.66, 0.16],
      [0.66, 0.16],
    ] as const)
      b.boxC(lx, 0.38, lz, 0.05, 0.76, 0.05, { tone: 0.72 });
    b.box(-0.68, 0.18, -0.18, 0.68, 0.21, 0.18, { tone: 0.86 });
    b.box(-0.7, 0.76, -0.2, 0.7, 0.8, 0.2, { tone: 1.05, r: 0.01 });
  },
  desk(b) {
    b.box(-0.7, 0, -0.33, -0.26, 0.72, 0.33, { tone: 0.96, r: 0.01 });
    for (const y of [0.24, 0.48]) b.box(-0.69, y - 0.006, 0.33, -0.27, y + 0.006, 0.335, { color: FIX.seam });
    for (const y of [0.13, 0.37, 0.6]) b.box(-0.53, y - 0.01, 0.335, -0.43, y + 0.01, 0.35, { color: FIX.metal });
    b.boxC(0.65, 0.36, -0.29, 0.05, 0.72, 0.05, { tone: 0.9 });
    b.boxC(0.65, 0.36, 0.29, 0.05, 0.72, 0.05, { tone: 0.9 });
    b.box(-0.26, 0.32, -0.33, 0.65, 0.68, -0.31, { tone: 0.9 });
    b.box(-0.7, 0.72, -0.35, 0.7, 0.755, 0.35, { tone: 1.06, r: 0.008 });
  },
  chair(b) {
    diningChair(b, 1);
  },
  kids(b) {
    diningChair(b, 0.66);
  },
  stool(b) {
    for (const [lx, lz] of [
      [-0.14, -0.14],
      [0.14, -0.14],
      [-0.14, 0.14],
      [0.14, 0.14],
    ] as const)
      b.boxC(lx, 0.365, lz, 0.035, 0.73, 0.035, { tone: 0.78 });
    b.box(-0.14, 0.27, -0.155, 0.14, 0.29, -0.125, { tone: 0.78 });
    b.box(-0.14, 0.27, 0.125, 0.14, 0.29, 0.155, { tone: 0.78 });
    b.box(-0.155, 0.27, -0.14, -0.125, 0.29, 0.14, { color: FIX.metal });
    b.box(0.125, 0.27, -0.14, 0.155, 0.29, 0.14, { color: FIX.metal });
    b.cyl(0, 0.73, 0, 0.04, 0.2, 0.19, { tone: 1.06 }, 28);
  },
  armchair(b) {
    for (const [lx, lz] of [
      [-0.33, -0.33],
      [0.33, -0.33],
      [-0.33, 0.33],
      [0.33, 0.33],
    ] as const)
      b.cyl(lx, 0, lz, 0.09, 0.022, 0.018, { color: FIX.legDark }, 10);
    b.box(-0.4, 0.09, -0.38, 0.4, 0.4, 0.4, { tone: 0.9, r: 0.06 });
    b.box(-0.4, 0.09, -0.4, 0.4, 0.84, -0.2, { tone: 0.95, r: 0.09 });
    b.box(-0.4, 0.09, -0.34, -0.27, 0.62, 0.4, { tone: 0.97, r: 0.06 });
    b.box(0.27, 0.09, -0.34, 0.4, 0.62, 0.4, { tone: 0.97, r: 0.06 });
    b.box(-0.27, 0.4, -0.22, 0.27, 0.53, 0.39, { tone: 1.05, r: 0.06 });
  },
  office(b) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.boxC(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, 0.3, 0.035, 0.05, { color: FIX.rubber, rotY: -a });
      b.cyl(Math.cos(a) * 0.29, 0, Math.sin(a) * 0.29, 0.045, 0.025, 0.025, { color: FIX.rubber }, 8);
    }
    b.cyl(0, 0.075, 0, 0.36, 0.028, 0.032, { color: FIX.chrome }, 12);
    b.box(-0.26, 0.42, -0.22, 0.26, 0.5, 0.28, { tone: 1, r: 0.04 });
    b.box(-0.03, 0.46, -0.3, 0.03, 0.66, -0.26, { color: FIX.rubber });
    b.box(-0.24, 0.6, -0.31, 0.24, 1.05, -0.25, { tone: 1.05, r: 0.05 });
    b.box(-0.3, 0.5, -0.05, -0.27, 0.66, 0.15, { color: FIX.rubber });
    b.box(0.27, 0.5, -0.05, 0.3, 0.66, 0.15, { color: FIX.rubber });
  },
  lounge(b) {
    for (const [lx, lz] of [
      [-0.32, -0.36],
      [0.32, -0.36],
      [-0.32, 0.36],
      [0.32, 0.36],
    ] as const)
      b.boxC(lx, 0.06, lz, 0.05, 0.12, 0.05, { color: "#3a2a1c" });
    b.box(-0.38, 0.12, -0.38, 0.38, 0.32, 0.44, { tone: 0.9, r: 0.05 });
    b.box(-0.33, 0.32, -0.26, 0.33, 0.43, 0.43, { tone: 1.06, r: 0.06 });
    b.box(-0.38, 0.12, -0.46, 0.38, 0.88, -0.24, { tone: 0.94, r: 0.1, rotY: 0 });
    b.box(-0.38, 0.12, -0.36, -0.31, 0.5, 0.44, { tone: 0.86, r: 0.03 });
    b.box(0.31, 0.12, -0.36, 0.38, 0.5, 0.44, { tone: 0.86, r: 0.03 });
  },
  rocking(b) {
    b.box(-0.25, 0, -0.4, -0.21, 0.05, 0.42, { tone: 0.72, r: 0.015 });
    b.box(0.21, 0, -0.4, 0.25, 0.05, 0.42, { tone: 0.72, r: 0.015 });
    for (const [lx, lz] of [
      [-0.23, -0.2],
      [0.23, -0.2],
      [-0.23, 0.22],
      [0.23, 0.22],
    ] as const)
      b.boxC(lx, 0.24, lz, 0.035, 0.4, 0.035, { tone: 0.8 });
    b.box(-0.26, 0.42, -0.24, 0.26, 0.46, 0.26, { tone: 1.04, r: 0.012 });
    for (const x of [-0.18, -0.06, 0.06, 0.18]) b.boxC(x, 0.73, -0.23, 0.025, 0.54, 0.025, { tone: 0.85 });
    b.boxC(-0.23, 0.74, -0.23, 0.035, 0.6, 0.035, { tone: 0.8 });
    b.boxC(0.23, 0.74, -0.23, 0.035, 0.6, 0.035, { tone: 0.8 });
    b.box(-0.26, 0.98, -0.26, 0.26, 1.06, -0.2, { tone: 1, r: 0.015 });
    b.box(-0.27, 0.62, -0.22, -0.23, 0.65, 0.2, { tone: 0.95 });
    b.box(0.23, 0.62, -0.22, 0.27, 0.65, 0.2, { tone: 0.95 });
  },
  wardrobe2(b) {
    wardrobe(b, 2);
  },
  wardrobe3(b) {
    wardrobe(b, 3);
  },
  cabinet(b) {
    const w = 1.8;
    const d = 0.45;
    for (const [lx, lz] of [
      [-w / 2 + 0.08, -d / 2 + 0.06],
      [w / 2 - 0.08, -d / 2 + 0.06],
      [-w / 2 + 0.08, d / 2 - 0.06],
      [w / 2 - 0.08, d / 2 - 0.06],
    ] as const)
      b.cyl(lx, 0, lz, 0.12, 0.02, 0.016, { tone: 0.6 }, 10);
    b.box(-w / 2, 0.12, -d / 2, w / 2, 1.15, d / 2, { tone: 1, r: 0.012 });
    b.box(-0.006, 0.16, d / 2, 0.006, 1.11, d / 2 + 0.004, { tone: 0.5 });
    b.box(-0.08, 0.75, d / 2, -0.06, 0.95, d / 2 + 0.03, { color: FIX.metal });
    b.box(0.06, 0.75, d / 2, 0.08, 0.95, d / 2 + 0.03, { color: FIX.metal });
  },
  bed(b) {
    bedFrame(b, 1.65);
  },
  bedSingle(b) {
    bedFrame(b, 1.0);
  },
  bunk(b) {
    const L = 2.05;
    const W = 1.0;
    for (const [px, pz] of [
      [-L / 2, -W / 2],
      [L / 2, -W / 2],
      [-L / 2, W / 2],
      [L / 2, W / 2],
    ] as const)
      b.boxC(px, 0.82, pz, 0.07, 1.64, 0.07, { tone: 1 });
    for (const y of [0.22, 1.1]) {
      b.box(-L / 2, y, -W / 2 + 0.01, L / 2, y + 0.14, -W / 2 + 0.05, { tone: 0.95 });
      b.box(-L / 2, y, W / 2 - 0.05, L / 2, y + 0.14, W / 2 - 0.01, { tone: 0.95 });
      b.box(-L / 2 + 0.04, y + 0.12, -W / 2 + 0.05, L / 2 - 0.04, y + 0.28, W / 2 - 0.05, { color: FIX.linen, r: 0.05 });
    }
    b.box(-L / 2, 1.4, W / 2 - 0.05, 0.3, 1.5, W / 2 - 0.01, { tone: 0.95 });
    b.box(-L / 2, 1.4, -W / 2 + 0.01, L / 2, 1.5, -W / 2 + 0.05, { tone: 0.95 });
    b.boxC(0.5, 0.8, W / 2 + 0.02, 0.04, 1.6, 0.04, { tone: 0.9 });
    b.boxC(0.92, 0.8, W / 2 + 0.02, 0.04, 1.6, 0.04, { tone: 0.9 });
    for (const y of [0.45, 0.8, 1.15]) b.boxC(0.71, y, W / 2 + 0.02, 0.42, 0.035, 0.035, { tone: 0.9 });
    b.box(-L / 2 + 0.1, 1.38, -0.38, -L / 2 + 0.5, 1.48, 0.38, { color: FIX.pillow, r: 0.04 });
  },
  daybed(b) {
    const L = 2.0;
    const W = 0.9;
    b.box(-L / 2, 0.08, -W / 2, L / 2, 0.32, W / 2, { tone: 1, r: 0.03 });
    for (const [lx, lz] of [
      [-L / 2 + 0.06, -W / 2 + 0.06],
      [L / 2 - 0.06, -W / 2 + 0.06],
      [-L / 2 + 0.06, W / 2 - 0.06],
      [L / 2 - 0.06, W / 2 - 0.06],
    ] as const)
      b.cyl(lx, 0, lz, 0.08, 0.025, 0.02, { tone: 0.6 }, 10);
    b.box(-L / 2, 0.32, -W / 2, L / 2, 0.86, -W / 2 + 0.08, { tone: 0.94, r: 0.03 });
    b.box(-L / 2, 0.32, -W / 2, -L / 2 + 0.08, 0.72, W / 2, { tone: 0.94, r: 0.03 });
    b.box(L / 2 - 0.08, 0.32, -W / 2, L / 2, 0.72, W / 2, { tone: 0.94, r: 0.03 });
    b.box(-L / 2 + 0.09, 0.32, -W / 2 + 0.09, L / 2 - 0.09, 0.47, W / 2 - 0.02, { color: FIX.linen, r: 0.05 });
    for (const x of [-0.55, 0, 0.55]) b.box(x - 0.26, 0.47, -W / 2 + 0.09, x + 0.26, 0.78, -W / 2 + 0.24, { color: FIX.pillow, r: 0.07 });
  },
  mattress(b) {
    b.box(-1.0, 0, -0.8, 1.0, 0.26, 0.8, { tone: 1, r: 0.07 });
    b.box(-1.0, 0.124, 0.79, 1.0, 0.136, 0.805, { tone: 0.82 });
  },
  rugRoll(b) {
    b.cylX(0, 0.2, 0, 3.4, 0.2, { tone: 1 }, 18);
    b.cylX(-1.15, 0.2, 0, 0.06, 0.206, { color: FIX.tape }, 18);
    b.cylX(1.15, 0.2, 0, 0.06, 0.206, { color: FIX.tape }, 18);
    b.cylX(-1.71, 0.2, 0, 0.02, 0.12, { tone: 0.62 }, 14);
    b.cylX(1.71, 0.2, 0, 0.02, 0.12, { tone: 0.62 }, 14);
  },
  lamp(b) {
    b.cyl(0, 0, 0, 0.03, 0.17, 0.18, { tone: 0.62 }, 28);
    b.cyl(0, 0.03, 0, 1.45, 0.014, 0.016, { tone: 0.82 }, 10);
    b.cyl(0, 1.42, 0, 0.34, 0.13, 0.21, { color: FIX.shade }, 28);
    b.cyl(0, 1.76, 0, 0.03, 0.02, 0.02, { tone: 0.82 }, 10);
  },
  carton(b) {
    carton(b, 1.5, 1.0, 1.35);
  },
  cartonTop(b) {
    carton(b, 1.3, 0.9, 1.15);
  },
  pallet(b) {
    // Standard 1.2 × 1.0 pallet; scaled per use.
    for (const z of [-0.45, 0, 0.45]) b.box(-0.6, 0, z - 0.05, 0.6, 0.022, z + 0.05, { color: FIX.pallet });
    for (const x of [-0.55, 0, 0.55])
      for (const z of [-0.45, 0, 0.45]) b.box(x - 0.05, 0.022, z - 0.05, x + 0.05, 0.1, z + 0.05, { color: "#8a6a45" });
    for (const z of [-0.45, -0.225, 0, 0.225, 0.45]) b.box(-0.6, 0.1, z - 0.05, 0.6, 0.122, z + 0.05, { color: FIX.pallet });
  },
  mirrorCrate(b) {
    b.box(-0.5, 0, -0.06, 0.5, 1.0, 0.06, { color: FIX.plywood, r: 0.008 });
    b.box(-0.42, 0.08, 0.06, 0.42, 0.92, 0.064, { tone: 1.12 });
    for (const [x, y] of [
      [-0.47, 0.03],
      [0.47, 0.03],
      [-0.47, 0.97],
      [0.47, 0.97],
    ] as const)
      b.boxC(x, y, 0, 0.08, 0.08, 0.13, { color: FIX.label });
  },
  wrapped(b) {
    // Shrink-wrapped sofa bundle waiting in the receiving dock.
    b.box(-1.32, 0, -0.5, 1.32, 0.96, 0.5, { color: FIX.wrap, r: 0.12 });
    for (const x of [-0.8, 0.8]) b.box(x - 0.04, -0.005, -0.505, x + 0.04, 0.965, 0.505, { color: FIX.strap });
    b.box(0.3, 0.55, 0.5, 0.75, 0.8, 0.508, { color: FIX.label });
  },
};

function diningChair(b: Builder, s: number) {
  const k = (v: number) => v * s;
  for (const [lx, lz] of [
    [-0.21, -0.21],
    [0.21, -0.21],
    [-0.21, 0.21],
    [0.21, 0.21],
  ] as const)
    b.boxC(k(lx), k(0.22), k(lz), k(0.035), k(0.44), k(0.035), { tone: 0.78 });
  b.box(k(-0.25), k(0.44), k(-0.25), k(0.25), k(0.48), k(0.25), { tone: 1.04, r: k(0.015) });
  b.boxC(k(-0.21), k(0.68), k(-0.23), k(0.035), k(0.42), k(0.035), { tone: 0.82 });
  b.boxC(k(0.21), k(0.68), k(-0.23), k(0.035), k(0.42), k(0.035), { tone: 0.82 });
  b.box(k(-0.23), k(0.7), k(-0.25), k(0.23), k(0.9), k(-0.21), { tone: 1, r: k(0.012) });
}

function wardrobe(b: Builder, doors: number) {
  const w = 2.2;
  const d = 0.7;
  const h = 2.1;
  b.box(-w / 2 + 0.03, 0, -d / 2 + 0.03, w / 2 - 0.03, 0.07, d / 2 - 0.04, { tone: 0.55 });
  b.box(-w / 2, 0.07, -d / 2, w / 2, h - 0.03, d / 2, { tone: 1, r: 0.012 });
  b.box(-w / 2 - 0.015, h - 0.03, -d / 2 - 0.015, w / 2 + 0.015, h, d / 2 + 0.015, { tone: 0.9, r: 0.006 });
  for (let i = 1; i < doors; i++) {
    const x = -w / 2 + (w * i) / doors;
    b.box(x - 0.006, 0.1, d / 2, x + 0.006, h - 0.07, d / 2 + 0.004, { tone: 0.48 });
    b.box(x - 0.06, 0.95, d / 2, x - 0.045, 1.3, d / 2 + 0.035, { color: FIX.metal });
    b.box(x + 0.045, 0.95, d / 2, x + 0.06, 1.3, d / 2 + 0.035, { color: FIX.metal });
  }
}

function bedFrame(b: Builder, width: number) {
  const L = 2.15;
  const W = width;
  for (const [lx, lz] of [
    [-L / 2 + 0.1, -W / 2 + 0.08],
    [L / 2 - 0.08, -W / 2 + 0.08],
    [-L / 2 + 0.1, W / 2 - 0.08],
    [L / 2 - 0.08, W / 2 - 0.08],
  ] as const)
    b.boxC(lx, 0.06, lz, 0.07, 0.12, 0.07, { tone: 0.66 });
  b.box(-L / 2 + 0.06, 0.12, -W / 2, L / 2, 0.32, W / 2, { tone: 1, r: 0.025 });
  b.box(-L / 2, 0.12, -W / 2 - 0.02, -L / 2 + 0.1, 1.05, W / 2 + 0.02, { tone: 0.96, r: 0.04 });
  b.box(-L / 2 + 0.12, 0.32, -W / 2 + 0.04, L / 2 - 0.03, 0.56, W / 2 - 0.04, { color: FIX.linen, r: 0.06 });
  const pillows = W > 1.2 ? [-W / 4, W / 4] : [0];
  const pw = W > 1.2 ? W / 2 - 0.12 : W - 0.2;
  for (const z of pillows) b.box(-L / 2 + 0.16, 0.56, z - pw / 2, -L / 2 + 0.52, 0.68, z + pw / 2, { color: FIX.pillow, r: 0.06 });
  b.box(0.2, 0.56, -W / 2 + 0.02, 0.72, 0.6, W / 2 - 0.02, { tone: 1.08, r: 0.02 });
}

function carton(b: Builder, w: number, h: number, d: number) {
  b.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, { tone: 1, r: 0.015 });
  b.box(-0.06, h, -d / 2, 0.06, h + 0.004, d / 2, { color: FIX.tape });
  b.box(-0.06, h - 0.16, d / 2, 0.06, h, d / 2 + 0.004, { color: FIX.tape });
  b.box(w / 2 - 0.48, h * 0.45, d / 2, w / 2 - 0.12, h * 0.68, d / 2 + 0.004, { color: FIX.label });
}

const cache = new Map<TemplateId, Template>();

export function getTemplate(id: TemplateId): Template {
  let t = cache.get(id);
  if (!t) {
    const b = new Builder();
    TEMPLATE_BUILDERS[id](b);
    t = b.build();
    cache.set(id, t);
  }
  return t;
}
