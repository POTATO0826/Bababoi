// Everything drawn in 2D for the 21 s cut: the isometric dot grid, the twin mask, the real-UI cards (with their
// before/after states), button presses, the line, the destination pin, typography and the closing mark.
import { easeInCubic, easeInOutCubic, easeOutCubic, easeOutQuart, lerp, prog } from "../src/ease";
import { drawLine, hexA, lineAt, type Seg } from "./line";
import { H, W, toPlane, toScreen, type Cam, type UV } from "./plane";
import { C, CAPTIONS, END, FOOT, T, WAVE, cardBlend, cardH, dispatchAt, twinLevel, type Card, type Press, type Story } from "./story3";

const mk = (tag: string, cls: string, parent: HTMLElement, html = "") => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
};
const fade = (f: number, a: number, b: number, i = 8, o = 6) => Math.min(easeOutCubic(prog(f, a, a + i)), 1 - easeInCubic(prog(f, b, b + o)));

interface CardEl {
  root: HTMLElement;
  imgs: HTMLImageElement[];
  presses: { p: Press; el: HTMLElement; glow: HTMLElement }[];
}

export class Overlay3 {
  grid!: HTMLCanvasElement;
  line!: HTMLCanvasElement;
  /** The trail is drawn under the cards (cards float above it); strokes that act on a card are drawn on top. */
  under!: HTMLCanvasElement;
  cards = new Map<string, CardEl>();
  pin!: HTMLElement;
  cap!: { root: HTMLElement; idea: HTMLElement; head: HTMLElement; sub: HTMLElement };
  foot!: HTMLElement;
  hookWord!: HTMLElement;
  scrim!: HTMLElement;
  end!: { word: HTMLElement; tag: HTMLElement; credit: HTMLElement; foot: HTMLElement };

  constructor(
    public frame: HTMLElement,
    public story: Story,
    public mask: HTMLCanvasElement,
    public dpr: number,
  ) {}

