# WareOrb — 10-second launch film · storyboard (preview gate)

1920 × 1080 · 30 fps · 300 frames (0–299) · H.264 + 48 kHz stereo (audio is generated after preview approval)

## 1. What the film is built from

| Item | Value |
|---|---|
| Repository | `POTATO0826/Bababoi`, branch **`Vince`** |
| Commit used | `781687f` "docs: handoff reflects the Jarvis chat" (2026-10-23 20:51 +08:00) |
| How it was read | The cloud session has no GitHub access to this private repo, so the `origin/Vince` ref of your local clone (`~/Documents/codes/Bababoi`) was exported with `git archive` into an isolated copy. Nothing in your working tree (`backend` branch, uncommitted changes) was touched. I couldn't check whether GitHub has newer commits than that local ref. |
| `wareorb-capacity-reallocation.md` | **Not present.** `docs/plans/wareorb-backend-plan.md` (on `backend`) refers to it as living in a separate "research checkout". |
| Frontend | Bun + React 19 + TypeScript, React Three Fiber/drei 3D twin, zustand, Tailwind v4 + shadcn/ui, Geist / Geist Mono, Lucide icons, Orbkit SHDR-11 orb. Single screen: workflow panels are opened by slash commands / Jarvis, never by routes. |
| Backend | Convex. Ran the branch's own functions on a **local** Convex backend, seeded with the app's built-in synthetic demo data (`seed:run`). |
| Brand tokens used | bg `#09090b`, panel `#0c0c0f`, brand `#4F8BEA` / `#8db1f3`, warn `#E3BD78`, ageing `#a78bfa`, reserved `#2dd4bf`, freed `#22c55e`; Geist 400/600, Geist Mono. |

### Real UI states captured
The app's §8 demo path was run end to end in the browser, as the three roles: **Warehouse** (J. Lim), **Owner** (Mei) and **Sales** (Arif). Each step was a real mutation against the local backend. The film uses 2× captures of that UI (`source/captured/ui/`) and the app's own ledger snapshot at each step (`source/captured/ledger/`), which drives the 3D twin.

### What works, what's simulated and what isn't shown

| Workflow step | In the branch | How the film shows it |
|---|---|---|
| Multimodal receiving | Evidence (photo, document, voice), editable lines, **"Read with AI"** (needs `ANTHROPIC_API_KEY`) | Seeded note DN-2291 with its editable line. **AI reading is not shown**: no key, and the seed lines aren't AI output. |
| Human verification | "Counted and checked" → **Post to stock** | Shown for real: 4 × CHAIR-LUMA-0410 → C-3-01. |
| Ageing detection | Rule ≥90 d and ≤0 sold in 30 d; violet bays on the map | Shown for real: B-2140-A, 120 d, A-1-01 / A-1-02. |
| Salesperson handoff | "Hand to Arif" creates deal D-1001 ("Finding buyer") | Shown for real. |
| Buyer information | Buyer, offer, destination preset, access, unloading, freight | Shown for real. The buyer name "Demo buyer · PJ" was typed in for the demo. |
| Carrier quotes | Lalamove sandbox (needs keys), manual quotes, **Demo** replies | **Synthetic** carrier replies (the "Demo" button). The UI labels them *Synthetic*, and the film adds a footnote. |
| Owner approval | Net recovery "before stock cost · not profit"; Approve reserves stock | Shown for real: RM920 approved by Mei, A-1-01 reserved (teal). |
| Confirmed dispatch | **Booking is simulated** (SIM-7001). Stock falls only on "Goods collected". | Shown for real: confirm → A-1-01 freed (green). The units visibly leave the bay. The booking is labelled *Simulated booking*. |
| Replenishment | Suggestions with arithmetic; "Order N" creates a PO | Shown: 3-Seater Sofa · Oatmeal +4 with its working ("12 sold in 30 days → 21-day target 9; 9 − 3 − 2 = 4"). |
| Jarvis voice / chat | Keyword rules work offline; Claude and Fish voice need keys | Not used in the film. |

