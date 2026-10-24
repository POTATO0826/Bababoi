// DOM layer of the film: real WareOrb UI captures in restrained glass frames, the cursor and its clicks,
// 3D-anchored marks, kicker typography and the brand lockup. Updated synchronously per frame.
import { project, type Shot } from "./cam";
import { easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, easeOutQuart, lerp, prog } from "./ease";
import { BAY, P, T, dispatchPath, shotAt } from "./timeline";

type XY = [number, number];
type W3 = [number, number, number];

// Lucide "warehouse" — the product's own mark (src/favicon.svg, header WarehouseIcon).
const MARK = `<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/>`;
const markSvg = (size: number, cls = "") =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#4F8BEA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MARK}</svg>`;

// ── Panels (crops are 2× device pixels) ───────────────────────────────────
interface PanelDef {
  id: string;
  srcs: string[];
  cropW: number;
  w: number; // display width (px) of the crop
  x: number;
  y: number;
  inAt: number;
  outAt: number;
  from: XY; // entrance offset
  to?: XY; // exit offset
  swap: (f: number) => number; // which src
  flashes?: { f: number; rect: [number, number, number, number]; src?: number }[]; // crop px x0,y0,x1,y1
  section?: boolean;
}
const PAD = 9;
const RIGHT = 1316;
const LEFT = 64;
const LW = 440;

const PANELS: PanelDef[] = [
  {
    id: "receipt",
    srcs: ["c01-receipt-review", "c02-receipt-checked", "c03-receipt-posted"],
    cropW: 800,
    w: 540,
    x: RIGHT,
    y: 170,
    inAt: T.receiptIn,
    outAt: 72,
    from: [90, 0],
    to: [110, 0],
    swap: (f) => (f < T.checkClick + 1 ? 0 : f < T.posted ? 1 : 2),
    flashes: [
      { f: T.checkClick, rect: [52, 666, 92, 706] },
      { f: T.postClick, rect: [26, 876, 774, 947] },
    ],
  },
  {
    id: "ageList",
    srcs: ["c04-ageing-list"],
    cropW: 632,
    w: LW,
    x: LEFT,
    y: 300,
    inAt: 90,
    outAt: 124,
    from: [-70, 0],
    to: [-90, 0],
    swap: () => 0,
  },
  {
    id: "batch",
    srcs: ["c05-ageing-batch", "c05b-handed"],
    cropW: 800,
    w: 520,
    x: 1110,
    y: 196,
    inAt: 100,
    outAt: 129,
    from: [60, 12],
    to: [80, 0],
    swap: (f) => (f < T.handed ? 0 : 1),
    flashes: [{ f: T.handClick, rect: [26, 634, 774, 705] }],
  },
  {
    id: "dealsTask",
    srcs: ["c06a-deals-task"],
    cropW: 632,
    w: LW,
    x: LEFT,
    y: 300,
    inAt: 127,
    outAt: 175,
    from: [-60, 0],
    to: [-90, 0],
    swap: () => 0,
  },
  {
    id: "buyer",
    srcs: ["c06-buyer"],
    cropW: 756,
    w: LW,
    x: LEFT,
    y: 300 + 138 + 16,
    inAt: 137,
    outAt: 175,
    from: [-60, 0],
    to: [-90, 0],
    swap: () => 0,
    section: true,
  },
  {
    id: "quotes",
    srcs: ["c07-delivery-quotes"],
    cropW: 756,
    w: 520,
    x: RIGHT,
    y: 196,
    inAt: T.quotesIn,
    outAt: 175,
    from: [90, 0],
    to: [110, 0],
    swap: () => 0,
    section: true,
    flashes: [
      { f: T.carrierClick, rect: [8, 502, 748, 595] },
      { f: T.sendClick, rect: [8, 921, 748, 992] },
    ],
  },
  {
    id: "approval",
    srcs: ["c08-approval", "c09-decision"],
    cropW: 756,
    w: LW,
    x: LEFT,
    y: 300,
    inAt: T.approvalIn,
    outAt: 227,
    from: [-70, 0],
    to: [-90, 0],
    swap: (f) => (f < T.approved + 1 ? 0 : 1),
    section: true,
    flashes: [{ f: T.approveClick, rect: [12, 523, 574, 594] }],
  },
  {
    id: "collect",
    srcs: ["c10b-collect-confirm", "c10c-collected"],
    cropW: 756,
    w: LW,
    x: LEFT,
    y: 300 + 258 + 16,
    inAt: T.collectIn,
    outAt: 227,
    from: [0, 40],
    to: [-90, 0],
    swap: (f) => (f < T.collectClick + 3 ? 0 : 1),
    section: true,
    flashes: [{ f: T.collectClick, rect: [12, 131, 592, 203] }],
  },
  {
    id: "replen",
    srcs: ["c11-replenish"],
    cropW: 632,
    w: LW,
    x: LEFT,
    y: 300,
    inAt: T.replenIn,
    outAt: 257,
    from: [-70, 0],
    to: [-90, 0],
    swap: () => 0,
  },
];

