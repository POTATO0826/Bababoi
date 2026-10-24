# WareOrb — SDC Hackathon video plan (promo 21 s + pitch 5–7 min)

Two deliverables with different jobs, built from one set of assets:

| | **Promo (/brag)** | **Pitch video** |
|---|---|---|
| Purpose | Memorable 21-second film | Explain the product and prove it works |
| Length | **21.0 s** (630 frames @ 30 fps), inside the 18–22 s recommendation | **≈ 6:00**, inside 5–7 min |
| Source | The v2 "One line" renderer, extended with v1 assets | Real app footage, recorded by a script, plus the promo, a few slides and narration |
| Truth standard | Real UI and 3D; synthetic or simulated parts labelled | **Genuine app behaviour:** real clicks and mutations, the approval, and the recorded history and count changes |

Nothing already built gets rebuilt. The promo re-times the v2 film, adds the strongest v1 moments and adds real button presses. The pitch video reuses the capture scripts, the seeded backend, the promo, the design system and the brand ending.

---

## 1 · Promo, extended to 21 s

**How:** the v2 renderer is a pure function of the frame number, so stretching it is a time-remap: new frame → old story frame, with a different stretch per scene. Every v2 move, colour change and card reveal carries over unchanged, just with room to breathe.

**New in v3**, each added only where it strengthens the film:
1. **Cinematic opening.** The mark is drawn slowly and the wordmark settles. The outline opens into the warehouse silhouette, and inside it the **v1 physical assembly** plays: the slab rises, racks drop row by row, furniture lands with squash and settle. A slow push-in with tilt-shift depth of field.
2. **Real product interactions.** The line's tip acts as the user's finger on real buttons, with a v1-style click ripple and button flash. Each press swaps the card to the **next real captured state**:
   * Post to stock → the history row "J. Lim · 4 × CHAIR-LUMA-0410 → C-3-01";
   * Hand to Arif → "Finding buyer";
   * Approve → "Approved · stock reserved" and "Approved by Mei";
   * Confirm 2 left the warehouse → "2 collected · from Warehouse · Shah Alam".
3. **Stronger ending.**
   * The journey map holds for 0.6 s.
   * It is reeled into the mark, which fills with colour.
   * "WareOrb", then "Every move, one live ledger."
   * A small three-idea line: Capture stock · Turn inventory into action · Make better decisions.
   * The hackathon/team credit.
   * A 1.2 s hold.

| Time | Scene | Reused | New |
|---|---|---|---|
| 0.0–3.4 s | **Opening:** mark → warehouse, which builds itself | v2 hook (slowed ~2.5×), v1 assembly animation, real twin | Merge v1 assembly into v2; one title line |
| 3.4–6.6 s | **Capture stock** | v2 dock, note, tick, travel, chairs land, product zoom #1 | "Post to stock" press → recorded history row |
| 6.6–9.2 s | **Spot ageing stock** | v2 violet laps, product zoom #2, ageing card | "Hand to Arif" press → task row |
| 9.2–12.0 s | **Hand off & quote** | v2 route to "Petaling Jaya · SS2", synthetic quotes, Lowest loop | "Send to Mei" press |
| 12.0–14.6 s | **Owner approves** | v2 decision card; v1 approval capture | Approve press → toast → "Approved by Mei"; bay turns reserved |
| 14.6–17.2 s | **Confirmed dispatch** | v2 rail ride, freed lap | Confirm-collection press → "2 collected" |
| 17.2–18.6 s | **Reorder with reasons** | v2 product zoom #3, arithmetic card | — |
| 18.6–21.0 s | **Brand** | v2 journey map, reel-in, mark fill | Longer holds, three-idea line, credit |

**Audio** (generated in code, 48 kHz stereo) at 120 BPM, which gives 42 beats. Every closure, press, landing and colour change sits on the beat grid:
* a soft pulse;
* glass/marimba plucks on closures;
* a pen-glide synth that follows the tip;
* a resolving final chord on the mark fill.

**Cost:**
* A preview gate showing **only the six changed moments** (opening, Post, Hand-off, Approve, Collection, end card).
* Then the render: 630 frames × ≈ 6 s ≈ **65 min**, plus audio and a full 630-frame QA pass.

---

## 2 · Pitch video, ≈ 6:00

| Time | Section | Source | Manual work |
|---|---|---|---|
| 0:00–0:21 | Cold open | The 21 s promo | none |
| 0:21–0:55 | The problem | Animated title cards in the promo's design system, with narration | **Team supplies the facts.** No invented statistics. |
| 0:55–1:20 | What WareOrb is | v2 journey-map frame + three roles (Warehouse / Sales / Owner) | none |
| 1:20–4:45 | **Live product demo** | **Real app, recorded by script** (chapters below) | Run one command (or let me drive your Mac) |
| 4:45–5:25 | How it's built | Architecture card, real `bun test` output (20 domain tests pass), a works / needs-keys / simulated table | none |
| 5:25–5:50 | What's next | Title cards | Team confirms the roadmap |
| 5:50–6:00 | End card | Promo brand ending | none |

