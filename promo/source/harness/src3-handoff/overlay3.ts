// Everything drawn in 2D for the 21 s cut: the isometric dot grid, the twin mask, the real-UI cards (with their
// before/after states), button presses, the line, the destination pin, typography and the closing mark.
import { easeInCubic, easeInOutCubic, easeOutCubic, easeOutQuart, lerp, prog } from "../src/ease";
import { drawLine, hexA, lineAt, type Seg } from "./line";
import { H, W, toPlane, toScreen, type Cam, type UV } from "./plane";
import { C, CAPTIONS, END, FOOT, T, cardBlend, cardH, dispatchAt, twinLevel, type Card, type Press, type Story } from "./story3";

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
    mk("div", "scrim", hud);
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
    await document.fonts.load('600 60px "Geist"');
    await document.fonts.load('400 14px "Geist Mono"');
  }

  update(f: number, cam: Cam) {
    this.drawGrid(f, cam);
    this.drawMask(f, cam);
    this.placeCards(f, cam);
    this.drawLineLayer(f, cam);
    this.type(f, cam);
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
      // real state → next real state: the incoming capture dissolves in on top while the card eases to its height
      const [a, b, t] = cardBlend(c, f);
      el.imgs.forEach((img, i) => {
        let o = 0;
        if (i === a) o = 1;
        if (i === b && b !== a) o = t;
        img.style.opacity = o.toFixed(3);
        img.style.zIndex = i === b ? "2" : "1";
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

  /** The press: the real button (cut from the same capture) dips under the tip, flashes, and springs back. */
  pressFx(c: Card, el: CardEl, f: number, cardW: number) {
    for (const { p, el: b, glow } of el.presses) {
      const st = c.states[p.state]!;
      const k = cardW / st.px[0];
      const [x0, y0, x1, y1] = p.btn;
      const live = f >= p.f - 10 && f < p.f + 8;
      if (!live || p.kind === "checkbox") {
        b.style.display = "none";
        continue;
      }
      // hover lift before the press, a dip at the press, a spring back after
      const hover = easeOutCubic(prog(f, p.f - 10, p.f - 4));
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
        boxShadow: `0 0 ${(18 * hover).toFixed(1)}px ${hexA(p.color, 0.45 * hover * (f < p.f + 4 ? 1 : 0.5))}`,
        // hand over to the next real state as it dissolves in
        opacity: (1 - easeInOutCubic(prog(f, p.f + 2, p.f + 7))).toFixed(3),
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
      if (s.fade) return 1 - easeInCubic(prog(f, s.fade[0], s.fade[1]));
      const clear = s.journey ? 1 : 1 - easeInOutCubic(prog(f, T.journey - 4, T.journey + 6));
      return Math.max(1 - prog(f, s.f1 + 18, s.f1 + 54), s.journey ? 0.85 * journey : 0) * clear;
    };
    // the pen rests (dimmer) while the warehouse builds itself
    const rest = easeInOutCubic(prog(f, T.morph1 - 2, T.morph1 + 8)) * (1 - easeInOutCubic(prog(f, 94, 102)));
    const tipAlpha = (1 - 0.55 * rest) * (1 - easeInCubic(prog(f, T.markClose + 2, T.markClose + 12)));
    drawLine(gu, cam, st, { width: 3.2, tipAlpha, ageFade, only: (s) => !s.top, tip: false });
    drawLine(g, cam, st, { width: 3.2, tipAlpha, ageFade, only: (s) => !!s.top });

    // press ripples (screen space): two rings from the button centre
    for (const p of this.story.presses) {
      const t = (f - p.f) / 14;
      if (t < 0 || t > 1.35) continue;
      const c = this.story.cards.find((c) => c.id === p.card)!;
      const [x0, y0, x1, y1] = p.btn;
      const [cx, cy] = toScreen(cam, this.story.cardPt(c.id, (x0 + x1) / 2, (y0 + y1) / 2));
      const big = p.kind === "button" ? 1 : 0.45;
      // a button's ripple hands over to the next real state (the button itself may no longer exist there)
      const [ba, bb, bt] = cardBlend(c, f);
      const keep = p.kind === "checkbox" ? 1 : ba > p.state ? 0 : bb > p.state ? 1 - bt : 1;
      if (keep <= 0) continue;
      for (const [delay, scale] of [[0, 1], [0.22, 0.6]] as const) {
        const u = Math.min(1, Math.max(0, (t - delay) / (1 - delay * 0.5)));
        if (u <= 0 || u >= 1) continue;
        const r = (10 + easeOutCubic(u) * 120 * scale) * big * (cam.zoom / 30);
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.strokeStyle = hexA("#ffffff", 0.85 * (1 - u) * keep);
        g.lineWidth = 2.5 * (1 - u) + 0.8;
        g.shadowColor = p.color;
        g.shadowBlur = 14;
        g.stroke();
        g.shadowBlur = 0;
      }
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
        g.shadowBlur = 16;
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
    const ft = FOOT.find((x) => f >= x.a && f < x.b);
    this.foot.textContent = ft?.text ?? "";
    this.foot.style.opacity = ft ? (0.95 * fade(f, FOOT[0]!.a, FOOT[FOOT.length - 1]!.b - 6, 10, 6)).toFixed(3) : "0";
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