const panelScale = (d: PanelDef) => d.w / d.cropW;
/** Frame position of a point given in a panel's crop pixels. */
export function panelPoint(id: string, cx: number, cy: number): XY {
  const d = PANELS.find((p) => p.id === id)!;
  const s = panelScale(d);
  const extra = d.section ? 7 : 0;
  return [d.x + PAD + extra + cx * s, d.y + PAD + extra + cy * s];
}

// ── Cursor ────────────────────────────────────────────────────────────────
type Target = XY | ((f: number) => XY);
const atWorld = (p: W3, dy = 0): Target => (f) => {
  const q = project(shotAt(f), p);
  return [q[0], q[1] + dy];
};
const atPanel = (id: string, cx: number, cy: number): Target => () => panelPoint(id, cx, cy);
const CURSOR: { f: number; t: Target }[] = [
  { f: 40, t: [1560, 1010] },
  { f: 47, t: atPanel("receipt", 72, 686) },
  { f: 50, t: atPanel("receipt", 72, 686) },
  { f: 56, t: atPanel("receipt", 430, 911) },
  { f: 59, t: atPanel("receipt", 430, 911) },
  { f: 72, t: atWorld(P.receipt, -8) },
  { f: 92, t: atWorld(P.receipt, -8) },
  { f: 96, t: atWorld(P.ageA, -10) },
  { f: 112, t: atWorld(P.ageA, -10) },
  { f: 118, t: atPanel("batch", 400, 670) },
  { f: 126, t: atPanel("batch", 400, 670) },
  { f: 150, t: [1130, 960] },
  { f: 157, t: atPanel("quotes", 300, 548) },
  { f: 160, t: atPanel("quotes", 300, 548) },
  { f: 166, t: atPanel("quotes", 378, 956) },
  { f: 176, t: atPanel("quotes", 378, 956) },
  { f: 186, t: atPanel("approval", 294, 558) },
  { f: 192, t: atPanel("approval", 294, 558) },
  { f: 203, t: atPanel("collect", 301, 167) },
  { f: 214, t: atPanel("collect", 360, 200) },
  { f: 230, t: [1240, 980] },
  { f: 238, t: atWorld(P.reorderA, -8) },
  { f: 256, t: atWorld(P.reorderA, -8) },
];
const CURSOR_VISIBLE: [number, number][] = [
  [40, 92],
  [92, 127],
  [150, 214],
  [230, 256],
];
const CLICKS = [T.checkClick, T.postClick, T.chairsClick, T.sofaClick, T.handClick, T.carrierClick, T.sendClick, T.approveClick, T.collectClick, T.oatClick];

function resolve(t: Target, f: number): XY {
  return typeof t === "function" ? t(f) : t;
}
function cursorAt(f: number): XY {
  if (f <= CURSOR[0]!.f) return resolve(CURSOR[0]!.t, f);
  for (let i = 0; i < CURSOR.length - 1; i++) {
    const a = CURSOR[i]!;
    const b = CURSOR[i + 1]!;
    if (f <= b.f) {
      const u = easeInOutCubic(prog(f, a.f, b.f));
      const pa = resolve(a.t, f);
      const pb = resolve(b.t, f);
      return [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u)];
    }
  }
  return resolve(CURSOR[CURSOR.length - 1]!.t, f);
}

