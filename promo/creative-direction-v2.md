# WareOrb promo: reassessing the creative direction

**Recommendation: "One line."** A single unbroken line carries one batch of stock through WareOrb:

1. It draws the WareOrb mark, which opens into the real 3D warehouse.
2. It checks a delivery in and stores it in a bay.
3. It spots stock that isn't selling and carries it out to a buyer.
4. It is approved and frees the bay.
5. It shows a reorder with the maths behind it.
6. It is reeled back into the logo.

The line stands for WareOrb's ledger, where every move is recorded once and in order. Real product UI appears only inside shapes the line closes, a few seconds at a time.

Primary technique: **Reference 08, single continuous line.** Two complements:
* **Reference 03, isometric 2.5D discipline.** The line runs on the app's own true-isometric grid and along the warehouse aisles.
* **Reference 05, meaningful morphing.** The logo morphs into the warehouse at the start and back at the end.

Nothing else is borrowed.

The six revised previews are in `previews-v2/`. The originals in `previews/` are untouched. `previews-v2/compare-v1-v2.png` shows both directions at the same timestamps.

---

## 1 · The 15 references against WareOrb

| # | Reference | Fit for WareOrb | Why |
|---|---|---|---|
| 01 | Physical 3D (Blender) | Low–medium | Beautiful materials and physics, but it says nothing about workflow and has no natural place for the real UI. Cycles at 1080p on this 2-core, GPU-less workspace takes minutes per frame. |
| 02 | Liquid metal / SDF | Medium (brand only) | Matches the "Orb" name and the Orbkit orb, but it's abstract. It can't show checking, ageing, approval or dispatch without inventing metaphors. |
| 03 | Isometric 2.5D | **High (complement)** | It's the product's own geometry: the app already renders a true-isometric twin. As the *primary* style its signature move (conveyors and travelling cubes) would imply robotic automation, which WareOrb doesn't do. WareOrb coordinates people around a ledger. |
| 04 | Synthwave | Very low | Off-brand palette and mood; reads as a gimmick. |
| 05 | Continuous morphing | **High (complement)** | Meaningful at the bookends: the warehouse icon becomes the warehouse, and the warehouse becomes the icon. Morphing between nine workflow states would turn into a shape parade. |
| 06 | Bauhaus | Low | A striking poster language, but red/yellow/blue/paper fights WareOrb's dark zinc and blue identity, and no rounded corners clashes with the UI. |
| 07 | Sci-fi HUD | Medium | Fits "dark UI + AI", but it's a cliché and invites over-claiming ("scanning…", "target locked"). Its own rules require fluctuating numbers, which would be fake data. |
| 08 | Single continuous line | **Highest (primary)** | Focuses on one story and stays memorable. It is the ledger metaphor, it reveals real UI without crowding the frame, and it's fully code-driven. |
| 09 | Glassmorphism | Medium | This is roughly what v1 did. Its ≥ 0.6 s minimum motion cap fights a 10-second, nine-stage story. |
| 10 | Paper collage | Very low | Off-brand, and it needs archival imagery. |
| 11 | Pixel art | Low | Charming, but wrong for a premium tech launch, and it can't carry the real UI. |
| 12 | Boiling line | Low | Hand-drawn warmth that doesn't match a precision operations product. |
| 13 | Flat vector | Medium | Very clear, but it reads as an explainer, and objects would replace the real twin instead of showing it. |
| 14 | Sticker explainer | Medium | Real UI as stickers is attractive, but the light, educational tone fights the product identity. |
| 15 | Variety-show type | Very low | Comedic register. |

### Top five, ranked

