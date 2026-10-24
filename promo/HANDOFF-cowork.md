# WareOrb promo: handoff from Claude Cowork to local Claude Code

This is a **continuation**, not a new task. Everything below was produced in one Cowork session that ran on 23–24 Oct 2026 in a cloud container. This package holds:
* all the source code;
* the captured real-app assets;
* every preview and QA render;
* the creative documents;
* the full session transcript.

Resume from here. Do not restart production or reset creative decisions.

---

## 0 · Where things stand

| Item | State |
|---|---|
| Creative direction | **"One line"** (v2), approved as the direction and extended to a **21-second cut (v3)**. |
| v3 renderer | Built and working: `promo/source/harness/src3/`, 630 frames at 30 fps, deterministic. |
| v3 review keyframes | Six rendered: `promo/previews-v3/keyframe-01..06.png`. **01 and 04 must be re-rendered** (see §9). There's no contact sheet yet. |
| Last code change | The approval hold and the ripple-fade patch in `src3/`. Built into `dist3`, but only one frame (f401) has been rendered from it. |
| Audio | **Not started.** It will be code-synthesised music and SFX, with no voice. |
| MP4 | **None rendered for any version yet.** v1, v2 and v3 exist only as stills. |
| Full-film QA | **Not done.** |
| Problem/solution narrative (Stage A) | **Not started.** The source spec is in `context/attachments/`. |
| Production plan update (Stage A/B) | **Not started.** `promo/production-plan.md` predates the latest instructions (§2.4). |

The last thing the user asked for, before the migration, was a fully code-driven workflow with mandatory visual verification:
1. Render a real MP4.
2. Extract keyframes from across the whole video.
3. Make contact sheets and inspect them.
4. Check typography, composition, transitions, clipping, consistency and artifacts.
5. Fix, re-render and verify again.

**Never call the video finished just because it rendered.** Keep every source file, video and QA output.

---

## 1 · How to resume in Claude Code

### 1a. Official path (Anthropic)
Anthropic's help article ["Use Claude Cowork on web, desktop and mobile"](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile) describes this flow:
1. Open the Cowork task and select **Download task data**.
2. Unzip the download and open the folder in Claude Code.
3. Run **`/port-task-data`** to pick up the context.

The article doesn't say which files that download includes. That's why this package was also copied to your Mac (1b), so nothing depends on the download.

### 1b. This package on your Mac
Location: `~/Documents/codes/Bababoi/out/wareorb-promo/`. The repo's `.gitignore` ignores `out/`, so nothing here is committed.

```
wareorb-promo/
  HANDOFF.md                  ← this file
  promo/                      ← the full production workspace (code, assets, previews, QA, docs)
  context/
    cowork-transcript.jsonl   ← the complete Cowork session (every message and tool call)
    attachments/              ← the user's briefs and the capacity spec, verbatim
  vince/                      ← unmodified export of origin/Vince @ 781687f (the product frontend)
```
* `vince/` has its own `CLAUDE.md`, `AGENTS.md` and `HANDOFF.md`. Those belong to the app team, not to this production.
* `MANIFEST.sha256` lists a checksum for every packaged file (check with `sha256sum -c MANIFEST.sha256`; on macOS use `shasum -a 256 -c`).
* `../wareorb-promo-transfer/` and `../wareorb-promo.tgz` are left over from the transfer. Delete them once this folder checks out.

### 1c. First commands on the Mac
```bash
cd ~/Documents/codes/Bababoi/out/wareorb-promo
# product snapshot (already extracted to ./vince); install its deps for the 3D modules
cd vince && bun install && cd ..
# render tooling (Playwright)
cd promo/source && npm install && npx playwright install chromium && cd ../..
# python for crops and sheets
python3 -m pip install pillow numpy scipy
# ffmpeg (if missing)
brew install ffmpeg
# build the v3 renderer (it imports the product's real 3D scene read-only from ../../../vince)
cd promo/source/harness && ENTRY=v3 bun run build.ts
# smoke test: one frame
cd ../render && node render-frames.mjs --dist ../harness/dist3 --out /tmp/v3test --frames 401 --dpr 2
```
* `build.ts` defaults to `VINCE_DIR=../../../vince`. That resolves to `wareorb-promo/vince` in this layout.
* `build.ts` creates `harness/node_modules` as a symlink to `vince/node_modules`. Don't create it yourself.
* On macOS the render scripts use Playwright's own Chromium with the real GPU. On Linux they use the pinned SwiftShader setup. Override with `CHROME_PATH=…`, or force software GL with `SWIFTSHADER=1`.
* **Re-check the look after moving machines.** GPU rendering on a Mac can differ slightly from the cloud's SwiftShader output (shadows, antialiasing). Compare the new f401 and f615 with the PNGs here.