### Demo chapters: genuine behaviour, recorded outcomes visible

Every step is a real mutation against the backend, with the seeded demo data reset before recording. Role switches use the app's own role picker.

1. **Overview (≈15 s):** totals, two floors, the 3D twin, a SKU search; the map zooms and highlights.
2. **Receive (≈35 s), J. Lim:** delivery note DN-2291 → line item → *Counted and checked* → **Post to stock**. Visible outcomes:
   * the history row "4 × CHAIR-LUMA-0410 → C-3-01";
   * the inbound dock clears and the chairs land in C-3-01;
   * totals change.

   *With an Anthropic key:* a new receipt from a photo → **Read with AI** → suggested lines → a person checks them. *Without one:* skipped, with no claim.
3. **Ageing (≈25 s), Mei:** the rule (≥90 days, no sales in 30 days); B-2140-A at 120 days turns violet on the map; **Hand to Arif** → "Finding buyer".
4. **Sales (≈40 s), Arif:**
   * fill in the buyer form, Save (deal v2), **Confirm location**;
   * vehicle fit (Van: check, Lorry 10ft: check, Lorry 14ft: fits);
   * quotes: **Lalamove sandbox** if keys are available, otherwise **Demo** replies, tagged *Synthetic*;
   * compare (Lowest / Expired / Incomplete) → **Send to Mei**.
5. **Approval (≈30 s), Mei:**
   * the net-recovery breakdown, "before stock cost · not profit";
   * **Approve** → toast "Approved · stock reserved" → A-1-01 teal and *Simulated booking* SIM-7001;
   * on-hand stock is unchanged: approval reserves, it doesn't move stock;
   * the guardrail: the Warehouse role has no Approve command, and Jarvis declines to approve.
6. **Collection (≈25 s), J. Lim:** **Goods collected** → **Confirm 2 left the warehouse** → toast "Collected · stock updated" → A-1-01 freed (green), totals −2.
7. **Recorded outcomes (≈20 s):** the deal's history timeline (Mei → Arif → v2 → quotes → submitted → reserved → 2 out), with before and after counts.
8. **Replenish (≈20 s), Mei:** 3-Seater Sofa · Oatmeal +4 with its arithmetic → **Order 4** → purchase order created; incoming +4.
9. **Jarvis (≈20 s):** "/" shows each role's commands; "What needs my approval?"; offline rules, or Claude if a key is available.

---

## 3 · Production workflow (minimum manual work)

```
 (Claude)  promo v3 ──► 6 changed keyframes ──► approval ──► render + audio + QA ──► WareOrb-promo-21s.mp4
 (Claude)  demo driver + recorder script (chapters, human pacing, cursor overlay, event log)
 (Team, ~10 min) run `record-demo` once on a Mac ──► demo-raw.mp4 + events.json
 (Claude)  narration script with per-section timing ──► (Team, ~20 min) read it, one file per section
 (Claude)  auto-assembly: promo + title cards + demo with automatic zoom-to-click, chapter
           titles, captions + SRT, music ducked under the voice, loudness −14 LUFS ──► WareOrb-pitch-6min.mp4
 (Team, ~30 min) review notes ──► (Claude) re-assemble in minutes
```

**Why the demo is recorded on a Mac, not here:** I tested frame-by-frame capture of the real app in the cloud, stepping a virtual clock one frame at a time. The 3D map renders in software here, at least 20× slower than real time while the app was still loading. With the full warehouse loaded it stalled: 4 seconds of virtual time didn't finish in 5 minutes. Four minutes of smooth footage would take many hours. A Mac's GPU records it in real time in about 5 minutes, with no manual clicking.

**What `record-demo` does:**
* Exports the `Vince` commit into its own folder, so your working copy is untouched.
* Starts a local backend with the app's seeded demo data, or points at your Convex dev deployment if you want the keyed features.
* Opens Chrome at 1920×1080 and runs all chapters with human pacing.
* Draws a presentation cursor and click ripple. This is injected by the script; the app code is unchanged.
* Saves full-quality frames and a log of every action with its on-screen position, which drives the automatic zooms.

**Teammate time in total: about 1 hour:**
* run the recorder (~10 min, mostly waiting), or I run it on your Mac through the desktop app;
* record the narration (~20 min);
* review the cut (~30 min).

---

## 4 · Decisions needed before the long render

1. **Approve the 21 s promo structure** above. I'll then show the six changed keyframes before rendering.
2. **End-card credit:** team name and members, plus anything /brag requires (event logo, link).
3. **API keys:** do you have Anthropic, Lalamove sandbox or Fish keys on your Convex dev deployment? With them, the demo shows real AI receipt reading, real sandbox quotes and Claude-powered Jarvis. Without them, those parts are skipped or labelled.
4. **Who records the demo:** a teammate runs one command, or I drive Terminal on your Mac via the desktop app (you'd approve access).
5. **Narration:** a teammate's voice (recommended for judges) or a synthetic voice.
6. **Pitch sections:** confirm the hackathon's required sections and length. The plan assumes problem, solution, demo, how it's built, next steps and team, at ≈ 6:00.