1. **08 · Single continuous line.** One idea the viewer can follow with their eye, where the drawing tip is the story. It maps directly onto what WareOrb is: a live ledger in which every receipt, reservation and dispatch is one entry in sequence. The real twin and real UI can sit *inside* the line's shapes, so authenticity costs no screen real estate. It's distinctive (no one expects a warehouse ad to be a single stroke) and fully deterministic in code.
2. **03 · Isometric 2.5D.** The app's camera is already true isometric (30° diagonals, no perspective). Constraining the line to that grid and to the aisles makes it architectural, not decorative, and lets it trace the real 3D geometry exactly. As a primary style it would repeat v1 and imply conveyor automation.
3. **05 · Continuous morphing.** It earns its place exactly once, at each end: house icon → warehouse silhouette → house icon. Used throughout, it would compete with the line.
4. **07 · Sci-fi HUD.** It offers a useful idea, an accent colour that switches when status changes, and the line does that with the product's own state colours: blue → violet (ageing) → teal (reserved) → green (freed). The rest of the HUD vocabulary would over-claim "AI", so it isn't used.
5. **09 · Glassmorphism.** It was the right idea for v1's floating panels and is the wrong one now. The real UI cards keep only its restraint: thin outline, soft shadow, no frosted slabs.

Not chosen, but noted: **01** would look stunning and could reappear as a 1-second material study of the orb, but not in a 10-second product film on this hardware. **02** is the strongest pure-brand option if WareOrb ever wants a logo sting without product claims.

---

## 2 · Honest critique of the v1 previews

| Question | Verdict |
|---|---|
| Are the scenes too similar? | **Yes.** All six frames have the same dark isometric floor, the same layout (kicker top-left, panel on a side) and the same mid-distance camera. Only the panel content changes. |
| Is the dark warehouse repetitive? | **Yes.** It's present at full strength in every frame, so nothing is emphasised. The violet, teal and green states are small and get lost. |
| Too much screen given to complex UI? | **Yes.** Panels took 25–30 % of the frame with 13–15 px text. The viewer reads instead of watching. |
| Advert or annotated screen recording? | **Closer to an annotated screen recording.** The motion was competent, but the structure was "panel + map + caption" five times over. |
| Compelling within the first second? | **Partly.** The assembly has energy, but the identity is a small corner lockup and there's no single focal point. |
| Do transitions have choreography? | **Mostly not.** Camera pans and panel slides, with two exceptions (the history chip flying to C-3-01 and the "Finding buyer" pill). |
| Can the frontend be shown more elegantly? | **Yes.** Show the one row that matters (the line item, the 120-day badge, the three quotes, the approval maths, the reorder maths) at the moment it matters, not the whole panel. |
| Is the brand ending strong enough? | **No.** A centred wordmark over a dimmed floor, with no payoff tied to the story. |

---

## 3 · New storyboard: "One line" (10.0 s · 300 frames · 30 fps)

Shared treatment:
* **Background:** near-black studio (`#09090b` brand background) with a faint isometric dot lattice that moves with the camera.
* **The real twin**, the app's own scene components fed by the captured ledger snapshots, is ghosted (cool, desaturated, ~30 %) except where the line has closed a shape. Inside those shapes it appears in full colour.
* **Camera:** 2D pan and zoom of the true-isometric picture plane only. No rotation, ever. The three product close-ups are your earlier "click a product, zoom in, zoom out" request, now triggered by the line closing around the product.
* **The line:**
  * 3.2 px with round caps and a constant width;
  * the tip slows into corners and speeds along straights;
  * a white-blue glowing point at the tip;
  * the trail fades behind the tip to keep negative space.
* **Line colour** follows the app's own state colours: blue `#4F8BEA`, ageing violet `#a78bfa`, reserved teal `#2dd4bf`, freed green `#22c55e`.
* **Type:** Geist 600 headlines, Geist Mono labels. Three statements only, matching the three ideas.