### 1d. Local skills
The user installed **`lemo-opuscar`** and **`onetake`** locally. The cloud session couldn't see them:
* claude.ai skills listed only the defaults;
* `~/.agents/skills` was empty;
* `~/.claude` is off-limits to Cowork.

In Claude Code, **check that both skills are discoverable** before using them. For example, run `/skills`, or read `~/.claude/skills/lemo-opuscar/SKILL.md` and `~/.claude/skills/onetake/SKILL.md`. **Read both in full.** Use them to **enhance** this existing direction and code (motion polish, render/QA loop, audio, assembly), not to replace it. If a skill prescribes a different framework (for example Remotion), apply its principles to this harness, or wrap the existing frame renderer in it. Don't rebuild the scenes.

---

## 2 · Project and requirements

### 2.1 Product and team
* **WareOrb** is an AI-assisted warehouse operations concept for small businesses (a hackathon project; SDC Hackathon, Domain 2).
* **Team Bababoi:**
  * Team Leader Alfred Lee Khai Zher;
  * members Deng Zhenqun and Loo Yi Sheng (3 members).
* **Promo credit:** `WareOrb — by Team Bababoi` (exact wording requested).
* **Repo:** `POTATO0826/Bababoi`.
  * The promo uses branch **`Vince` @ `781687f`**, "docs: handoff reflects the Jarvis chat". It was exported with `git archive` from the local clone's `origin/Vince`, because the cloud had no GitHub access.
  * The local working tree is on `backend` (`5708e52`, "feat: add reviewed persistent receiving backend"), which is still in development. The promo doesn't use it.

### 2.2 Original brief (verbatim in `context/attachments/48d96f9e-attachment.txt`)
* A premium, code-generated launch film from the **actual frontend**.
* 1920×1080 at 30 fps; H.264 MP4 with synced **stereo** audio; music and SFX generated in code (48 kHz master).
* Deterministic, time-based animation. No AI video, no watermarks. FFmpeg for encoding and verification.
* Inspect the frontend first and separate implemented features from planned ones. **Never fabricate screenshots or show unimplemented features as working.**
* **Don't modify the product source.** Work in an isolated workspace. Don't commit generated files to the repo without explicit authorisation.
* **Six-keyframe preview gate:**
  * six keyframes plus a contact sheet;
  * stop for review before the final render.
* After approval:
  * render deterministically;
  * sync audio to events;
  * QA **every** frame (blank, duplicate, resolution, flicker, clipping and so on).
  * Never claim QA passed without actually running it.
* **Deliverables in `promo/`:**
  * `previews/`, `source/`, `audio/`, `frames/`, `qa/`;
  * `storyboard.md`, `render-instructions.md`;
  * `WareOrb-promo-1080p.mp4`.
* **Priority order:** truthfulness and frontend fidelity > story clarity > cinematography > motion > A/V sync > reproducibility > verified delivery.

### 2.3 Changes from later instructions (they override the brief where they conflict)
1. "I want that feeling of **zoom in and zoom out**… when you click on the item of the product." Three product close-ups (push-in, then pull-out) are kept in every version.
2. The creative-direction reassessment (`context/attachments/b9f3488c-attachment.txt`):
   * rank 15 motion references and pick one primary style plus at most two complements;
   * critique v1;
   * write a new storyboard and make six revised previews without overwriting v1.
   * Result: `promo/creative-direction-v2.md`.