// ── Bay outlines projected from the app's layout rects ──────────────────────
const RECTS: Record<string, [number, number, number, number]> = {
  [BAY.receipt]: [4.9, 54.5, 10.7, 57.1],
  [BAY.ageA]: [4.9, 12.5, 10.7, 15.1],
  [BAY.ageB]: [11.8, 12.5, 17.6, 15.1],
  [BAY.reorderA]: [25.6, 19.5, 31.4, 22.1],
  [BAY.reorderB]: [32.5, 19.5, 38.3, 22.1],
};
interface Pulse {
  bay: string;
  a: number;
  b: number;
  color: string;
  period?: number;
}
const PULSES: Pulse[] = [
  { bay: BAY.receipt, a: T.chairsLand + 4, b: T.chairsLand + 18, color: "#8db1f3" },
  { bay: BAY.ageA, a: 94, b: 122, color: "#a78bfa", period: 14 },
  { bay: BAY.ageB, a: 96, b: 122, color: "#a78bfa", period: 14 },
  { bay: BAY.dispatch, a: T.approved, b: T.approved + 14, color: "#2dd4bf" },
  { bay: BAY.dispatch, a: T.freed - 1, b: T.freed + 16, color: "#22c55e" },
];

// ── Kickers ───────────────────────────────────────────────────────────────
const KICKERS = [
  { a: 36, b: 87, eyebrow: "01 · Capture stock", title: "Check it in", sub: "A delivery note becomes a verified stock record." },
  { a: 92, b: 131, eyebrow: "02 · Turn inventory into action", title: "Spot ageing stock", sub: "Batches with no recent sales are flagged on the map." },
  { a: 135, b: 175, eyebrow: "03 · Turn inventory into action", title: "Hand off and quote", sub: "Sales adds the buyer; carrier quotes are compared." },
  { a: 178, b: 226, eyebrow: "04 · Turn inventory into action", title: "Approve, then dispatch", sub: "Stock leaves only when collection is confirmed." },
  { a: 229, b: 258, eyebrow: "05 · Make better decisions", title: "Reorder with reasons", sub: "Each suggestion shows its arithmetic." },
];
const FOOT = [
  { a: 36, b: 140, text: "Real WareOrb UI · seeded demo data" },
  { a: 140, b: 228, text: "Real WareOrb UI · synthetic carrier quotes · simulated booking" },
  { a: 228, b: 258, text: "Real WareOrb UI · seeded demo data" },
];

const el = (tag: string, cls: string, parent: HTMLElement, html = "") => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
};
const set = (e: HTMLElement | SVGElement, styles: Record<string, string | number>) => {
  for (const [k, v] of Object.entries(styles)) (e as HTMLElement).style.setProperty(k, String(v));
};
const fade = (f: number, a: number, b: number, inDur = 8, outDur = 6) => Math.min(easeOutCubic(prog(f, a, a + inDur)), 1 - easeInCubic(prog(f, b, b + outDur)));

export class Overlay {
  panels = new Map<string, { root: HTMLElement; imgs: HTMLImageElement[]; flash: HTMLElement }>();
  svg!: SVGSVGElement;
  cursor!: HTMLElement;
  ripple!: HTMLElement;
  chip!: HTMLElement;
  pill!: HTMLElement;
  tags: Record<string, HTMLElement> = {};
  pulses: SVGPolygonElement[] = [];
  route!: SVGPathElement;
  routeDot!: SVGCircleElement;
  pin!: HTMLElement;
  leader!: SVGPathElement;
  brand!: HTMLElement;
  scrim!: HTMLElement;
  tagline!: HTMLElement;
  kick!: { root: HTMLElement; eyebrow: HTMLElement; title: HTMLElement; sub: HTMLElement };
  foot!: HTMLElement;
  end!: { root: HTMLElement; mark: HTMLElement; word: HTMLElement; lines: HTMLElement[]; footer: HTMLElement };

  constructor(public ui: HTMLElement, public hud: HTMLElement) {}

