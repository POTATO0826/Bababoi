# WareOrb extended promo film: handoff (25 Oct 2026)

**The immediate creative objective:** a premium cinematic WareOrb launch film of **at least ~30 seconds**. It should show:
* genuine inventory automation;
* meaningful human approvals;
* **Lalamove sandbox quotation**;
* **Jarvis agent assistance**, wherever they are demonstrably supported.

**You choose** the final duration (30–45 s is a starting point, with no fixed upper limit) and the creative execution. This document gives you everything needed to decide. The capability facts, with source paths and evidence levels, are in **`VIDEO-CAPABILITY-AUDIT.md`**. Read it before you storyboard.

**The two video deliverables:**

| | Extended promo (**this**) | Official SDC Hackathon pitch video (separate) |
|---|---|---|
| Length | ≥ ~30 s; you decide | 5–7 min (the hackathon's rules are still unknown; ask the user) |
| Voice | None needed: music and SFX, like the 21 s promo | The team's own recorded narration (human only) |
| Docs | This file, `VIDEO-CAPABILITY-AUDIT.md`, `NEXT-AGENT.md` | `pitch/pitch-plan.md` (approved 24 Oct, but its build assumptions are outdated, see §6), `HANDOFF.md`, `pitch/problem-solution.md` |
| Status | **Not started.** Start here. | Paused after the plan |

---

## 1 · Status (25 Oct 2026)

| Item | State |
|---|---|
| **21 s promo** `promo/WareOrb-promo-1080p.mp4` | **Delivered, approved, verified.**<br>• SHA-256 `86640bae8fc1a3634ddecb1d385c7b22a619ae977ad2e42511541f4321ea461b`; 630 frames; 1920×1080; 30 fps; AAC 48 kHz.<br>• **Keep it unchanged**; it's a finished asset. A longer film is a **new** file. |
| Its score | `promo/audio/WareOrb-promo-score-master.wav`: SHA-256 `5cbb92be…`, −16.2 LUFS, −2.8 dBTP, code-synthesised, no voice |
| Product at `backend-production` @ `4c2cc97` | `bun run check` passes on the Mac. The local no-login demo boots. Offline Jarvis navigation and the Lalamove card (disconnected) are verified. Live Lalamove and live Jarvis are **not** verified here. See the audit. |
| Extended promo | Not started. No renders and no captures from the new frontend for the film yet. Four evidence screenshots exist (§3). |

---

## 2 · Repository, branches and worktrees

| | |
|---|---|
| Repo | `https://github.com/POTATO0826/Bababoi` |
| **Product, source of truth** | `backend-production` @ **`4c2cc973ffccc2691019429605982b6d2989cd3f`** (25 Oct 2026 02:01 +0800). Read only. **Don't merge it into the video branch, and don't change business logic.** Run it from a `git archive` export (§4.3). |
| **Video branch** | `promo/wareorb-video`: this folder `promo/`. Worktree **`~/Documents/codes/Bababoi-promo-video`** (the app at its root is `Vince` @ `8f4d6df`, which the 21 s harness builds against). Commit docs and code here; push without force. |
| The promo's app | `Vince` @ `781687f`, code-identical to `8f4d6df`. Exported locally at `~/Documents/codes/Bababoi/out/wareorb-promo/vince/`. |
| **Don't touch** | • `~/Documents/codes/Bababoi`: branch `backend`, the team's work; never commit there. `out/` inside it is gitignored and holds the local package.<br>• Other agents' checkouts and their running local backends: `~/Documents/codes/Bababoi-backend-production` (an orphaned backend on port 3210), `/private/tmp/wareorb-production-6FLaVM` (3231), `~/Documents/codes/Bababoi-live-demo` (3241). |
| Cloud deployments | **Never use** them for video: shared dev `admired-swordfish-390`, production `descriptive-lemur-152`. |

---

## 3 · Existing assets (preserve them all)

| Asset | Where | Notes |
|---|---|---|
| Final film and score master | `promo/WareOrb-promo-1080p.mp4`, `promo/audio/WareOrb-promo-score-master.wav` (in git) | Hashes in `render-instructions.md` |
| 630 final frames | `~/Documents/codes/Bababoi/out/wareorb-promo/promo/frames/` (1.0 GB; `FRAMES.sha256`) | Local only |
| Drafts | `…/out/wareorb-promo/promo/drafts/v3b-draft1–3`, `v3b-final` (3.4 GB) | The approved review draft is draft 3; keep it |
| QA | `promo/qa/final/` (git); iterations in `…/out/wareorb-promo/promo/qa/` (1.3 GB) | Keep |
| Review stills | `promo/previews-v3b/` (keyframes 01–06, contact sheet, transitions, v3 vs v3b) | |
| Captures from the **old** frontend (`Vince`) | • `promo/source/harness/public/ui3/` (`r0-unchecked`, `r1-checked`, `r2-posted`, `a0-ageing`, `a1-handed`, `p0-approval`, `p1-decision`, `q0-confirm`, `q1-collected`, plus `ui3.json` crop data);<br>• `ui2/`, `ui/`;<br>• `promo/source/captured/{ui,ref,ledger}` (ledger snapshots L0–L5) | **Outdated UI.** See the audit §2. Keep them, but don't present them as the current product. |
| Evidence screenshots of the **new** frontend (`4c2cc97`, no credentials) | `…/out/wareorb-promo/pitch/qa/backend-4c2cc97-screens/01-home.png`, `02-jarvis-open.png`, `03-jarvis-navigate-sofa.png`, `04-delivery.png` | Evidence only (DPR 1). Not for the film. |
| `e935ae6` export (superseded) | `…/out/wareorb-promo/app-e935ae6/` | Its local deployment needed Clerk. Not needed any more; keep it. |
| `4c2cc97` export (current) | `…/out/wareorb-promo/app-backend-production-4c2cc97/` (with `node_modules`, `.env.local` mode 600 holding the presenter key pair and bridge secret, never to be committed, and `.convex/local/` with the seeded data) | Use it, or a fresh export, for captures |
| Logs | `…/out/wareorb-promo/pitch/logs/` (`check-4c2cc97.log`, `demo-4c2cc97-b.log`, `convex-dev*.log`) | |

**Preservation rules (the user's standing requirements):**
* Never overwrite or re-render the delivered film or its frames. New work goes in **new, versioned folders**, e.g. `out/wareorb-promo/promo-ext/drafts/v1/` and `promo/source/harness/src4/`.
* Keep every earlier version.
* Never delete anything in `out/` without the user's OK (on 24 Oct they chose "keep everything").
* Don't commit frames, drafts, `.venv`, `node_modules`, `.env*`, `.convex/` or credentials. **Ask before pushing large binaries.**

---

## 4 · Rendering pipeline, dependencies and commands

### 4.1 · Toolchain (verified 24–25 Oct on this Mac, an M1 Pro)

* Bun 1.4.3; Node 26.12.1 (default).
* **Node 24.22.1**, keg-only via Homebrew at `/opt/homebrew/opt/node@24`. The local Convex backend needs Node 20, 22 or 24; `bun run demo` finds it automatically.
* Playwright 1.56.1.
* Google Chrome 155 via `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` (GPU via ANGLE/Metal). Playwright's Chromium download stalled here.
* FFmpeg 9.0.2; uv 0.13.5.
* Python venv `promo/source/.venv` (numpy 2.5.4, scipy 1.18.1, pillow 13.0.0, opencv 5.0.0.93, matplotlib).
* Preferences: install CLI tools with Homebrew; project dependencies use Bun and the lockfile.

### 4.2 · The 21 s renderer, for reuse

* **The harness:** `promo/source/harness/src3/`.
  * `story3.ts`: the timeline `T`, cards, presses, camera `camAt`, `cues()`, captions and footers.
  * `overlay3.ts`: the 2D layers.
  * `main3.tsx`: the R3F scene, post-processing, frame stepping, `motionAt`, sound data.
  * `line.ts`, `plane.ts`.
* **How it binds to the app:** it imports the app's real scene read-only (`@/scene/structure`, `@/scene/bays`, `@/scene/furniture/furniture-layer`, `@/scene/camera-rig`, `@/data/layout`, `@/domain/stock`, `@/store`), resolved from `VINCE_DIR` or the repo root. See `build.ts`.
* **Building against `backend-production`** (`VINCE_DIR=<export>`) is untested. Since `Vince`:
  * `src/scene/bays.tsx` (+18) and `src/store.ts` (+116) changed;
  * the seed changed;
  * expect compile or interface fixes in the **harness**, never in the product.

```bash
cd ~/Documents/codes/Bababoi-promo-video && bun install --frozen-lockfile
cd promo/source && npm ci            # .venv already exists
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd harness && OUTDIR=dist3b ENTRY=v3 bun run build.ts      # add a new ENTRY (e.g. src4) for the extended film
cd ../render && node render-film.mjs --dist ../harness/dist3b --out <new dir> --frames 0-629 --dpr 2 --shutter 180 --gap 4 --max-samples 48 --workers 3
```

* **Render speed:** about 0.2–0.3 s per capture; the 630-frame film took 18–21 min at dpr 2 on 3 workers. Expect about 26–30 min for 30 s and 40–45 min for 45 s, plus drafts.
* **Score:**
  * Run `node export-sound.mjs <dist> <sound-data.json>`, then `score.py`, then `master.sh` (−16 LUFS, ≤ −2 dBTP), then `balance.py`.
  * `score.py` takes its length from the data, but its **chord table `CH` and some cue windows are written for the 630-frame cut**. Re-author the progression for the new timeline in the same palette: 120 BPM, D major, one chord per bar, the groove entering after the first statement, the cadence on the mark fill.
* **Encode:** `sh render/encode.sh <frames> <out.mp4> 16 <master.wav>` (H.264 High, yuv420p, **BT.709 set explicitly**, AAC-LC 320 kb/s, `+faststart`).
* **QA:** `qa_frames.py`, `qa_av.py`, `qa_encode.py`, `extract_frames.py`, `sheet.py`, `compare_runs.py`. The exact commands are in `render-instructions.md`.

### 4.3 · The current product (`backend-production` @ `4c2cc97`): the local demo, for captures

```bash
D=~/Documents/codes/Bababoi/out/wareorb-promo/app-backend-production-4c2cc97   # or a fresh: git archive origin/backend-production | tar -x -C <new dir>
cd "$D" && bun install --frozen-lockfile && env -u ANTHROPIC_BASE_URL bun run check   # 314 + 79 tests pass (25 Oct)
env -u ANTHROPIC_BASE_URL WAREORB_DEMO_PORT=3350 WAREORB_CONVEX_PORT=3360 bun run demo   # Ctrl-C stops; data persists
env -u ANTHROPIC_BASE_URL WAREORB_DEMO_PORT=3350 WAREORB_CONVEX_PORT=3360 bun run demo:reset   # reload the synthetic data (deletes rehearsal records)
```

* **Ports:** 3210 is held by another checkout's backend on this Mac, so pick free ports as above.
* **Freshness:** reset before filming; seeded quotes stay valid about 4 days and collection dates are 4–7 days ahead.
* **Credentials:** the app opens with **no login** (Owner "Demo presenter"). Jarvis and Lalamove credentials are entered **by a person in the page** and live only in server memory; restarting forgets them.

---

## 5 · The existing storyline and motion design

**What's in it** (full detail in `storyboard.md`, the review record `review-v3b.md`, and the reasoning in `creative-direction-v2.md`):
* **"One line".** One unbroken line is the ledger trail of one batch. It draws the WareOrb mark (Lucide warehouse), morphs into the isometric silhouette, and the real twin assembles.
* Real UI appears only inside shapes the line closes. Press beats use the **press wave**, which reveals the next real capture from the pressed control; there are no cross-dissolves between layouts.
* Product close-ups ("click a product: zoom in, zoom out") are triggered by the line closing around a product.
* The journey lights up, reels back into the mark, and ends on the card "WareOrb · Every move, one live ledger. · WareOrb — by Team Bababoi".
* **Palette:** bg `#09090b`; blue `#4F8BEA`/`#8db1f3` (journey); violet `#a78bfa` (ageing); teal `#2dd4bf` (reserved); green `#22c55e` (freed); warn `#E3BD78`.
* **Type:** Geist 600 and Geist Mono; captions bottom-left on a scrim; a disclosure footer bottom-right.
* **Camera:** true-isometric picture plane, 2D pan and zoom only, never rotating; chases moves; holds each press result ~0.4 s.
* **Motion:** a real 180° shutter for anything moving, with every mover registered in `window.motionAt`; screen-fixed type renders at the integer frame; `renderFrame(n)` is pure (the app clock is `600 s + n/30`).
* **Sound:** synthesised in one room; the music ducks under the effects; clicks land within 1 ms.

**Keep** (the user's request):
* the mark morphing into the warehouse;
* cinematic zoom-in and zoom-out;
* the real 3D twin;
* the continuous line;
* product-focused camera;
* readable UI;
* timed interactions and sound;
* a strong final brand reveal.

**Reuse candidates:**
* the opening, f0–108 (mark → silhouette → twin assembly). It's the app's own twin, and the layout is unchanged;
* the line, camera, shutter and wave machinery;
* the end card and reel-in, f544–629 (re-time for the new journey);
* the sound palette.

**Don't reuse as current product:** every UI card from `Vince` (the audit §2). Don't simply slow the 21 s cut down.

---

## 6 · Outdated instructions and assumptions (correct these)

| Old statement (where) | Now (at `4c2cc97`) |
|---|---|
| "Record `backend-production` @ `e935ae6`; it needs Clerk sign-in; decision A Clerk exception" (`pitch/pitch-plan.md`, `HANDOFF.md`) | The **local demo needs no sign-in at all** (a locally minted presenter token). Clerk is only for hosted mode. Use `bun run demo`. |
| "Keyed features (Read with AI, Lalamove, Jarvis) are only 'wired in, needs a key', never shown working" (old `NEXT-AGENT.md`, `HANDOFF-promo.md` §3) | The user now **wants Lalamove quotes and Jarvis shown where demonstrably supported**. A person enters the credentials in the page. Show them only if they work on camera, and label them (sandbox, quote only). |
| "Synthetic carrier quotes, Carrier A **Lowest**, approve with RM920; simulated booking SIM-7001" (`storyboard.md`) | Synthetic replies can't be approved. Approval needs a verified manual reply. There's no simulated booking in the live flow; record a carrier reference, then per-bay collection. |
| "Hand to Arif", personas J. Lim, Mei, Arif via `?role=` | The owner presses **Start sale**. One Owner presenter; no role switching. |
| "Jarvis = keyword rules / Claude-driven Jarvis needs keys" | Jarvis is a **Pi-based agent**: a Claude API key through the web login, or Pi's Codex-subscription login. It has tool cards, offline navigation and four Lalamove delivery tools. |
| "Only four read-only warehouse tools" (`docs/local-demo.md`) | Five warehouse tools and four delivery tools (the audit §4) |
| Promo numbers (RM1,200 / RM280 / RM920; "+4 = 9 − 3 − 2") | The seed changed (44 SKUs, 374 units; D-1001 to D-1008 at every stage). Re-capture before quoting any number. |

---

## 7 · Suggested new scenes (from verified capabilities)

The evidence levels are as defined in the audit. ★ marks scenes that can be filmed **with no credentials**.

| # | Scene | What happens (real clicks) | Visual idea, in the film's language | Needs | Evidence |
|---|---|---|---|---|---|
| 1 ★ | **"Ask, and the warehouse answers"** | Type "Where can I put my new sofa?" in Jarvis. The map flies to Floor 1 · Zone A; four free bays glow; chip "Showing Floor 1 · Zone A · 4 free bays". | The line *becomes* the camera path. Close the line around the glowing bays (a product close-up beat). | Nothing. Optionally a Jarvis connection, to avoid the orange "not connected" notice in the chat. | Verified here |
| 2 ★ | **Measured, human-checked receiving** | Open DN-2291 → enter the counted line, condition **Good**, measurements (L×W×H, kg; e.g. `6kg` refused, `6` accepted → "12 kg · 0.243 m³") → bays → "counted and checked" → **Post**. Stock rises once. | The press wave from Post; units land in the bay | Nothing | Reported (Mac, `265e810`); tested |
| 3 ★ | **The human gate** | D-1004: Approve is disabled, because its reply is synthetic. Then D-1002: record a verified reply (a labelled test entry) → Send for approval → **Approve** → bays reserved (teal) → Record carrier reference (test) → **Record N collected** → bay freed (green). | Teal → green laps; "Reserved ≠ gone. Collected = gone." | Nothing; test entries labelled on screen | Code; seed tests (D-1002 flow) |
| 4 | **Lalamove sandbox quote** | Delivery → Connect (sandbox, MY) → "Connected · Lalamove sandbox · MY · n vehicle types" → cargo "Measured at receiving" → vehicle **Fits** → **Get sandbox quotes** → total in MYR, breakdown, expiry → change the weight and the quote turns **stale** | The route leaves the door to the destination pin; the quote card closes on the line; footer "Lalamove sandbox · quote only · nothing booked" | Lalamove sandbox key and secret (Malaysia), entered by a person; internet | Tested (mocked) only. **Film only if it succeeds live.** |
| 5 | **Jarvis with tools** | "What should we reorder?" → `analyze_reorder` card → a streamed answer that matches Replenish. Or: "What did Lalamove quote for D-1002?" → `get_delivery_quotes` card → the same total as the screen. Or Jarvis **refusing** to quote a non-fitting vehicle. | Tool cards as precise little UI moments; the camera punches into the matching numbers | Claude API key (web login) or Pi Codex login; for the delivery questions, also Lalamove | Reported live (Cloud, Claude key); not verified here |
| 6 | **Read with Jarvis** | A photo of a synthetic printed delivery note → editable draft lines, with questions for unreadable parts | A paper note slides in; lines draw out of it into the receipt | Claude key (an image-capable model) | Reported live (Cloud) on a synthetic printed note; handwriting not verified |
| 7 ★ | **Replenishment with its arithmetic** | Replenish → a suggestion with its reasoning lines; the "not enough data" lamp; PO-3050 part received | An underline beat (as in the 21 s film) | Nothing | Tested |

---

## 8 · Pacing and duration options (120 BPM: one beat is 0.5 s, 15 frames)

These are suggestions only; you decide.

| Option | Length | Shape | Credentials |
|---|---|---|---|
| **A** | ~30 s (60 beats, 900 frames) | Opening (reuse, ~3.6 s) → **Capture** (scene 2, ~5 s) → **Ask Jarvis** (scene 1, ~5 s) → **Human gate** (scene 3 condensed, ~7 s) → **Freed + reorder** (scenes 3/7, ~4 s) → brand reel-in and end card (~5 s) | None |
| **B** | ~38–40 s (76–80 beats) | A + a **Lalamove sandbox quote** (scene 4, ~6 s) between the gate and collection, + a short **Jarvis tool card** (scene 5, ~3 s) | Lalamove sandbox; a Claude key or Pi login |
| **C** | ~45 s (90 beats) | B + **Read with Jarvis** (scene 6) opening the Capture section, and longer holds for reading UI (~0.3 s per word) | B + a Claude key |

Notes for any option:
* Vary shot lengths by 4× or more.
* Keep at least one near-still rest.
* Carry something across every boundary.
* Hold each press result.
* Footers stay truthful throughout: "Real WareOrb UI · synthetic demo data", plus "Lalamove sandbox · quote only" and "test entry" where they apply.

---

## 9 · Required new UI captures (from `4c2cc97`, local demo)

**Capture method, as in the 21 s film:**
* consecutive 2× captures of the running app around each real click (DPR 2), plus full-frame references;
* ledger snapshots per state, for the twin;
* a driver in a new folder (e.g. `promo/source/capture-ext/`), using `smoke-screens.mjs` (evidence script) as a starting point;
* check whether `window.__ware` is exposed in demo mode. The old driver relied on it for snapshots; it's only set in hot-reload dev mode, so a different snapshot method may be needed.
* Never navigate with store writes on camera; use visible clicks.

**Captures:**
1. Jarvis offline navigation (scene 1): before and after, the chip, highlighted bays.
2. Receipt DN-2291 (or a new receipt): lines, measurements (including a refused `6kg`), condition Good, bays, checked, Post → posted state and history.
3. Ageing B-2140-A → **Start sale** → the new deal.
4. D-1004 with Approve disabled (synthetic reply) and its explanation.
5. D-1002: the verified-reply form (test entry) → Send for approval → Approve → reserved → carrier reference → Collection → collected; the bay freed on the map.
6. Replenish plan rows with their reasoning lines.
7. *(with credentials)* the Lalamove card connected; shipment and cargo sources; vehicle fit; sandbox quote result; stale quote.
8. *(with credentials)* Jarvis tool cards: `analyze_reorder`, `get_delivery_quotes`, a refusal.
9. *(with credentials)* Read with Jarvis on a synthetic printed note.

---

## 10 · Known bugs, environment limitations and blockers

* **Credentials.** Lalamove and live Jarvis need credentials that only the user or team can enter: a Lalamove sandbox key and secret for Malaysia; a Claude API key, or Pi's Codex-subscription login (`pi` → `/login`). None is configured on this Mac. **Ask the user** whether they'll provide them, and when. Never ask for keys in chat; they're typed into the page by a person.
* **No live evidence yet.** Live Lalamove and live Codex-subscription Jarvis have **never been verified anywhere** (audit §3–4). Handwriting reading and the microphone aren't verified.
* **Ports.** 3210 is taken by another checkout's backend; use `WAREORB_DEMO_PORT` and `WAREORB_CONVEX_PORT`. Port conflicts make the CLI fail with only "Could not create the local Convex deployment"; run the CLI step by hand to see the cause.
* **Environment.** `ANTHROPIC_BASE_URL` is set in this agent's shell; unset it (`env -u`) when running the demo or tests.
* **Harness build.** Building the 21 s harness against `backend-production` is untested (`src/store.ts` and `src/scene/bays.tsx` changed).
* **Seed freshness.** Seeded quotes expire after about 4 days; reset the demo before filming. A reset deletes rehearsal records.
* **Disconnected notice.** Without a Jarvis connection, free-text questions add an orange "Jarvis isn't connected" notice under the navigation answer.
* **Doc inconsistencies** (tool counts; the "booking is simulated" comment) are listed in the audit §9.

---

## 11 · Quality requirements (non-negotiable)

* **Truth first:**
  * only real app behaviour;
  * synthetic data, test entries, sandbox quotes and fixtures always labelled;
  * no invented features, metrics or results;
  * nothing keyed shown as working unless it worked on camera.
* **No AI or synthetic voice** anywhere.
* **Deterministic, code-driven rendering:** `renderFrame(n)` pure; prove it with `compare_runs.py` in two render orders.
* **Review gate** before any final long render: six or so keyframes, a contact sheet and a draft MP4, then the user's approval.
* **The visual QA loop on the encoded file:**
  1. Extract frames every 0.5 s and at every transition.
  2. Make contact sheets and look at them.
  3. Fix, re-render, re-verify.
  * Also run `qa_frames`, `qa_av` (A/V sync of every click) and `qa_encode`, and check loudness (−16 LUFS, ≤ −2 dBTP).
  * Never call it done because it rendered.
* **Lessons already learned:** `HANDOFF-promo.md` §5 (bundling duplicates, frame purity, shutter registration, integer-frame type, the press wave instead of dissolves, holds, banding grain, explicit BT.709, QA on the encode).

---

## 12 · Next steps for the new agent, in order

1. Read `NEXT-AGENT.md`, this file, `VIDEO-CAPABILITY-AUDIT.md`, `storyboard.md` and `HANDOFF-promo.md` §3 and §5.
2. Fetch both branches. If `backend-production` has moved past `4c2cc97`, re-check the audit's facts at the new head and tell the user.
3. **Ask the user, in one round:**
   * whether they will provide Lalamove sandbox keys or a Jarvis connection (and who enters them);
   * the duration preference, if any;
   * whether the 21 s film should stay a separate cut (recommended).
4. Run the local demo (§4.3) and rehearse the scenes you want, with real clicks only.
5. Write the storyboard and beat sheet for the extended film. Get the user's approval of the concept, with keyframes, before building.
6. Capture the new UI states (§9). Build a new harness entry (`src4`) that reuses the opening, line, camera and end-card machinery.
7. Re-author the score timeline (`CH`, cue windows) for the new length.
8. Pass the review gate: keyframes, contact sheet, draft MP4.
9. Then the final render, the encode and full QA on the encoded file.
10. Update the docs with hashes, commit, and push (without force, and no large binaries without asking).