3. **Length is now about 21 s**, inside /brag's recommended 18–22 s. Reuse the V1/V2 assets and the real frontend; don't rebuild finished scenes.
4. Latest priorities (Stage A/B):
   * **Narration is recorded by humans on the team.** No AI or synthetic voices. Claude may prepare the English script.
   * **The backend is in development.** Don't assume the Codex integration works. **The promo must not depend on Anthropic, Lalamove, Fish, Codex or any other external API.**
   * **Immediate priority: the 21 s promo.** Keep the six-keyframe review before the final render. It must work as the **opening of the 5–7 min pitch video**.
   * Read `wareorb-capacity-reallocation.md` in full and use it as the primary source for the business problem and solution.
     * Prepare that section's **storyboard and narration draft**, but don't render the pitch.
     * Mark what's proposed versus implemented.
   * **Don't record the prototype demo now** (the app isn't finished). Revisit it in Stage B.
   * Don't invent features, performance gains, business results or evaluation findings. A provisional structure is fine.
   * **Stage A (now):** finalise the 21 s promo; write the problem/solution narrative; keep all earlier assets and previews.
   * **Stage B (later):** capture the prototype, add the team's voice recordings, finish the technical and impact sections, assemble the 5–7 min pitch.
5. The migration request: keep a visual production loop in Claude Code (render, extract frames, inspect, fix, re-render). Keep the best work. Everything stays code-driven. (The message was cut off after "Preserve"; ask the user what else to preserve.)

The user writes in English and wants answers in English.