  async load() {
    // panels
    for (const d of PANELS) {
      const root = el("div", "glass" + (d.section ? " section" : ""), this.ui);
      const inner = el("div", "inner", root);
      const imgs = d.srcs.map((s, i) => {
        const img = el("img", "crop", inner) as HTMLImageElement;
        img.src = `./ui/${s}.png`;
        img.style.width = `${d.w}px`;
        if (i > 0) img.classList.add("stack");
        return img;
      });
      const flash = el("div", "flash", inner);
      this.panels.set(d.id, { root, imgs, flash });
    }
    await Promise.all([...this.panels.values()].flatMap((p) => p.imgs.map((i) => i.decode())));

    // marks layer (SVG, frame coordinates)
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "marks");
    this.svg.setAttribute("width", "1920");
    this.svg.setAttribute("height", "1080");
    this.ui.insertBefore(this.svg, this.ui.firstChild);
    for (let i = 0; i < PULSES.length * 2; i++) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      this.svg.appendChild(p);
      this.pulses.push(p);
    }
    this.route = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.route.setAttribute("class", "route");
    this.svg.appendChild(this.route);
    this.routeDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this.routeDot.setAttribute("r", "6");
    this.routeDot.setAttribute("class", "routeDot");
    this.svg.appendChild(this.routeDot);
    this.leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.leader.setAttribute("class", "leader");
    this.svg.appendChild(this.leader);

    this.pin = el("div", "pin", this.ui, `<span class="dot"></span><span>Petaling Jaya · SS2</span>`);
    this.chip = el("div", "chip mono", this.ui, `4 × CHAIR-LUMA-0410 <span class="arrow">→</span> C-3-01`);
    this.pill = el("div", "pill ageing", this.ui, `Finding buyer`);
    this.tags.receipt = el("div", "tag mono", this.ui, `C-3-01`);
    this.tags.reserved = el("div", "tag mono teal", this.ui, `A-1-01 ×2 · reserved`);
    this.tags.freed = el("div", "tag mono green", this.ui, `A-1-01 · freed`);

    this.ripple = el("div", "ripple", this.ui);
    this.cursor = el(
      "div",
      "cursor",
      this.ui,
      `<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4.5 2.8 L4.5 19.6 L9.1 15.4 L12.1 22 L15 20.7 L12.1 14.3 L18.3 14.3 Z" fill="#fafafa" stroke="#09090b" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
    );

    // HUD
    this.scrim = el("div", "scrim", this.hud);
    this.brand = el("div", "brand", this.hud, `${markSvg(26, "mk")}<span class="word">WareOrb</span>`);
    this.tagline = el("div", "tagline", this.hud, `A live 3D view of your stock ledger.`);
    const k = el("div", "kicker", this.hud);
    this.kick = { root: k, eyebrow: el("div", "eyebrow mono", k), title: el("div", "title", k), sub: el("div", "sub", k) };
    this.foot = el("div", "foot mono", this.hud);
    const end = el("div", "end", this.hud);
    const lines = el("div", "statement", end);
    this.end = {
      root: end,
      mark: el("div", "endmark", end, markSvg(96, "draw")),
      word: el("div", "endword", end, "WareOrb"),
      lines: ["Capture stock.", "Turn inventory into action.", "Make better decisions."].map((t) => el("span", "", lines, t)),
      footer: el("div", "endfoot mono", end, "Hackathon prototype · shown with seeded demo data"),
    };
    end.insertBefore(lines, this.end.footer);
    await document.fonts.load('600 40px "Geist"');
    await document.fonts.load('400 14px "Geist Mono"');
  }

  update(f: number, shot: Shot, _click: { z: number; px: number; py: number }) {
    const pj = (p: W3) => project(shot, p);

    // ── panels
    for (const d of PANELS) {
      const p = this.panels.get(d.id)!;
      const tin = easeOutQuart(prog(f, d.inAt, d.inAt + 9));
      const tout = easeInCubic(prog(f, d.outAt, d.outAt + 7));
      const vis = tin > 0 && tout < 1;
      const to = d.to ?? [0, 0];
      const x = d.x + d.from[0] * (1 - tin) + to[0] * tout;
      const y = d.y + d.from[1] * (1 - tin) + to[1] * tout;
      const sc = lerp(0.97, 1, tin);
      set(p.root, { display: vis ? "block" : "none", opacity: (tin * (1 - tout)).toFixed(3), transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(4)})` });
      // state swaps cross-fade over 3 frames
      const idx = d.swap(f);
      let sw = -1;
      for (let g = f; g > f - 3; g--) if (d.swap(g) !== d.swap(g - 1)) { sw = g; break; }
      const prevIdx = sw >= 0 ? d.swap(sw - 1) : idx;
      const u = sw >= 0 ? easeOutCubic((f - sw + 1) / 3) : 1;
      p.imgs.forEach((img, i) => {
        const o = i === idx ? u : i === prevIdx ? 1 - u : 0;
        img.style.opacity = o.toFixed(3);
        img.style.display = o > 0.001 ? "block" : "none";
      });
      // button flash on click
      let flashA = 0;
      let rect: [number, number, number, number] | null = null;
      for (const fl of d.flashes ?? []) {
        const t = f - fl.f;
        if (t >= -1 && t <= 7) {
          const a = t < 1 ? lerp(0, 0.34, (t + 1) / 2) : 0.34 * (1 - easeOutCubic((t - 1) / 6));
          if (a > flashA) {
            flashA = a;
            rect = fl.rect;
          }
        }
      }
      if (rect && flashA > 0.002) {
        const s = panelScale(d);
        set(p.flash, { display: "block", opacity: flashA.toFixed(3), left: `${rect[0] * s}px`, top: `${rect[1] * s}px`, width: `${(rect[2] - rect[0]) * s}px`, height: `${(rect[3] - rect[1]) * s}px` });
      } else p.flash.style.display = "none";
    }

    // ── bay pulses (projected ground outlines)
    let pi = 0;
    for (const pu of PULSES) {
      const r = RECTS[pu.bay]!;
      const cx = (r[0] + r[2]) / 2;
      const cz = (r[1] + r[3]) / 2;
      const rings = pu.period ? 2 : 1;
      for (let k = 0; k < 2; k++) {
        const poly = this.pulses[pi++]!;
        if (k >= rings || f < pu.a || f > pu.b) {
          poly.style.display = "none";
          continue;
        }
        let t: number;
        if (pu.period) t = (((f - pu.a) / pu.period + k * 0.5) % 1 + 1) % 1;
        else t = prog(f, pu.a, pu.b);
        const env = pu.period ? fade(f, pu.a, pu.b - 6, 6, 6) : 1;
        const grow = 1 + 0.55 * easeOutCubic(t);
        const corners: W3[] = [
          [cx + (r[0] - cx) * grow, 0.03, cz + (r[1] - cz) * grow],
          [cx + (r[2] - cx) * grow, 0.03, cz + (r[1] - cz) * grow],
          [cx + (r[2] - cx) * grow, 0.03, cz + (r[3] - cz) * grow],
          [cx + (r[0] - cx) * grow, 0.03, cz + (r[3] - cz) * grow],
        ];
        poly.setAttribute("points", corners.map((c) => pj(c).map((v) => v.toFixed(1)).join(",")).join(" "));
        poly.style.display = "block";
        poly.style.fill = "none";
        poly.style.stroke = pu.color;
        poly.style.strokeWidth = `${lerp(2.6, 1, t)}`;
        poly.style.opacity = ((1 - t) * 0.9 * env).toFixed(3);
      }
    }

    // ── chip: posted line flies from the receipt history to C-3-01
    {
      const t = prog(f, T.posted + 1, T.chairsLand + 4);
      const vis = f >= T.posted + 1 && f <= T.chairsLand + 8;
      if (vis) {
        const a = panelPoint("receipt", 120, 736);
        const b = pj([P.receipt[0], 1.6, P.receipt[2]]);
        const u = easeInOutCubic(t);
        const x = lerp(a[0], b[0], u);
        const y = lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * 120;
        const o = Math.min(easeOutCubic(prog(f, T.posted + 1, T.posted + 3)), 1 - prog(f, T.chairsLand + 4, T.chairsLand + 8));
        set(this.chip, { display: "flex", opacity: o.toFixed(3), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${lerp(1, 0.82, u).toFixed(3)})` });
      } else this.chip.style.display = "none";
    }

    // ── pill: the ageing flag becomes a task for sales
    {
      const vis = f >= T.handed && f <= 134;
      if (vis) {
        const t = easeInOutCubic(prog(f, T.handed, 131));
        const a = pj([P.ageA[0], 1.2, P.ageA[2]]);
        const b = panelPoint("dealsTask", 530, 140);
        const x = lerp(a[0], b[0], t);
        const y = lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 90;
        const o = Math.min(easeOutCubic(prog(f, T.handed, T.handed + 2)), 1 - prog(f, 130, 134));
        set(this.pill, { display: "inline-flex", opacity: o.toFixed(3), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)` });
      } else this.pill.style.display = "none";
    }

    // ── 3D-anchored tags
    const tag = (e: HTMLElement, p: W3, a: number, b: number, dy = -26) => {
      const o = fade(f, a, b, 5, 5);
      if (o <= 0.001) return void (e.style.display = "none");
      const q = pj(p);
      set(e, { display: "block", opacity: o.toFixed(3), transform: `translate(${q[0].toFixed(1)}px, ${(q[1] + dy - 6 * (1 - o)).toFixed(1)}px) translate(-50%, -100%)` });
    };
    tag(this.tags.receipt!, [P.receipt[0], 1.4, P.receipt[2]], T.chairsLand + 6, 84);
    tag(this.tags.reserved!, [P.ageA[0], 1.4, P.ageA[2]], T.approved + 1, T.leaveStart - 1);
    tag(this.tags.freed!, [P.ageA[0], 0.4, P.ageA[2]], T.freed, 252);

    // ── leader from the batch card to the sofas
    {
      const o = fade(f, 106, 128, 6, 5);
      if (o > 0.001) {
        const a = panelPoint("batch", 0, 120);
        const b = pj([P.ageA[0] + 2.4, 1.0, P.ageA[2] - 0.6]);
        const midx = lerp(a[0], b[0], 0.45);
        this.leader.setAttribute("d", `M ${a[0] - 6} ${a[1]} C ${midx} ${a[1]}, ${midx} ${b[1]}, ${b[0]} ${b[1]}`);
        this.leader.style.opacity = o.toFixed(3);
        this.leader.style.display = "block";
      } else this.leader.style.display = "none";
    }

    // ── route: outbound dock → buyer destination (next to the quote comparison)
    {
      const o = fade(f, 144, 174, 2, 6);
      if (o > 0.001) {
        const a = pj(P.outDoor);
        const b: XY = panelPoint("quotes", -14, 548);
        const c1: XY = [a[0] + 120, a[1] - 330];
        const c2: XY = [b[0] - 240, b[1] - 10];
        const d = `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${b[0]} ${b[1]}`;
        this.route.setAttribute("d", d);
        const len = this.route.getTotalLength();
        const draw = easeInOutCubic(prog(f, 144, 160));
        set(this.route, { display: "block", opacity: o.toFixed(3), "stroke-dasharray": `${len}`, "stroke-dashoffset": `${(len * (1 - draw)).toFixed(1)}` });
        const pt = this.route.getPointAtLength(len * draw);
        this.routeDot.setAttribute("cx", pt.x.toFixed(1));
        this.routeDot.setAttribute("cy", pt.y.toFixed(1));
        this.routeDot.style.display = "block";
        this.routeDot.style.opacity = o.toFixed(3);
        const po = o * easeOutCubic(prog(f, 156, 162));
        set(this.pin, { display: po > 0.001 ? "flex" : "none", opacity: po.toFixed(3), transform: `translate(${b[0]}px, ${b[1]}px) translate(-100%, -150%) translateX(-8px)` });
      } else {
        this.route.style.display = "none";
        this.routeDot.style.display = "none";
        this.pin.style.display = "none";
      }
    }

    // ── cursor and clicks
    {
      let vis = 0;
      for (const [a, b] of CURSOR_VISIBLE) vis = Math.max(vis, fade(f, a, b - 4, 4, 4));
      const [x, y] = cursorAt(f);
      const press = CLICKS.some((c) => f >= c && f <= c + 1) ? 0.86 : 1;
      set(this.cursor, { display: vis > 0.001 ? "block" : "none", opacity: vis.toFixed(3), transform: `translate(${(x - 6).toFixed(1)}px, ${(y - 3).toFixed(1)}px) scale(${press})` });
      const c = [...CLICKS].reverse().find((c) => f >= c && f <= c + 10);
      if (c !== undefined && vis > 0.01) {
        const t = (f - c) / 10;
        const [cx, cy] = cursorAt(c);
        const r = lerp(8, 46, easeOutCubic(t));
        set(this.ripple, { display: "block", opacity: (0.85 * (1 - t)).toFixed(3), width: `${r * 2}px`, height: `${r * 2}px`, transform: `translate(${(cx - r).toFixed(1)}px, ${(cy - r).toFixed(1)}px)` });
      } else this.ripple.style.display = "none";
    }

    // ── HUD: brand lockup (hook) → corner chip
    {
      const appear = easeOutCubic(prog(f, 6, 18));
      const shrink = easeInOutCubic(prog(f, 28, 38));
      const out = easeInCubic(prog(f, 256, 262));
      const sc = lerp(2.6, 1, shrink);
      const x = lerp(92, 64, shrink);
      const y = lerp(92 + 18 * (1 - appear), 46, shrink);
      set(this.brand, { opacity: (appear * (1 - out)).toFixed(3), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(4)})` });
      const tl = fade(f, 13, 27, 8, 6);
      set(this.tagline, { opacity: tl.toFixed(3), transform: `translate(96px, ${(196 + 10 * (1 - easeOutCubic(prog(f, 13, 21)))).toFixed(1)}px)` });
    }

    // ── kicker
    this.scrim.style.opacity = fade(f, 30, 258, 10, 8).toFixed(3);
    {
      const k = KICKERS.find((k) => f >= k.a && f < k.b + 6);
      if (k) {
        const tin = easeOutQuart(prog(f, k.a, k.a + 9));
        const tout = easeInCubic(prog(f, k.b, k.b + 6));
        this.kick.eyebrow.textContent = k.eyebrow;
        this.kick.title.textContent = k.title;
        this.kick.sub.textContent = k.sub;
        set(this.kick.root, { display: "block", opacity: (tin * (1 - tout)).toFixed(3) });
        set(this.kick.eyebrow, { transform: `translateY(${(10 * (1 - tin)).toFixed(1)}px)` });
        set(this.kick.title, { transform: `translateY(${(14 * (1 - easeOutQuart(prog(f, k.a + 1, k.a + 10)))).toFixed(1)}px)` });
        set(this.kick.sub, { transform: `translateY(${(14 * (1 - easeOutQuart(prog(f, k.a + 2, k.a + 11)))).toFixed(1)}px)`, opacity: easeOutCubic(prog(f, k.a + 2, k.a + 10)).toFixed(3) });
      } else this.kick.root.style.display = "none";
      const ft = FOOT.find((x) => f >= x.a && f < x.b);
      if (ft) {
        this.foot.textContent = ft.text;
        set(this.foot, { opacity: (fade(f, 36, 258, 8, 6) * 0.9).toFixed(3) });
      } else this.foot.style.opacity = "0";
    }

    // ── end card
    {
      const on = f >= 257;
      this.end.root.style.display = on ? "flex" : "none";
      if (on) {
        const draw = easeInOutCubic(prog(f, 258, 270));
        const paths = this.end.mark.querySelectorAll<SVGGeometryElement>("path,rect");
        paths.forEach((p) => {
          const len = (p as SVGGeometryElement).getTotalLength?.() ?? 60;
          p.style.strokeDasharray = `${len}`;
          p.style.strokeDashoffset = `${(len * (1 - draw)).toFixed(2)}`;
        });
        set(this.end.mark, { opacity: easeOutCubic(prog(f, 258, 263)).toFixed(3), transform: `translateY(${(12 * (1 - easeOutCubic(prog(f, 258, 269)))).toFixed(1)}px) scale(${lerp(0.94, 1, easeOutBack(prog(f, 258, 272), 1.1)).toFixed(4)})` });
        const w = easeOutQuart(prog(f, 261, 272));
        set(this.end.word, { opacity: w.toFixed(3), transform: `translateY(${(18 * (1 - w)).toFixed(1)}px)`, "letter-spacing": `${lerp(0.02, -0.025, w).toFixed(4)}em` });
        this.end.lines.forEach((ln, i) => {
          const t = easeOutQuart(prog(f, 264 + i * 3, 272 + i * 3));
          set(ln, { opacity: t.toFixed(3), transform: `translateY(${(12 * (1 - t)).toFixed(1)}px)` });
        });
        set(this.end.footer, { opacity: (0.9 * easeOutCubic(prog(f, 276, 286))).toFixed(3) });
      }
    }
  }
}

// keep tree-shaking honest about helpers used only in some builds
export const _unused = { dispatchPath };