  async load() {
    const canvas = (cls: string, before?: Element) => {
      const c = document.createElement("canvas");
      c.className = cls;
      c.width = W * this.dpr;
      c.height = H * this.dpr;
      if (before) this.frame.insertBefore(c, before);
      else this.frame.appendChild(c);
      return c;
    };
    this.grid = canvas("grid", document.getElementById("gl")!);
    this.under = canvas("line-under");
    const cardsLayer = mk("div", "cards", this.frame);
    for (const c of this.story.cards) {
      const root = mk("div", "card", cardsLayer);
      const imgs = c.states.map((s) => {
        const i = mk("img", "", root) as HTMLImageElement;
        i.src = `./${s.src}.png`;
        return i;
      });
      // a pressable copy of each real button, cut from the same screenshot, so the press can move it physically
      const presses = this.story.presses
        .filter((p) => p.card === c.id)
        .map((p) => {
          const el = mk("div", `press ${p.kind}`, root);
          const st = c.states[p.state]!;
          const [x0, y0, x1, y1] = p.btn;
          Object.assign(el.style, {
            left: `${(x0 / st.px[0]) * 100}%`,
            top: `${(y0 / st.px[0]) * 100 * 1}%`,
            width: `${((x1 - x0) / st.px[0]) * 100}%`,
            backgroundImage: `url(./${st.src}.png)`,
          } as Partial<CSSStyleDeclaration>);
          const glow = mk("div", "glow", el);
          return { p, el, glow };
        });
      this.cards.set(c.id, { root, imgs, presses });
    }
    await Promise.all([...this.cards.values()].flatMap((c) => c.imgs.map((i) => i.decode())));
    this.pin = mk("div", "pin", cardsLayer, `<span class="dot"></span><span class="lbl">${this.story.pin.label}</span>`);
    this.line = canvas("line");
    const hud = mk("div", "hud", this.frame);
    this.scrim = mk("div", "scrim", hud);
    const cap = mk("div", "cap", hud);
    this.cap = { root: cap, idea: mk("div", "idea mono", cap), head: mk("div", "head", cap), sub: mk("div", "sub", cap) };
    this.foot = mk("div", "foot mono", hud);
    this.hookWord = mk("div", "hookword", hud, "WareOrb");
    this.end = {
      word: mk("div", "endword", hud, END.word),
      tag: mk("div", "endtag", hud, END.tag),
      credit: mk("div", "endcredit", hud, END.credit),
      foot: mk("div", "endfoot mono", hud, END.foot),
    };
    // a fixed, sub-visible grain over the whole frame (±~1 code value): dark gradients band after 8-bit / yuv420p
    // encoding without it. Seeded, so every frame (and every render) gets the same pattern.
    {
      const g = document.createElement("canvas");
      g.width = g.height = 256;
      const c = g.getContext("2d")!;
      const img = c.createImageData(256, 256);
      let seed = 0x2f6b9d1;
      const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 256 * 256; i++) {
        const v = rnd() < 0.5 ? 255 : 0;
        img.data.set([v, v, v, Math.round(rnd() * 5)], i * 4);
      }
      c.putImageData(img, 0, 0);
      const grain = mk("div", "grain", this.frame);
      grain.style.backgroundImage = `url(${g.toDataURL("image/png")})`;
    }
    await document.fonts.load('600 60px "Geist"');
    await document.fonts.load('400 14px "Geist Mono"');
  }

  update(f: number, cam: Cam) {
    this.drawGrid(f, cam);
    this.drawMask(f, cam);
    this.placeCards(f, cam);
    this.drawLineLayer(f, cam);
    // Screen-fixed type doesn't move with the camera, so it takes no motion blur: it is set at the frame's own time
    // (the shutter's sub-frames are within ±¼ frame), and a text change is never averaged into a double exposure.
    this.type(Math.round(f), cam);
  }

  // ── isometric dot lattice on the floor plane (5 m) ─────────────────────────
  drawGrid(f: number, cam: Cam) {
    const g = this.grid.getContext("2d")!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const a = 0.9 * easeOutCubic(prog(f, 0, 20)) * (1 - 0.35 * easeInOutCubic(prog(f, T.markClose - 10, T.markClose + 20)));
    if (a <= 0) return;
    const step = 5;
    const r = Math.max(0.8, Math.min(1.6, cam.zoom / 16));
    g.fillStyle = `rgba(86,86,102,${a.toFixed(3)})`;
    for (let x = -160; x <= 260; x += step)
      for (let z = -160; z <= 240; z += step) {
        const [sx, sy] = toScreen(cam, toPlane([x, 0, z]));
        if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
        g.fillRect(sx - r / 2, sy - r / 2, r, r);
      }
  }

  // ── twin mask: full colour while it builds itself, then a ghost; full colour inside closed shapes ─
  drawMask(f: number, cam: Cam) {
    const g = this.mask.getContext("2d")!;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    const level = Math.min(1, twinLevel(f));
    const poly = (pts: UV[]) => {
      pts.forEach((p, i) => {
        const [x, y] = toScreen(cam, p);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
    };
    const radial = (o: UV, r: number, v: number) => {
      const [x, y] = toScreen(cam, o);
      const grad = g.createRadialGradient(x, y, Math.max(0, r - 60), x, y, Math.max(1, r));
      const c = Math.round(v * 255);
      grad.addColorStop(0, `rgb(${c},${c},${c})`);
      grad.addColorStop(1, "rgb(0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    };
    if (level > 0.001) {
      const m = this.story.morphAt(f);
      const sil = this.story.morphPts(m);
      g.save();
      g.beginPath();
      poly(sil);
      g.clip();
      const open = easeOutCubic(prog(f, T.twinOpen, T.twinOpen + 20));
      radial(sil[0]!, 60 + open * 2600, level);
      g.restore();
    }
    g.globalCompositeOperation = "lighten";
    for (const w of this.story.windows) {
      const p = easeOutCubic(prog(f, w.r[0], w.r[1]));
      const q = easeInOutCubic(prog(f, w.h[0], w.h[1]));
      if (p <= 0 || q >= 1) continue;
      const v = lerp(1, Math.min(1, level), q);
      g.save();
      g.beginPath();
      for (const pts of w.poly) poly(pts);
      g.clip("nonzero");
      radial(w.origin, 40 + p * 1400 * (cam.zoom / 24), v);
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
  }

  // ── real UI cards, revealed from the point where the line closes around them ─
  placeCards(f: number, cam: Cam) {
    for (const c of this.story.cards) {
      const el = this.cards.get(c.id)!;
      const p = easeOutCubic(prog(f, c.reveal[0], c.reveal[1]));
      const out = easeInCubic(prog(f, c.out[0], c.out[1]));
      if (p <= 0 || out >= 1) {
        el.root.style.display = "none";
        continue;
      }
      const [x, y] = toScreen(cam, c.tl);
      const w = c.w * cam.zoom;
      const h = cardH(c, f) * cam.zoom;
      if (x > W + 50 || y > H + 50 || x + w < -50 || y + h < -50) {
        el.root.style.display = "none";
        continue;
      }
      const [ox, oy] = toScreen(cam, c.origin);
      const r = p * Math.hypot(w, h) * 1.05;
      const m = `radial-gradient(circle at ${(ox - x).toFixed(1)}px ${(oy - y).toFixed(1)}px, #000 ${Math.max(0, r - 30).toFixed(1)}px, transparent ${r.toFixed(1)}px)`;
      Object.assign(el.root.style, {
        display: "block",
        width: `${w.toFixed(2)}px`,
        height: `${h.toFixed(2)}px`,
        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
        opacity: (1 - out).toFixed(3),
        maskImage: m,
        webkitMaskImage: m,
        borderRadius: `${Math.max(6, 0.45 * cam.zoom).toFixed(1)}px`,
      } as Partial<CSSStyleDeclaration>);
      // real state → next real state: the next capture is revealed inside a wave that leaves the pressed control,
      // so no frame shows two different layouts on top of each other; the card then eases to its new height
      const [a, b] = cardBlend(c, f);
      const wave = this.waveAt(c, f, w);
      el.imgs.forEach((img, i) => {
        const shown = i === a || i === b;
        // what is left of the outgoing state recedes as the wave crosses it
        img.style.opacity = !shown ? "0" : wave && !wave.soft && i === a ? (1 - 0.45 * wave.t).toFixed(3) : "1";
        img.style.zIndex = i === b ? "2" : "1";
        const m = wave && shown ? (i === b ? wave.inside() : wave.outside()) : "none";
        img.style.maskImage = m;
        img.style.webkitMaskImage = m;
      });
      this.pressFx(c, el, f, w);
    }
    // destination pin
    {
      const pn = this.story.pin;
      const a = fade(f, pn.r[0], pn.out[0], 6, 6);
      if (a > 0.001) {
        const [x, y] = toScreen(cam, pn.at);
        Object.assign(this.pin.style, { display: "flex", opacity: a.toFixed(3), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
      } else this.pin.style.display = "none";
    }
  }

  /**
   * The wave of a state change in progress on card c at frame f (screen px, card-local), or null. Its edge is the
   * press ripple's outer ring; a checkbox spreads its change softly instead.
   */
  waveAt(c: Card, f: number, cardW: number) {
    const [a, b, t] = cardBlend(c, f);
    if (a === b) return null;
    const sw = c.swaps[a]!;
    const k = cardW / c.states[a]!.px[0];
    const ox = sw.at[0] * k;
    const oy = sw.at[1] * k;
    const hMax = Math.max(...[a, b].map((i) => (c.states[i]!.px[1] / c.states[i]!.px[0]) * cardW));
    const R = Math.max(...[[0, 0], [cardW, 0], [0, hMax], [cardW, hMax]].map(([x, y]) => Math.hypot(x! - ox, y! - oy)));
    const F = sw.soft ? 0.18 * R : 40;
    const r = t * (R + F);
    const grad = (inner: string, outer: string, dx = 0, dy = 0) =>
      `radial-gradient(circle at ${(ox - dx).toFixed(1)}px ${(oy - dy).toFixed(1)}px, ${inner} ${Math.max(0, r - F).toFixed(1)}px, ${outer} ${r.toFixed(1)}px)`;
    return {
      t,
      r: r - F / 2,
      soft: !!sw.soft,
      /** mask for the incoming state */
      inside: () => grad("#000", "transparent"),
      /** mask for the outgoing state (or anything of it, offset dx, dy inside the card) */
      outside: (dx = 0, dy = 0) => grad("transparent", "#000", dx, dy),
    };
  }

  /** The press: the real button (cut from the same capture) dips under the tip, flashes, and is swept away by the wave. */
  pressFx(c: Card, el: CardEl, f: number, cardW: number) {
    const [a] = cardBlend(c, f);
    const wave = this.waveAt(c, f, cardW);
    for (const { p, el: b, glow } of el.presses) {
      const st = c.states[p.state]!;
      const k = cardW / st.px[0];
      const [x0, y0, x1, y1] = p.btn;
      const live = f >= p.f - 10 && a === p.state;
      if (!live || p.kind === "checkbox") {
        b.style.display = "none";
        continue;
      }
      // the wave that this press starts sweeps the button away with the rest of the outgoing state
      const m = wave ? wave.outside(x0 * k, y0 * k) : "none";
      // hover lift before the press (from when this state is on screen), a dip at the press, a spring back after
      const prev = c.swaps[p.state - 1];
      const from = Math.max(p.f - 10, prev ? prev.f + WAVE : -Infinity);
      const hover = easeOutCubic(prog(f, from, Math.max(from + 2, p.f - 4)));
      const dip = f < p.f ? easeInCubic(prog(f, p.f - 3, p.f)) : Math.exp(-0.55 * (f - p.f)) * Math.cos((f - p.f) * 0.9);
      const s = 1 + 0.012 * hover - 0.05 * dip;
      const bright = 1 + 0.06 * hover - 0.16 * Math.max(0, dip);
      Object.assign(b.style, {
        display: "block",
        top: `${(y0 * k).toFixed(2)}px`,
        height: `${((y1 - y0 + 1) * k).toFixed(2)}px`,
        backgroundSize: `${cardW.toFixed(2)}px auto`,
        backgroundPosition: `${(-x0 * k).toFixed(2)}px ${(-y0 * k).toFixed(2)}px`,
        borderRadius: `${(8 * k * 2).toFixed(1)}px`,
        transform: `scale(${s.toFixed(4)})`,
        filter: `brightness(${bright.toFixed(3)})`,
        // the hover glow sits outside the button, where the wave's mask would cut it: it goes as the button is pressed
        boxShadow: `0 0 ${(18 * hover).toFixed(1)}px ${hexA(p.color, 0.45 * hover * (1 - prog(f, p.f - 1, p.f + 1)))}`,
        opacity: (1 - easeOutCubic(prog(f, p.f + 1, p.f + 4))).toFixed(3),
        maskImage: m,
        webkitMaskImage: m,
      } as Partial<CSSStyleDeclaration>);
      const g = f >= p.f ? Math.max(0, 1 - (f - p.f) / 7) : 0;
      glow.style.opacity = g.toFixed(3);
      void x1;
    }
  }

  // ── the line, its glowing tip, press ripples, the dispatch rail light, and the closing mark fill ─────
  drawLineLayer(f: number, cam: Cam) {
    const g = this.line.getContext("2d")!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const gu = this.under.getContext("2d")!;
    gu.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    gu.clearRect(0, 0, W, H);
    const retract = easeInCubic(prog(f, T.retract, T.retract + 12));
    const st = lineAt(this.story.segs, f, retract);

    // mark fill: colour spreads from the closing point
    const fillT = easeOutCubic(prog(f, T.markClose, T.markClose + 12));
    if (fillT > 0) {
      const house = this.story.houseOuter;
      const [ox, oy] = toScreen(cam, this.story.houseInner[this.story.houseInner.length - 1]!);
      g.save();
      g.beginPath();
      house.forEach((p, i) => {
        const [x, y] = toScreen(cam, p);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
      g.clip();
      const R = 420 * fillT;
      const grad = g.createRadialGradient(ox, oy, Math.max(0, R - 40), ox, oy, Math.max(1, R));
      grad.addColorStop(0, C.blue);
      grad.addColorStop(1, hexA(C.blue, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    // the trail fades behind the tip; at the pull-back the whole journey lights up once before it is reeled in
    const journey = easeInOutCubic(prog(f, T.journey, T.journey + 10));
    const ageFade = (s: Seg) => {
      if (s.id === "mark") return lerp(1, 0.5, prog(f, 110, 140)) + 0.5 * prog(f, T.journey + 2, T.retract);
      if (s.keep) return 1;
      if (s.fade) return 1 - easeInOutCubic(prog(f, s.fade[0], s.fade[1]));
      const clear = s.journey ? 1 : 1 - easeInOutCubic(prog(f, T.journey - 4, T.journey + 6));
      return Math.max(1 - prog(f, s.f1 + 18, s.f1 + 54), s.journey ? 0.85 * journey : 0) * clear;
    };
    // the pen rests (dimmer) while the warehouse builds itself
    const rest = easeInOutCubic(prog(f, T.morph1 - 2, T.morph1 + 8)) * (1 - easeInOutCubic(prog(f, 94, 102)));
    // the pen's glow leaves with a card it rested on, and comes back gently when it sets off for home
    const comeHome = st.tipSeg?.id === "home" ? easeOutCubic(prog(f, T.retract - 2, T.retract + 2)) : 1;
    const tipAlpha = (1 - 0.55 * rest) * (1 - easeInCubic(prog(f, T.markClose + 2, T.markClose + 12))) * (st.tipSeg?.tipFade ? ageFade(st.tipSeg) : 1) * comeHome;
    drawLine(gu, cam, st, { width: 3.2, tipAlpha, ageFade, only: (s) => !s.top, tip: false });
    drawLine(g, cam, st, { width: 3.2, tipAlpha, ageFade, only: (s) => !!s.top });

    // press ripples (screen space), kept inside the card: a small ring at the control, and — for a button — the
    // edge of the wave that carries the next real state across the card
    for (const p of this.story.presses) {
      const t = (f - p.f) / 14;
      if (t < 0 || t > 1.35) continue;
      const c = this.story.cards.find((c) => c.id === p.card)!;
      const [x0, y0, x1, y1] = p.btn;
      const [cx, cy] = toScreen(cam, this.story.cardPt(c.id, (x0 + x1) / 2, (y0 + y1) / 2));
      const [tx, ty] = toScreen(cam, c.tl);
      const cw = c.w * cam.zoom;
      const ch = cardH(c, f) * cam.zoom;
      const big = p.kind === "button" ? 1 : 0.45;
      g.save();
      g.beginPath();
      g.roundRect(tx, ty, cw, ch, Math.max(6, 0.45 * cam.zoom));
      g.clip();
      const ring = (r: number, a: number, wdt: number) => {
        if (a <= 0.002 || r <= 0) return;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.strokeStyle = hexA("#ffffff", a);
        g.lineWidth = wdt;
        g.shadowColor = p.color;
        g.shadowBlur = 7 * this.dpr; // device px: the same 7 CSS px glow at any DPR
        g.stroke();
        g.shadowBlur = 0;
      };
      const wave = p.kind === "button" && cardBlend(c, f)[0] === p.state ? this.waveAt(c, f, cw) : null;
      const gone = p.kind === "button" ? (wave ? wave.t : cardBlend(c, f)[0] > p.state ? 1 : 0) : 0;
      const u = Math.min(1, Math.max(0, t / 0.89));
      if (u > 0 && u < 1) ring((10 + easeOutCubic(u) * 72) * big * (cam.zoom / 30), 0.85 * (1 - u) * (1 - gone), 2.5 * (1 - u) + 0.8);
      if (wave && !wave.soft) ring(wave.r, 0.8 * Math.pow(1 - wave.t, 1.6), 2.2 * (1 - wave.t) + 0.9);
      g.restore();
    }

    // light running along the rail just behind the collected units (sampled along the real path)
    {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 8; k++) {
        const w = dispatchAt(f - 4 + k * 0.5);
        if (w) pts.push(toScreen(cam, toPlane(w)));
      }
      if (pts.length > 1) {
        g.save();
        g.lineCap = "round";
        g.lineJoin = "round";
        g.shadowColor = C.teal;
        g.shadowBlur = 8 * this.dpr;
        for (let k = 1; k < pts.length; k++) {
          const a = k / (pts.length - 1);
          g.strokeStyle = hexA("#bff7ee", 0.95 * a);
          g.lineWidth = 3 + 4 * a;
          g.beginPath();
          g.moveTo(pts[k - 1]![0], pts[k - 1]![1]);
          g.lineTo(pts[k]![0], pts[k]![1]);
          g.stroke();
        }
        g.restore();
      }
    }

    // the inner bars turn dark as the fill passes under them
    if (fillT > 0) {
      const inner = this.story.houseInner;
      const [ox, oy] = toScreen(cam, inner[inner.length - 1]!);
      g.save();
      g.beginPath();
      g.arc(ox, oy, 420 * fillT, 0, Math.PI * 2);
      g.clip();
      g.beginPath();
      inner.forEach((p, i) => {
        const [x, y] = toScreen(cam, p);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokeStyle = "#0b0b0f";
      g.lineWidth = 3.6;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke();
      g.restore();
    }
  }

  // ── typography ─────────────────────────────────────────────────────────────
  type(f: number, cam: Cam) {
    // hook wordmark under the mark being drawn
    {
      const a = fade(f, 6, 40, 14, 10);
      const base = toScreen(cam, this.story.houseInner[0]!)[1];
      Object.assign(this.hookWord.style, {
        opacity: a.toFixed(3),
        transform: `translate(-50%, ${(base + 34 + 14 * (1 - easeOutQuart(prog(f, 6, 24)))).toFixed(1)}px)`,
        letterSpacing: `${lerp(0.06, -0.02, easeOutQuart(prog(f, 6, 30))).toFixed(3)}em`,
      });
    }
    // captions
    const c = CAPTIONS.find((c) => f >= c.a && f < c.b + 6);
    if (c) {
      const tin = easeOutQuart(prog(f, c.a, c.a + 10));
      const tout = easeInCubic(prog(f, c.b, c.b + 6));
      this.cap.root.style.display = "block";
      this.cap.root.style.opacity = (tin * (1 - tout)).toFixed(3);
      this.cap.idea.textContent = `${c.idea} / 03`;
      this.cap.head.textContent = c.head;
      this.cap.head.style.transform = `translateY(${(16 * (1 - tin)).toFixed(1)}px)`;
      const subs = [...c.subs].reverse();
      const sub = subs.find((s) => f >= s.a)!;
      // the previous line steps out before the next steps in
      const next = c.subs.find((s) => s.a > sub.a);
      const st = easeOutQuart(prog(f, sub.a + 2, sub.a + 12));
      const so = next ? easeInCubic(prog(f, next.a - 5, next.a)) : 0;
      this.cap.sub.textContent = sub.text;
      this.cap.sub.style.opacity = (st * (1 - so)).toFixed(3);
      this.cap.sub.style.transform = `translateY(${(10 * (1 - st) - 6 * so).toFixed(1)}px)`;
    } else this.cap.root.style.display = "none";
    const capOn = Math.max(0, ...CAPTIONS.map((x) => Math.min(easeOutCubic(prog(f, x.a - 6, x.a + 8)), 1 - easeInCubic(prog(f, x.b, x.b + 12)))));
    this.scrim.style.opacity = capOn.toFixed(3);
    const ft = FOOT.find((x) => f >= x.a && f < x.b);
    this.foot.textContent = ft?.text ?? "";
    // when the disclosure's wording changes, it dips out and back in rather than swapping under the viewer's eye
    const dip = Math.min(1, ...FOOT.slice(0, -1).map((x) => easeInOutCubic(Math.min(1, Math.abs(f - x.b + 0.5) / 4.5))));
    this.foot.style.opacity = ft ? (0.95 * fade(f, FOOT[0]!.a, FOOT[FOOT.length - 1]!.b - 6, 10, 6) * dip).toFixed(3) : "0";
    // ending: wordmark, tagline, team credit, disclosure
    const baseY = toScreen(cam, this.story.houseInner[0]!)[1];
    const w = easeOutQuart(prog(f, T.word, T.word + 12));
    Object.assign(this.end.word.style, { opacity: w.toFixed(3), transform: `translate(-50%, ${(baseY + 40 + 18 * (1 - w)).toFixed(1)}px)` });
    const t2 = easeOutQuart(prog(f, T.tag, T.tag + 10));
    Object.assign(this.end.tag.style, { opacity: t2.toFixed(3), transform: `translate(-50%, ${(baseY + 166 + 12 * (1 - t2)).toFixed(1)}px)` });
    const t3 = easeOutQuart(prog(f, T.credit, T.credit + 10));
    Object.assign(this.end.credit.style, { opacity: (0.92 * t3).toFixed(3), transform: `translate(-50%, ${(baseY + 236 + 10 * (1 - t3)).toFixed(1)}px)` });
    this.end.foot.style.opacity = (0.9 * easeOutCubic(prog(f, T.credit + 6, T.credit + 16))).toFixed(3);
  }
}