## 2. Production approach

* **3D = the app's own scene.** `promo/source/harness` imports the branch's unmodified `Structure`, `BaysLayer` and `FurnitureLayer` (instanced furniture, bay pads, workflow overlays, selection glow/outline) and feeds them the captured ledger snapshots. Only `@/actions` is stubbed, because it opens a Convex client.
* **Animation is layered on, not edited in.** The harness reads the app's instance matrices as the rest pose and writes animated copies:
  * the floor assembles: the slab rises, racks drop, furniture falls with squash and settle;
  * posted stock lands in its bay;
  * collected units lift and travel to the outbound dock.
* **Camera** is the app's own true isometric orthographic camera (az 45°, el 35.26°), driven by keyframes. Azimuth never rotates.
* **Look**:
  * the same materials, rebalanced for film: a stronger, lower warm key so contact shadows read, less flat fill, and the same Lightformer reflections;
  * tilt-shift depth of field for the miniature cue (stronger in close-ups);
  * a soft vignette.
* **UI** is real captures in restrained glass frames. The film has left and right columns, like the app's own layout.
* **Determinism.** Every frame is `renderFrame(n)`, a pure function of `n`. The app clock is pinned to the last snapshot's capture time. Playwright drives headless Chromium.

### "Zoom in, zoom out" on product clicks (your direction)
The punch-ins happen when the cursor clicks **a product in the 3D warehouse**. The app's real selection glow and outline light up on that product. The camera eases in to a close-up, holds, then eases back out:

| # | Frames | Product clicked | Zoom |
|---|---|---|---|
| 1 | 75 → 82 (in) · 85 → 97 (out, into the travel) | The 4 oak chairs that just landed in C-3-01 | 17.8 → 60 px/m |
| 2 | 98 → 105 (in) · 122 → 134 (out) | The ageing L-shaped sofas, batch B-2140-A, in A-1-01 | 30 → 64 px/m |
| 3 | 239 → 246 (in) · 253 → 282 (out, into the end card) | The 3-Seater Sofa · Oatmeal flagged for reorder | 27 → 60 px/m |

UI button clicks (Counted and checked, Post, Hand to Arif, Carrier A, Send, Approve, Confirm) get a cursor click, a ripple and a button flash, but no zoom.

## 3. Timeline (frames @ 30 fps)