| Time | Scene | Visual concept | Primary mechanism | Transition out | Real frontend | Camera | Light & material | Music & sound | Message |
|---|---|---|---|---|---|---|---|---|---|
| 0.0–1.0 s (f0–30) | **Hook** | A point ignites and draws the WareOrb house mark (the app's own Lucide warehouse icon), and the wordmark rises. The outline morphs, corner to corner, into the warehouse's isometric silhouette, and the real twin floods in from the far corner as stock drops into it. | Line draw → shape morph (Ref 05) → radial fill | The tip leaves the silhouette's far corner along the back wall | App icon, real 3D twin | Locked overview, slight push | Twin at full colour for ~0.5 s | Soft sub swell; a glassy "ink" tone on ignition; a chime when the mark closes (f12); a downbeat as the twin floods (f26) | "This is WareOrb, and this is your warehouse." |
| 1.0–2.9 s (f30–86) | **01 Capture stock** | The line outlines the inbound dock, and the shape fills to show the real shrink-wrapped DN-2291. It draws a card next to it, revealing the **real line item** ("Dining chair oak × 4 → Dining Chair · Oak · 4"), then draws the **tick** in the real "Counted and checked" box, which swaps to the real checked state. The tick travels along the walkway and side aisle to C-3-01. The bay closes, the chairs land with squash and settle, and the camera punches in (product zoom 1). | Line draw, radial reveal, physical drop | The tip continues up the same aisle | Receipt line item (unchecked → checked); twin selection glow | Pan to the dock → long aisle travel → punch-in 24 → 58 px/m | The ghost drops to ~30 %; full colour only in the dock and bay windows | A pen-glide synth that follows tip speed; a crisp tick (f60); marimba landing hits (f76–84) | A delivery becomes checked stock in a bay. |
| 2.9–4.3 s (f86–128) | **02 Turn inventory into action: spot** | The line runs up the side aisle to zone A and **laps batch B-2140-A twice in violet** (a lock). The bay window fills: the app's own violet ageing pads and the selection outline in close-up (product zoom 2). The line draws a card with the real header "L-Shaped Sofa · Grey · 120 days · 0 sold / 30d · A-1-01 · A-1-02". | Line laps, colour switch, punch-in | The violet line heads along the back wall | Ageing batch header; app's ageing overlay | Travel → punch-in 27 → 51 → ease out | Violet is the only accent | Attention cue: a minor-key two-note figure on the laps (f97–109) | Stock that isn't selling is surfaced, not buried. |
| 4.3–5.8 s (f128–176) | **Hand off & quote** | The line draws the real task row "L-Shaped Sofa · Grey · Finding buyer" and turns blue: handed to sales. It follows the wall to the outbound door and leaves the building as a route to a pin, "Petaling Jaya · SS2" (the deal's real destination preset), where it draws a card revealing the **real quote comparison** with every row tagged *Synthetic*, then circles **Lowest**. | Line as route; reveal; underline loop | The line turns teal for the owner | Deal row; quote rows (synthetic replies, labelled) | Long pan out of the building, zoom 17 | The route has a subtle glow; the pin is white with a blue ring | Rhythmic transition at 4.5 s (hi-hat pulse enters); a soft "ping" at the pin | Sales takes it from there, and the cost is compared before anyone commits. |
| 5.8–7.6 s (f176–228) | **Approve, then dispatch** | The line draws the owner's **tick** in teal, then a card revealing the **real decision**: "Sale RM1,200 · Delivery · Carrier A − RM280 · Net recovery RM920 · before stock cost · not profit · Approved by Mei". The line returns through the door along the walkway to A-1-01, now reserved (teal). The two real units **ride the line out** with a light running behind them on the rail. Only when they've left does the line lap the bay again in **green: freed**. | Line as rail; instance motion; second lap colour change | The tip continues along the row aisle | Decision card; the app's reserved and freed overlays | Pan back inside, closer (29 px/m), drifting with the units | Teal, then green; dispatch corridor in full colour | Approval tone (f190); a whoosh that follows the units; a soft major "release" as the bay frees (f219) | Nothing leaves without approval *and* a confirmed collection. |
| 7.6–8.4 s (f228–252) | **03 Make better decisions** | The line runs along the row aisle and outlines A-2-04/05 (product zoom 3). It draws the card for the **real reorder suggestion** "3-Seater Sofa · Oatmeal +4 · 12 sold in 30 days → 21-day target 9 · 9 − 3 available − 2 incoming = 4 · Order 4" and underlines the arithmetic. | Line + underline; punch-in | Pull-back | Replenishment row with its maths | Punch-in 26 → 40 → out | Blue returns | Warm resolution begins (f234); a pad opens | Reorders come with their reasons. |
| 8.4–10.0 s (f248–299) | **Brand** | The camera pulls back. For a beat the **whole journey lights up** across the twin: dock, bay, ageing lock, route, return, freed bay, reorder. Then the trail is **reeled in** behind the tip, the warehouse silhouette morphs back into the house outline, and the tip draws the mark's inner door and bars. The mark fills with brand blue from the closing point. "WareOrb" and "Every move, one live ledger." Footer: "Hackathon prototype · real WareOrb UI · seeded demo data". | Journey reveal → retraction → reverse morph → colour fill | — (end) | App icon | Pull back to overview, then hold | Twin fades out with the morph; flat brand blue fill | A rising chord as the trail reels in; final chord on the fill (f266); controlled fade from 9.5 s | One product, one ledger, one line. |

**Beat plan:** 120 BPM, one beat = 15 frames, synthesised in code with a 48 kHz stereo master. The sound palette has three parts:
* a soft electronic pulse;
* glass/marimba plucks for line closures;
* a pen-glide synth whose filter tracks tip speed.

In the final timing pass every closure, landing and colour change snaps to the beat grid (most already sit within ±2–6 frames).

---

## 4 · What is real, what is labelled

* **Real:**
  * the 3D twin is the branch's own `Structure`, `BaysLayer` and `FurnitureLayer`, fed the ledger snapshots from the run;
  * all six UI cards are 2× captures of the running Vince frontend (commit `781687f`) against its own seeded demo data;
  * the mark is the app's icon;
  * the receive → check → post, ageing → hand-off and quote → approve → collect flows were all executed for real in the app;
  * the reorder suggestion is the app's own output (the "Order 4" button was not pressed).
* **Labelled as synthetic or simulated:**
  * the carrier quotes (the app's "Demo" replies, tagged *Synthetic* in the UI and in the footnote);
  * the booking ("simulated booking" footnote);
  * all data is seeded demo data.
* **Illustrative, not a feature:**
  * the line itself, which visualises the ledger trail;
  * the route drawn to "Petaling Jaya · SS2" (the app stores a destination and links to a map; it does not draw routes).

  Neither is captioned as a feature.
* **Not shown, because it needs keys:** AI reading of delivery notes, live Lalamove quotes and the Jarvis assistant. No caption claims AI.

---

## 5 · Preview review and what the final pass will fix

| Keyframe | Frame | Read |
|---|---|---|
| 01 | 18 · 0.6 s | The mark mid-morph into the warehouse silhouette, with the wordmark fading. A clean, convex in-between (corner-matched morph). |
| 02 | 57 · 1.9 s | The tip about to tick "Counted and checked" on the real line item; the dock window shows DN-2291's wrapped units. |
| 03 | 105 · 3.5 s | Product zoom 2: violet double lap on B-2140-A, the app's ageing pads and selection outline. |
| 04 | 153 · 5.1 s | The route out of the door to the buyer pin; the real synthetic quote comparison revealed. |
| 05 | 210 · 7.0 s | The two real units riding the line out of the teal reserved bay, light running behind them. |
| 06 | 273 · 9.1 s | The colour fill completing the mark; the wordmark arriving. |

**To polish before the final render:**
* Snap events to the beat grid.
* Restrained motion blur (sub-frame accumulation) on the dispatch units and the two long aisle travels only.
* Tune the ghost level per shot (some frames read slightly muddy).
* Keep faint trail remnants from crossing cards.
* Slightly larger UI text in the deal card (currently ≈1.4×).
* Audio.
* Full 300-frame QA.

---

## 6 · Pipeline (unchanged in kind, new renderer)

* **Engine:** `promo/source/harness/src2/` is a deterministic browser renderer, with `renderFrame(n)` as a pure function of `n`. It contains:
  * React Three Fiber with the app's unmodified scene modules;
  * a full-frame mask that ghosts or reveals the twin;
  * a Canvas2D line engine (corner-aware time warp, retraction, morph);
  * DOM cards for the real UI crops, revealed by radial masks from the line's closing point.
* **Rendering:** headless Chromium via Playwright at 2× supersampling, ≈ 6 s per frame, so ≈ 30 minutes for the full film.
* **Finishing:** FFmpeg encode, audio mux and verification as before.
* **Build:** `ENTRY=v2 bun run build.ts`, then `node render/render-frames.mjs --dist harness/dist2 --frames 0-299 --dpr 2`.
