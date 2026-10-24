# WareOrb promo: storyboard of the delivered cut (v3b, "One line", 21 s)

1920 × 1080 · 30 fps · **630 frames (0–629) · 21.0 s** · H.264 + AAC 48 kHz stereo · file `WareOrb-promo-1080p.mp4`
120 BPM, so one beat is 15 frames (the film is 42 beats). Times are given as **seconds · frames**.

*This describes the film as delivered on 24 Oct 2026. Every number below is taken from the final source (`source/harness/src3/story3.ts`). The original 10-second storyboard is kept unchanged in `storyboard-v1.md`; the creative reasoning is in `creative-direction-v2.md`; the review record is in `review-v3b.md`.*

## The idea

One unbroken line is the ledger trail of one batch of stock.
1. It draws the WareOrb mark (the app's Lucide warehouse icon), which opens into the app's real 3D warehouse.
2. It checks a delivery in and posts it to a bay.
3. It spots stock that isn't selling and hands it to sales.
4. It carries the deal out of the door to a buyer and past synthetic carrier quotes.
5. It brings the owner's approval back inside, frees the bay once the goods have left, and shows a reorder with its arithmetic.
6. Finally the whole journey lights up and is reeled back into the mark.

Real product UI appears only inside shapes the line closes. **Every UI state is a capture of the running app**, and each button press swaps the card to the next real capture. The twin is a cool ~30 % ghost except inside closed shapes. The line's colour follows the app's own state colours:

| Colour | Hex | Used for |
|---|---|---|
| blue | `#4F8BEA` | the journey, receiving, hand-off, reorder |
| violet | `#a78bfa` | ageing |
| teal | `#2dd4bf` | approved and reserved |
| green | `#22c55e` | freed |

Three statements carry the story: **Capture stock. · Turn inventory into action. · Make better decisions.**

---

## 1 · Beat sheet

### Opening: 0.00–3.60 s · f0–108

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 0.00–0.10 · f0–3 | Near-black studio, faint isometric dot lattice | Locked overview | — |
| 0.10–1.10 · f3–33 | The pen ignites and draws the WareOrb mark; the hook word **"WareOrb"** rises beneath it | Overview, slight push (zoom 12.9 → 12.6) | Soft pad (Dmaj9); a glass "ink" tone as the pen ignites; pen-on-paper rasp following the tip |
| 1.10–1.50 · f33–45 | **Rest:** the finished mark holds | Still | The pad breathes |
| 1.27–2.20 · f38–66 | The outline morphs corner to corner into the warehouse's isometric silhouette (with real motion blur on its sides); the hook word fades | Still | A whoosh follows the morph |
| 1.93–3.60 · f58–108 | The twin opens from the far corner. The app's own warehouse **assembles**: the slab rises, racks drop back to front, furniture lands with squash and settle. Footer from f64: *Real WareOrb 3D twin · seeded demo data* | Slow push-in to f104 (zoom 14.6); tilt-shift depth strengthens then relaxes | A felt low hit as the twin opens; a soft granular patter of landings (never one sound per object); pad on Bm9 |
| 3.33–3.87 · f100–116 | The pen leaves the silhouette's far corner along the back wall | Begins moving to the dock | — |

### 01 Capture stock: 3.60–7.40 s · f108–222

Caption from f108: **"01 / 03 Capture stock."** with *"Check the delivery. Post it to a bay."*

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 3.87–4.27 · f116–128 | The line outlines the inbound dock; inside it the twin turns full colour, showing the **shrink-wrapped delivery DN-2291** and the app's amber "pending" footprint. Footer from f120: *Real WareOrb UI · seeded demo data* | Push in on the dock (zoom 27) | Groove enters on the beat at f120 (kick, bass); closure pluck at f128 |
| 4.27–4.90 · f128–147 | The line draws a card; inside it the **real receipt line** is revealed: "Dining chair oak × 4" → Dining Chair · Oak · 4, "Counted and checked" unticked | Settles on the card (zoom 29.5) | Card swell |
| 5.07–5.50 · f152–165 | The pen comes down the card's margin and **ticks "Counted and checked"**. The next real state spreads softly from the checkbox ("Save lines" appears, "Post to stock" enables) | — | A crisp tick |
| 5.50–6.00 · f165–180 | The pen loops the real **Post to stock** button; it lifts, then dips | Press-in (zoom 35.5) | — |
| **6.00 · f180 (beat 12)** | **Press.** A wave leaves the button and reveals the real posted state: History "16:26 J. Lim · 4 × CHAIR-LUMA-0410 → C-3-01" | **Holds to f192** on the result | Click (down / up 66 ms apart) and a bloom with the wave |
| 6.07–6.37 · f182–191 | The shrink-wrapped units lift off the dock (they are now posted stock) | Hold | A small air lift |
| 6.13–6.80 · f184–204 | The line leaves the card's corner, runs the walkway and side aisle to **bay C-3-01** | **Chases** the line (f192–205), motion-blurred | Camera air follows the whip |
| 6.80–7.40 · f204–222 | The line closes around C-3-01; the **four chairs land** with squash (≈ f211–216); the app's selection glow lights them | **Product close-up #1:** punch-in to zoom 56–58, hold | Closure pluck (f212), four soft landings, a low push for the punch-in |

### 02 Turn inventory into action: 7.67–16.47 s · f230–494

Caption from f230: **"02 / 03 Turn inventory into action."**

**Spot (f222–300).** Sub-line *"Spot stock that isn't selling."* (f230).

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 7.40–7.87 · f222–236 | The line runs back up the side aisle to zone A | Pull back, travel | — |
| 7.87–8.40 · f236–252 | **Two violet laps** lock onto batch **B-2140-A** (A-1-01 + A-1-02); the app's ageing overlay and selection light the sofas | **Product close-up #2** (zoom 50–51, f246–254) | Two violet "lock" notes (f244, f252); a low push for the punch-in |
| 8.40–9.00 · f252–270 | The violet line draws a card; the **real batch card** is revealed: "L-Shaped Sofa · Grey · B-2140-A · SOFA-HAVN-2140 · 120 days · 0 sold / 30d · A-1-01 · A-1-02 · Units 4 · Unreserved 4 · Guide / unit RM600 · List / unit RM1,299 · Newer batch B-2140-B of this model is 18 days old" | Eases onto the card (zoom 33–34) | Card swell |
| 9.33–10.00 · f280–300 | The pen loops the real **Hand to Arif** button | Press-in (zoom 39.5–40) | — |
| **10.00 · f300 (beat 20)** | **Press.** The wave reveals the real handed state: **"Finding buyer"**, deal "D-1001 · v1", "Arif is finding a buyer · guide RM600 / unit", history "Mei · B-2140-A → Arif". The card settles to its new height | **Holds to f312** | Click and bloom |

**Hand off and quote (f300–356).** Sub-line *"Hand it to sales. Compare carrier quotes."* (f292).

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 10.07–10.47 · f302–314 | The line leaves the card's corner along the back wall to the outbound door | **Chases** (f312–324), motion-blurred | Camera air |
| 10.47–10.87 · f314–326 | The line leaves the building as a route to the buyer's destination pin **"Petaling Jaya · SS2"**. Footer from f320: *Real WareOrb UI · synthetic carrier quotes · simulated booking* | Settles outside (zoom 24–25, raised for legibility) | A ping at the pin (f326) |
| 10.87–11.27 · f326–338 | The line draws a card; the **real quote comparison** is revealed. Three replies, all tagged *Synthetic* in the app:<br>• Carrier A, Lorry 10ft, RM280 incl. unloading: **Lowest**<br>• Carrier C, Lorry 14ft, RM300: **Expired**<br>• Carrier B, Van, RM220+?: **Incomplete**, "Unloading?" | Hold | Card swell |
| 11.37–11.83 · f341–355 | The pen circles **Lowest** | Hold | Closure pluck (f355) |

**Approve (f356–404).** Sub-line *"The owner approves. Stock is reserved."* (f372).

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 11.87–12.33 · f356–370 | The line turns **teal** and draws the owner's card; the **real approval** is revealed: "Sale RM1,200 · Delivery · Carrier A − RM280 · Net recovery RM920 · before stock cost · not profit · Synthetic · Frees A-1-01 · Reason (needed to reject) · Approve · Reject" | Moves to the card (zoom 23) | Card swell |
| 12.53–13.00 · f376–390 | The pen loops **Approve**; the quotes card leaves (f380–388) | Press-in (zoom 27–27.5) | — |
| **13.00 · f390 (beat 26)** | **Press.** The wave reveals the real decision: **"DECISION … Approved by Mei"**. The card shrinks; the pen rests on its corner | **Holds to f404** | Click, bloom and a rising major third; the groove takes **one beat of air** (f390–405) |

**Reserve and collect (f401–501).** Sub-line *"Confirm the collection. The bay is freed."* (f434).

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 13.37–14.20 · f401–426 | The teal line returns to the pin, comes back through the door and along the walkway to A-1-01 | Two whips back inside (f404–432), motion-blurred | Camera air |
| 14.20–14.47 · f426–434 | The line laps A-1-01 in **teal**: **reserved** (the stock has not moved yet) | Settles (zoom 30–33) | Closure pluck (f434) |
| 14.47–14.90 · f434–447 | The line draws a card; the **real collection step** is revealed: "COLLECTION · SIM-7001 · A-1-01 ×2 · Confirm 2 left the warehouse · Back" | Hold | Card swell |
| 15.17–15.50 · f455–465 | The pen loops **Confirm 2 left the warehouse** | Press-in (zoom 41–41.5) | — |
| **15.50 · f465 (beat 31)** | **Press.** The wave reveals the real result: **"2 collected Oct 23, 2026, 4:32 PM · from Warehouse · Shah Alam"** | **Holds to f475** | Click and bloom |
| 15.70–16.47 · f471–494 | The **two units** in A-1-01 lift and ride the walkway out of the outbound door, a light running behind them on the rail | Follows the units (f475–496) | A rail whoosh panned with the units |
| 16.50–16.70 · f495–501 | Only now does the line lap the bay in **green: freed** | — | A soft major "release" arpeggio |

### 03 Make better decisions: 16.67–18.23 s · f500–547

Caption from f500: **"03 / 03 Make better decisions."** with *"Reorders come with their arithmetic."* Footer: *Real WareOrb UI · seeded demo data*.

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 16.70–17.13 · f501–514 | The blue line runs the row aisle and outlines **A-2-04 / A-2-05** (3-Seater Sofa · Oatmeal); the app's selection lights them | **Product close-up #3** (zoom 40, f516) | Closure pluck (f514), a low push |
| 17.13–17.50 · f514–525 | The line draws a card; the **real replenishment suggestion** is revealed: "3-Seater Sofa · Oatmeal · +4 · 12 sold · 3 free · 2 in · 12 sold in 30 days → 21-day target 9 · 9 − 3 available − 2 incoming = 4 · Order 4" ("Order 4" was not pressed) | Eases onto the card (zoom 27–27.6) and holds | Card swell |
| 17.60–17.87 · f528–536 | The pen **underlines the arithmetic**; the card holds until f544 | Hold | Pen rasp |

### Brand: 18.13–21.00 s · f544–629

| Time · frames | What we see | Camera | Sound |
|---|---|---|---|
| 18.13–18.57 · f544–557 | The card leaves; the camera pulls back and **the whole journey lights up** across the twin: dock, bay, ageing laps, route, return, reserved and freed bay, reorder | Pull-back to the overview (zoom 12.4), motion-blurred | A rising build from f546 |
| 18.43–19.03 · f553–571 | The pen races home (f553–562) while the trail is **reeled in** behind it (from f556). The silhouette **morphs back into the mark** (f560–570), and the pen draws the mark's inner door bars (f562–571). | Overview, gentle drift | Reel-in riser (f556) into the cadence |
| **19.03 · f571 (≈ beat 38)** | The mark **fills with blue** from the closing point | — | The cadence: the music resolves on Dmaj9, a felt low D and one clear high tone (no stock chime) |
| 19.07–19.73 · f572–592 | **"WareOrb"** (f572) · **"Every move, one live ledger."** (f576) · **"WareOrb — by Team Bababoi"** (f580) · footer *Hackathon prototype · real WareOrb UI · seeded demo data* (f586–596) | Still | The chord rings out |
| 19.73–21.00 · f592–629 | **End card holds** (the tagline is readable for ≈1.4 s, the credit ≈1.3 s) | Still | Controlled fade to silence at 21.0 s |

---

## 2 · The five real state changes

Each card shows consecutive 2× captures of the running app around one real click. Crops are documented in `source/harness/make-ui3.py`.

On a press:
1. the pen loops the control;
2. the control lifts and dips;
3. a wave leaves it, revealing the next real capture (no cross-dissolve between layouts);
4. the selection loop fades with the old state;
5. the card eases to its new height, and the line leaves from its corner.

| Press · time · frame | Control | Before (real capture) | After (real capture) | Result beat |
|---|---|---|---|---|
| Tick · 5.50 s · f165 | "Counted and checked" | `c01-receipt-review`: line unticked, Post disabled | `c02-receipt-checked`: ticked, Save lines, Post enabled | soft spread from the checkbox |
| Post · 6.00 s · f180 | **Post to stock** | `c02-receipt-checked` | `c03-receipt-posted`: History "J. Lim · 4 × CHAIR-LUMA-0410 → C-3-01" | hold to f192 |
| Hand · 10.00 s · f300 | **Hand to Arif** | `c05-ageing-batch`: 120 days, 0 sold / 30d | `c05b-handed`: "Finding buyer", D-1001 | hold to f312 |
| Approve · 13.00 s · f390 | **Approve** | `c08-approval`: net recovery RM920, Approve / Reject | `c09-decision`: "Approved by Mei" | hold to f404 |
| Confirm · 15.50 s · f465 | **Confirm 2 left the warehouse** | `c10b-collect-confirm`: SIM-7001, A-1-01 ×2 | `c10c-collected`: "2 collected Oct 23, 2026, 4:32 PM · from Warehouse · Shah Alam" | hold to f475 |

The twin follows the same run's ledger snapshots:

| Snapshot | Frames | State |
|---|---|---|
| L0 | f0–205 | seed |
| L1 | f206–231 | posted |
| L2a | f232–299 | ageing flagged |
| L2 | f300–389 | handed |
| L3 | f390–494 | approved and reserved |
| L4 | f495–504 | collected, bay freed |
| L5 | f505–629 | replenishment |

## 3 · "Click a product: zoom in, zoom out"

Your direction from the first round. Each close-up is triggered by the line closing around the product, and the app's own selection glow and outline light it.

| # | Product | In | Hold | Out |
|---|---|---|---|---|
| 1 | The 4 oak chairs just landed in C-3-01 | f205–214 (zoom 26 → 56) | f214–222 | to f236 |
| 2 | The ageing L-shaped sofas, batch B-2140-A (A-1-01, A-1-02) | f236–246 (zoom 30 → 50) | f246–254 | to f270 |
| 3 | The 3-Seater Sofa · Oatmeal flagged for reorder (A-2-04 / 05) | f506–516 (zoom 27 → 40) | — | to f526 |

## 4 · On-screen type

Type is Geist 600 for headlines and Geist Mono for labels and disclosures. Captions sit bottom-left on a scrim that appears only with them.

| Frames | Text |
|---|---|
| f6–50 | "WareOrb" (hook word under the mark being drawn) |
| f108–222 | 01 / 03 **Capture stock.** · *Check the delivery. Post it to a bay.* |
| f230–494 | 02 / 03 **Turn inventory into action.**, with sub-lines:<br>• *Spot stock that isn't selling.* (f230)<br>• *Hand it to sales. Compare carrier quotes.* (f292)<br>• *The owner approves. Stock is reserved.* (f372)<br>• *Confirm the collection. The bay is freed.* (f434) |
| f500–547 | 03 / 03 **Make better decisions.** · *Reorders come with their arithmetic.* |
| f572 / 576 / 580 | **WareOrb** · *Every move, one live ledger.* · *WareOrb — by Team Bababoi* |

The disclosure footer sits bottom-right. Between wordings it dips out and back in.

| Frames | Footer |
|---|---|
| f64–119 | Real WareOrb 3D twin · seeded demo data |
| f120–319 | Real WareOrb UI · seeded demo data |
| f320–499 | Real WareOrb UI · synthetic carrier quotes · simulated booking |
| f500–555 | Real WareOrb UI · seeded demo data |
| f586–629 | Hackathon prototype · real WareOrb UI · seeded demo data |

## 5 · What is real, labelled, illustrative, or not shown

| | |
|---|---|
| **Real** | Executed in the running Vince app (`781687f`) against a local Convex backend seeded with the app's own demo data, captured at 2×:<br>• DN-2291 received, checked and posted to C-3-01;<br>• the ageing rule flags B-2140-A (120 days, 0 sold in 30 days);<br>• Hand to Arif creates deal D-1001 ("Finding buyer");<br>• the quote comparison;<br>• Approve: net recovery RM920, "before stock cost · not profit", "Approved by Mei", A-1-01 reserved;<br>• the collection is confirmed: 2 collected, A-1-01 freed;<br>• the replenishment suggestion and its arithmetic.<br>The 3D twin is the branch's own `Structure`, `BaysLayer` and `FurnitureLayer`, fed the captured ledger snapshots. |
| **Labelled** | The carrier quotes are **synthetic** (the app's "Demo" replies, tagged *Synthetic*). The booking SIM-7001 is **simulated**. All data is **seeded demo data**. The footers say so throughout. |
| **Illustrative, not features** | The line (it visualises the ledger trail); the route to "Petaling Jaya · SS2"; the press wave; the camera moves; the chairs landing and the units riding out (the harness animates the app's own items between real ledger states). |
| **Not shown** (needs keys or isn't built) | "Read with AI" (Anthropic), live Lalamove quotes, Claude-driven Jarvis, Fish voice, Codex; voice and handwriting capture; any Orbyte integration; any metric or measured benefit. |
| **Numbers** | Only the app's own figures (RM1,200 · RM280 · RM920 · 120 days · 12 sold → +4). The spec's illustrative RM900 example (with RM20 packing) is not used. |

## 6 · Sound

The score is synthesised in code (`source/audio-src/score.py`), with no samples and **no voice**. It is timed from the renderer's own exported cues (`audio/sound-data.json`), so every effect lands on its picture event.

* **Harmony:** 120 BPM in D major, with one chord per bar:
  Dmaj9 → Bm9 → Gmaj9 → A6sus4 → Bm9 → F#m7 → Gmaj9 → Asus → D/F# → Em9 → A7sus4 → **Dmaj9** on the fill.
* **The bed:**
  * a soft pad from the first frame;
  * a groove (kick, sine bass, a marimba-like ostinato kept above F4) from the beat after "Capture stock." (f120) to the fill;
  * one beat of air after Approve.
* **Effects, all in one shared room:**
  * ink ignition;
  * morph whoosh;
  * the assembly's granular patter and low hit;
  * closure plucks drawn from the current chord, and card swells;
  * the tick;
  * press clicks (down / up) with a bloom on each wave, and the approval's rising third;
  * the units' lift, the chair landings, the punch-in pushes;
  * the violet lock notes and the pin;
  * the rail whoosh panned with the units;
  * the freed arpeggio, the reel-in riser and the cadence;
  * a pen-on-paper rasp that follows tip speed, and camera air that follows whip speed.
* **Balance:** the music ducks under the effects. Clicks and closures sit about +5 to +9 dB above the music in the 0.8–4.5 kHz band.
* **Master:** −16.2 LUFS integrated, true peak −2.8 dBTP, 48 kHz / 24-bit, leaving headroom for ducking under the team's narration in the pitch. Press clicks land within 1 ms of their frames in the delivered MP4.

## 7 · Look

| Element | Treatment |
|---|---|
| Ground | `#09090b` studio with a faint isometric dot lattice that moves with the camera, and a fixed sub-visible grain against banding |
| Camera | Only 2D pan and zoom of the app's true-isometric picture plane (azimuth 45°, elevation 35.26°); it never rotates |
| Twin | The app's materials and lights, re-balanced for film; NeutralToneMapping at exposure 1.25; tilt-shift depth; a ghost outside closed shapes |
| Motion | Every frame is a pure function of its frame number. Moving frames are rendered with a **real 180° shutter**: 2–48 sub-frames averaged in linear light. Holds and screen-fixed type stay sharp. |
| Cards | Real captures with a thin outline drawn by the line, revealed radially from the line's closing point; no frosted panels |

## 8 · Review keyframes

Keyframes `previews-v3b/keyframe-01..06.png`, plus `contact-sheet.png`, `transitions-sheet.png` and `compare-v3-v3b.png`:

| # | Time · frame | Moment |
|---|---|---|
| 01 | 2.87 s · f86 | The app's twin assembles inside the mark's silhouette |
| 02 | 6.03 s · f181 | Post to stock pressed; the press wave begins |
| 03 | 10.40 s · f312 | Hand to Arif → "Finding buyer"; the line leaves for the door |
| 04 | 13.37 s · f401 | "Approved by Mei"; the pen rests on the card's corner |
| 05 | 15.83 s · f475 | "2 collected … SIM-7001"; the units lift off the reserved bay |
| 06 | 20.50 s · f615 | WareOrb · Every move, one live ledger · WareOrb — by Team Bababoi |

The keyframes were rendered from draft 3 at the review gate. In the delivered frames, f86 and f181 differ from them only by the faint pulse of the dock's pending-delivery mark, now frame-pure; see `render-instructions.md`.