| Frames | Time | Scene | Visual | Real UI shown | 3D state (snapshot) | Planned audio cue |
|---|---|---|---|---|---|---|
| 0–30 | 0.0–1.0 s | **Hook** | The warehouse twin assembles back-to-front: the slab rises, racks drop, furniture lands. Slow push-in. "WareOrb" lockup and the line "A live 3D view of your stock ledger." | Header brand mark (Lucide warehouse + wordmark) | L0 seed (DN-2291 wrapped in the inbound dock) | Soft low-frequency swell; small marimba ticks on the landings |
| 30–90 | 1.0–3.0 s | **01 · Capture stock**: "Check it in" | The receipt slides in. The cursor ticks *Counted and checked* (49), then *Post to stock* (57). The real history line "4 × CHAIR-LUMA-0410 → C-3-01" flies to the bay. The wrapped units lift away and the chairs land in C-3-01 (63–76). **Product click #1** on the chairs → zoom in. | DN-2291: To verify → Checked → Posted | L0 → L1 (posted) | UI entry click at 1.0 s; two soft clicks; a glassy "post" chime; landing thuds |
| 86–134 | 2.9–4.5 s | **02 · Spot ageing stock** | The camera travels across the racks to zone A. Ageing bays turn the app's **violet**, with a pulse. Ageing list on the left. **Product click #2** on B-2140-A → close-up. The batch card appears with a leader line. *Hand to Arif* (120). | Unsold batches (5); batch B-2140-A (120 d · 0 sold / 30 d) | L2a (stage *ageing*) | Subtle attention cue at 2.8–3.3 s |
| 122–176 | 4.1–5.9 s | **03 · Hand off and quote** | The violet flag becomes Arif's task ("Finding buyer"). Buyer brief on the left. A route draws from the outbound dock door to a "Petaling Jaya · SS2" pin at the quote comparison. Clicks on Carrier A (lowest) and *Send to Mei*. | Deals (Finding buyer); Buyer; Delivery quotes (**Synthetic**, Lowest / Expired / Incomplete) | L2 (deal D-1001) | Rhythmic transition at 4.5 s |
| 176–228 | 5.9–7.6 s | **04 · Approve, then dispatch** | Approval card. *Approve* (188) → A-1-01 turns teal ("A-1-01 ×2 · reserved"), then a push-in on the bay. A separate confirmation, *Confirm 2 left the warehouse* (204): the two units lift, glide to the outbound dock and leave. A-1-01 turns green, "freed" (224). | Approval (Net recovery RM920 · before stock cost · not profit); Decision; Collection SIM-7001 → "2 collected" | L3 approved → L4 collected | Approval confirmation tone at 6.3 s; whoosh on departure; soft "release" at 7.5 s |
| 228–258 | 7.6–8.6 s | **05 · Reorder with reasons** | Replenish list with the arithmetic. **Product click #3** on the Oatmeal 3-seater → close-up. | Suggested orders (3) | L5 (stage *replenish*, freed bay still green) | Warm musical resolution from 7.8 s |
| 257–299 | 8.6–10.0 s | **Brand** | The camera pulls back to the whole floor, set low and dimmed. The warehouse mark draws on. "WareOrb" wordmark and the line "Capture stock. Turn inventory into action. Make better decisions." Footer: "Hackathon prototype · shown with seeded demo data". | — | L5 | Final chord, controlled fade 9.5–10.0 s |

A persistent footnote reads "Real WareOrb UI · seeded demo data". It becomes "… synthetic carrier quotes · simulated booking" while quotes and booking are on screen.

## 4. Deliberate deviations from the brief

1. **Violet, not amber, for ageing.** The app marks ageing stock `#a78bfa`, and amber `#E3BD78` already means *low stock*. Showing amber would misstate the product.
2. **No AI document reading, no live Lalamove quotes, no Jarvis.** Each needs API keys that aren't available here. The film shows the seeded note, synthetic quotes and the simulated booking, each labelled.
3. **The capacity-reallocation spec wasn't available**, so capacity is shown only as the app shows it: occupied → reserved → freed bays.
4. **Lighting is rebalanced; materials and geometry are not changed.**

## 5. Preview evaluation (self-review)

| Keyframe | Notes |
|---|---|
| 01 · f18 | The floor is mid-assembly and readable, and the lockup sits in the empty back corner. The stock is small at this distance; that's intended for the hook. |
| 02 · f57 | The real receipt is crisp and legible (Geist at ≈1.35×). The dock with DN-2291's wrapped units is visible. The panel covers the right edge of the floor. |
| 03 · f105 | The strongest frame: product close-up, violet ageing bays, selection outline, batch card and ageing list together. |
| 04 · f153 | The quote comparison is legible and the *Synthetic* badges are clear. The route is mid-draw at this frame. The left cards' text is smaller (≈1.16×). |
| 05 · f210 | The units are lifting off the teal reserved bay, and the decision and collection cards are shown together. The departure reads better in motion than as a still. |
| 06 · f273 | The end card is clean. The dimmed floor works as a pedestal. |

**Consistency:** one camera language (true isometric, no rotation), one lighting rig, one glass treatment, Geist throughout, brand-blue cursor accents.

**Known polish for the final render:**
* restrained motion blur, with subframes on the departing units and the fast travel moves only;
* audio;
* a frame-by-frame QA pass.