### 2.4 Truthfulness: what's real, labelled or not shown
* **Real** (executed in the running Vince app against a local Convex backend seeded with the app's own demo data; 2× captures):
  * receive DN-2291 → tick "Counted and checked" → **Post to stock** (history "J. Lim · 4 × CHAIR-LUMA-0410 → C-3-01");
  * ageing rule (≥90 days and 0 sold in 30 days) flags **B-2140-A** (120 days, A-1-01 and A-1-02) → **Hand to Arif** (deal D-1001, "Finding buyer");
  * buyer form → **Demo** quotes;
  * **Approve** (net recovery RM920, "before stock cost · not profit", "Approved by Mei", A-1-01 reserved);
  * simulated booking **SIM-7001** → **Goods collected** → **Confirm 2 left the warehouse** ("2 collected Oct 23, 2026, 4:32 PM · from Warehouse · Shah Alam"; A-1-01 freed);
  * replenishment suggestion "3-Seater Sofa · Oatmeal +4", with its arithmetic ("Order 4" was **not** pressed).
  * The 3D twin is the branch's own `Structure`/`BaysLayer`/`FurnitureLayer`, fed with captured ledger snapshots.
* **Labelled:**
  * carrier quotes are **synthetic** (the app's "Demo" replies);
  * the booking is **simulated**;
  * all data is **seeded demo data**.
  * The footers in the film say so.
* **Illustrative, not a feature:** the line itself (it visualises the ledger trail) and the route to the "Petaling Jaya · SS2" pin.
* **Not shown, because it needs keys or isn't built:**
  * "Read with AI" (Anthropic), live Lalamove quotes, Claude-driven Jarvis and Fish voice;
  * Codex (unconfigured);
  * voice/handwriting capture drafts, standard transport enquiry and the Orbyte fit (the spec marks these proposed; Orbyte isn't sponsor-approved).
  * There are **no measured benefits**, and the spec's whole workflow revision is `implementation_state: not-built` (draft).
* **Numbers:**
  * the spec's own synthetic example nets RM900 (including RM20 packing);
  * the captured app shows **RM920** (no packing line).
  * The film uses what the app shows.

---

## 3 · Creative direction and decisions

* **v1 (rejected as final, kept as an asset source):**
  * "glass panels over the isometric twin", with the warehouse assembling itself;
  * self-critique (in `creative-direction-v2.md` §2):
    * scenes too similar;
    * reads like an annotated screen recording;
    * panels too large and text too small;
    * weak ending.
  * Its best moment, the **assembly of the twin**, is reused in the v3 opening.
* **v2 "One line" (approved direction):**
  * One unbroken line is the ledger trail of one batch of stock. It draws the WareOrb mark (the app's Lucide warehouse icon), which morphs corner to corner into the warehouse silhouette.
  * The line outlines the real places and **reveals real UI crops inside the shapes it closes**.
  * The twin is a cool ghost (about 30%) except inside closed shapes.
  * Colour follows the app's state colours: blue → violet (ageing) → teal (reserved) → green (freed).
  * Finale:
    1. the whole journey lights up;
    2. the trail is reeled in and the silhouette morphs back into the mark;
    3. the mark fills with blue;
    4. "WareOrb · Every move, one live ledger."
  * Reference ranking:
    1. Single continuous line (primary)
    2. Isometric 2.5D (complement)
    3. Continuous morphing (complement, bookends only)
    4. Sci-fi HUD (only as accent colours that change with status)
    5. Glassmorphism (restraint only)
  * Rejected: Blender physical 3D, liquid metal, synthwave, Bauhaus, paper collage, pixel art, boiling line, flat vector, sticker explainer, variety-show type.
* **v3 (21 s, current):**
  * the v2 film re-timed for readability;
  * a **cinematic opening** in which the app's own twin assembles inside the mark's silhouette (slab rises, racks drop, furniture lands with squash), with a slow push-in and stronger tilt-shift;
  * **four real button presses**. The line loops the real button and closes; the button copy dips and springs back; a ripple plays; the card dissolves to the **next real capture**:
    * Post to stock;
    * Hand to Arif;
    * Approve;
    * Confirm 2 left the warehouse.
  * Cards resize between real states, and the line's outline follows.
  * The trail is drawn **under** the cards. Strokes that act on a card (ticks, button loops, underline, the Lowest loop) are drawn **on top**.
  * Brand ending:
    * a journey-map hold;
    * reel-in;
    * fill;
    * wordmark, tagline, then the **credit line "WareOrb — by Team Bababoi"**;
    * the footer "Hackathon prototype · real WareOrb UI · seeded demo data".
* **Captions:**
  * 01/03 "Capture stock." / "Check the delivery. Post it to a bay."
  * 02/03 "Turn inventory into action." with subtitles:
    * "Spot stock that isn't selling."
    * "Hand it to sales. Compare carrier quotes."
    * "The owner approves. Stock is reserved."
    * "Confirm the collection. The bay is freed."
  * 03/03 "Make better decisions." / "Reorders come with their arithmetic."
* **Type and colour:**
  * Geist 600 for heads and Geist Mono for labels;
  * bg `#09090b`, panel `#0c0c0f`, blue `#4F8BEA`/`#8db1f3`, violet `#a78bfa`, teal `#2dd4bf`, green `#22c55e`, warn `#E3BD78`.
* **Sound plan (not built):**
  * 120 BPM, so one beat is 15 frames and the film is 42 beats;
  * a soft electronic pulse;
  * glass/marimba plucks on line closures;
  * a pen-glide synth whose filter tracks tip speed;
  * press clicks, landing thuds, a rail whoosh, and a resolving chord on the mark fill;
  * 48 kHz stereo, mastered for later ducking under the narration.
  * Event cues are exported by `cues()` in `story3.ts`.

### 3.1 v3 timeline (frames at 30 fps; constants `T` in `src3/story3.ts`)
| Frames | Scene | Key events |
|---|---|---|
| 0–100 | Opening | mark drawn 3–33 with "WareOrb" hook word · morph 38–66 · twin opens 58 · assembly 60–~110 · push-in |
| 100–222 | 01 Capture | dock close 128 · receipt card 134–147 · tick 165 · **press Post to stock 180** · pending units lift 182 · toBay · chairs land 208 · bay 212 · close-up #1 ~214 |
| 222–300 | 02 Spot ageing | violet laps 236–252 · close-up #2 ~246 · ageing card 258–270 · **press Hand to Arif 300** |
| 300–356 | Hand off & quote | along the back wall · out of the door · pin 326 · quotes card 329–338 · Lowest loop 344–355 |
| 356–426 | Approve | approval card 360–370 · **press Approve 390** · decision "Approved by Mei" · camera holds to ~404 |
| 410–501 | Collection | back through the door 412–426 · reserved lap to 434 · collection card 439–447 · **press Confirm 465** · units ride the rail 471–494 · freed (green) 495–501 |
| 501–540 | 03 Reorder | lap 508–514 · close-up #3 ~516 · replenish card 518–525 · underline 532–539 |
| 538–629 | Brand | journey lights 538 · pull-back ~550 · hold · reel-in 562 · mark close 580 · word 582 · tag 588 · credit 594 · hold to 629 |

---

## 4 · File map (`promo/`)

| Path | What |
|---|---|
| `storyboard.md` | v1 storyboard plus the implemented/simulated table (10 s version) |
| `creative-direction-v2.md` | the 15-reference evaluation, v1 critique, "One line" storyboard and truth table |
| `production-plan.md` | the 21 s and 6 min plan (**partly superseded**: see §2.3 item 4) |
| `previews/` | v1 six keyframes, contact sheet, raw |
| `previews-v2/` | v2 six keyframes (f18, 57, 105, 153, 210, 273), contact sheet, `compare-v1-v2.png` |
| `previews-v3/` | v3 keyframes 01–06 (f92, 181, 301, 404, 482, 615, dpr 2) and `raw/`. No contact sheet yet. |
| `qa/v3-issues/` | evidence frames for the known issues in §9 |
| `audio/`, `frames/` | empty (final render not started) |
| `source/capture/` | Playwright drivers of the **real app** (`capture-flow.mjs` phases A–F, `step.mjs`, `shot.mjs`, `steps/`) |
| `source/captured/ui/` | real 2× UI captures (c01–c12) |
| `source/captured/ledger/` | real ledger snapshots L0–L5 (drive the 3D twin) |
| `source/harness/build.ts` | Bun bundler: `ENTRY=v3` → `src3/main3.tsx` → `dist3`; `ENTRY=v2` → `dist2`; default → v1 `dist` |
| `source/harness/src/` | v1 renderer plus shared modules: `anim3d.ts` (instance animation, assembly), `cam.ts`, `ease.ts`, `clock.ts`, `stub-actions.ts` |
| `source/harness/src2/` | v2 "One line" renderer (10 s), unchanged |
| `source/harness/src3/` | **v3 renderer (current):** `story3.ts` (timeline, geometry, cards, presses, camera, cues), `overlay3.ts` (mask, cards, presses, line layers, type), `main3.tsx` (R3F scene, post-processing, frame stepping), `line.ts`, `plane.ts`, `style.css`, `index.html` |
| `source/harness/public/` | `ui/` (v1 crops), `ui2/` (v2 crops), `ui3/` (v3 before/after states plus `ui3.json`), `ledger/`, `fonts/` |
| `source/harness/make-ui3.py` | reproducibly crops the v3 states from `captured/ui` (documents the source rect of each crop) |
| `source/render/render-frames.mjs` | static server plus Playwright: `--dist --out --frames a-b|list --dpr --port` → `frame-NNNN.png` |
| `source/render/sheet.py` | contact sheet: `python3 sheet.py <dir> <out.png> [cols] [tile_w]` |
| `source/render/contact_sheet*.py`, `still.mjs` | v1 and v2 sheet makers; one-off still |
| `source/test3/a`, `test3/b` | v3 QA iteration renders (dpr 1) and their sheets: first pass, then after the routing/layer fixes |
| `source/draft3/` | aborted draft animatic (10 frames, stale) |
| `source/demo/` | failed cloud tests of frame-stepped real-app recording (reason in §7) |

`context/attachments/`:
* `48d96f9e-attachment.txt`: the original brief;
* `b9f3488c-attachment.txt`: the creative reassessment;
* `bc8961e2-wareorb-capacity-reallocation.md`: the business spec.

The same spec is in the repo's research checkout, per `docs/plans`.

claude.ai Project "waveorb" also holds:
* `claude/wareorb-promo-storyboard.md`
* `claude/wareorb-promo-creative-direction-v2.md`
* `claude/wareorb-video-production-plan.md`
* this handoff, as `claude/wareorb-promo-handoff.md`

---

## 5 · How the renderer works (essentials)

* **Pure function of the frame:** `window.renderFrame(n)` sets the app's zustand store (`setWare`) to the ledger snapshot and stage for frame *n* (`sceneState`). It then:
  * writes instance matrices (`SceneAnimator.writeInstances` with `eventPose`);
  * places the orthographic iso camera (`camAt` → `shotOf` → `applyShot`);
  * draws the 2D overlay;
  * calls `r3f.advance()`.

  Frames can be rendered in any order. The opening assembly is stateless per frame.
* **Picture-plane camera:** everything (twin, line, cards, grid) lives in one plane. `toPlane([x,y,z]) = [S45·(x−z), SE·S45·(x+z) − CE·y]`. The camera is `{u, v, zoom px/m}`, keyed with `K(frame, u, v, zoom, ease)` in `story3.ts`.
* **Look:** the app's own lights, re-balanced (key 3.6, hemisphere 0.38, ambient 0.1, environment 0.45), NeutralToneMapping at exposure 1.25. The post pass is a framebuffer copy, then a two-pass tilt-shift (`blurAt(n)`), then the twin mask (ghost outside the line's windows).
* **Line:** `Seg` objects with time-warp at corners, `journey`/`keep`/`fade`/`top` flags, and live-height card outlines. `lineAt()` handles drawing progress and retraction.
* **Cards:** `defCard(id, states[], swaps[], tl, w, reveal, out)`. A card's state is a real capture; `cardBlend`/`cardH` handle the cross-fade and height. **Presses:** `{card, state, btn rect in source px, f}`.
* **Speed:** in the cloud (2-core CPU, SwiftShader) about 2.5 s/frame at dpr 1 and 5–8 s/frame at dpr 2. A Mac GPU should be much faster.

---

## 6 · Production requirements to keep
* 1920×1080, 30 fps, **630 frames (0–629) = 21.0 s**, H.264 (yuv420p, high profile) + AAC 48 kHz stereo.
* Everything code-driven and deterministic. No AI video, no AI voice, no watermarks.
* No external-API features in the promo. Keep the synthetic/simulated labels.
* The product source stays untouched. Nothing generated gets committed to the repo without permission.
* Keep v1, v2 and all previews (new versions get new folders, e.g. `previews-v3b/`).
* Six-keyframe review gate before the final long render. Visual QA after every render.

---

## 7 · Rejected or failed approaches (don't repeat)
* EffectComposer/OutputPass over-saturated the app's `toneMapped:false` materials. Replaced with the framebuffer-copy post.
* Diagonal, V-shaped line routes looked cluttered. Travel goes along the aisles (`via()`), and approaches into cards follow the card's left margin (`margin()`).
* Lines crossing UI cards. Fixed by layering (trail under the cards).
* Frame-stepped capture of the *real app* in the cloud (Playwright `page.clock`) was ≥20× slower than real time and stalled with the full scene. **Record the Stage B prototype demo on a Mac with a GPU.**
* `convex dev --local` is deprecated, and anonymous mode was blocked in the cloud. A self-hosted `convex-local-backend` binary was used instead (a Linux zip is in `out/`; on a Mac, use the normal Convex CLI).

---

## 8 · Remaining work (in order)

### Stage A (now)
1. **Fix the v3 issues in §9** (1–3 at minimum). Then render the **six review keyframes** again:
   * suggested frames 86, 181, 301, 401, 482, 615;
   * also extra transition frames around each press (press −6, press, press +4, press +10);
   * save to a **new** folder (`previews-v3b/`) with a contact sheet.
2. Render a **draft MP4 preview** for timing (630 frames at dpr 1, no or provisional audio):
   * extract frames every 0.5 s plus all transition windows;
   * make contact sheets and inspect them;
   * fix what you find and repeat.

   This is what the user asked for. Present it **with** the six keyframes at the review gate.
3. **Stop for the user's review** (the six-keyframe gate is mandatory).
4. After approval:
   * final render at dpr 2 into `promo/frames/`;
   * **audio**: music and SFX synthesised in code from `cues()`, 48 kHz stereo, no voice, leave headroom (about −14 LUFS integrated, true peak ≤ −1 dBTP);
   * encode `promo/WareOrb-promo-1080p.mp4`;
   * `ffprobe` checks: 1920×1080, 30 fps, 630 frames, 21.0 s, stereo 48 kHz.
5. **Full QA**, every frame. Write the results to `promo/qa/`:
   * blank or black frames;
   * duplicates and frozen runs;
   * resolution and frame count;
   * flicker (luma deltas);
   * clipping;
   * audio peaks and loudness;
   * A/V sync at the four presses.

   Then:
   * extract keyframes across the MP4 and make contact sheets;
   * inspect typography, composition, transitions, clipping, consistency and artifacts;
   * fix, re-render and re-verify.
6. Write `promo/render-instructions.md` (exact commands, versions, hashes).
7. **Problem/solution storyboard and English narration draft**, for human recording:
   * source: `context/attachments/bc8961e2-wareorb-capacity-reallocation.md` (problem items are labelled as the **team's hypothesis**);
   * mark each capability as *implemented in Vince @781687f*, *needs keys* or *proposed*;
   * no invented metrics;
   * give per-section timings.
8. Update `production-plan.md` to the Stage A/B structure:
   * human voice-over only;
   * no API-dependent content;
   * demo recording postponed;
   * provisional technical and impact sections.

### Stage B (later)
* Capture the prototype on the Mac with real clicks and recorded outcomes. Reuse `source/capture/` as the driver.
* Integrate the team's recorded narration.
* Write the technical and impact sections; don't invent results.
* Assemble the 5–7 min pitch, with the 21 s promo as its cold open.

---

## 9 · Known issues and quality concerns (v3, from visual QA)
1. **Orphaned button loop** after a card shrinks. At Approve, f≈393–402, the selection loop stays where the button used to be (`qa/v3-issues/frame-0401-orphan-button-loop.png`). Hand to Arif has the same problem, less visibly. **Fix:** fade loops over `press+1 … press+6`, tied to `cardBlend`.
2. **Receipt dissolve** f≈184–189: "Save lines / Post to stock" ghost over the new history rows (`frame-0190-receipt-dissolve.png`). Shorten the dissolve or use a top-down wipe.
3. **Keyframes 01 and 04** in `previews-v3/` were rendered before the last patch.
   * f92 is past the most dynamic part of the assembly.
   * f404 is weak: the card is cut at the right edge and the ripple floats below the shrunken card (`frame-0404-weak-keyframe.png`).
   * Use f86 and f401 instead, after fixing issue 1. Neither has been rendered at dpr 2 yet; only a dpr 1 test of f401 exists, in `qa/v3-issues/`.
4. The quotes card is about 540 px wide at zoom 22, so the text is small. Check legibility; consider zoom 24–26.
5. The ghost twin looks muddy in some shots (noted in v2). Tune the ghost level per shot.
6. Beat snapping: the presses sit on beats 12/20/26/31; other events don't yet. Snap closures and landings to within ±1 frame of the grid where possible.
7. No motion blur yet. Planned as restrained sub-frame accumulation on the dispatch units and the two long aisle travels only.
8. Journey hold f548–562: check that no lit journey line leaves the frame. `toPinBack` is already excluded from the journey.
9. The end card shows "WareOrb" twice (wordmark plus the requested credit "WareOrb — by Team Bababoi"). This was intentional, per the user's wording. Mention it at review.
10. The collection card shows the real capture timestamp "Oct 23, 2026, 4:32 PM". It's genuine; confirm the user is fine with it.
11. Renders on a Mac GPU may differ slightly from the cloud SwiftShader renders. Re-check the look against the existing PNGs.

---

## 10 · Mandatory visual QA loop (every iteration)
1. Render (keyframes, then a draft MP4, then the final).
2. Extract representative frames plus all transition windows (`ffmpeg -ss … -frames:v 1`, or straight from the PNG frames).
3. Make contact sheets (`source/render/sheet.py`) and **look at them**.
4. Check:
   * typography: legibility, overlap, widows;
   * composition and headroom: nothing cut at the frame edges unless intended;
   * transitions: no ghosting or orphaned strokes;
   * clipping and artifacts;
   * continuity of the line, colours and state;
   * truthfulness labels are present.
5. Fix, re-render and re-check. Keep the best previous version in its own folder.
6. Only report done after the final MP4 itself has been inspected and the automated checks have passed.
