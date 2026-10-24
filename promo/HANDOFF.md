# WareOrb video production: handoff after the promo delivery (24 Oct 2026)

**The 21-second promo is finished, approved and verified.** What remains is Stage B: the 5–7 minute pitch video, with the promo as its cold open. The next agent's brief is in **`NEXT-AGENT.md`**. `HANDOFF-cowork.md` (`HANDOFF.md` in the local package) is the earlier Cowork → Claude Code handoff; read it for history, but this file is current.

## 1 · Status

| Item | State |
|---|---|
| 21 s promo `WareOrb-promo-1080p.mp4` | **Delivered.** v3b, approved by the user at the six-keyframe gate.<br>H.264 High, 1920×1080, 30 fps, 630 frames, 21.000 s, AAC 48 kHz stereo, 22.4 MB.<br>SHA-256 `86640bae8fc1a3634ddecb1d385c7b22a619ae977ad2e42511541f4321ea461b` |
| Score | **Delivered.** Synthesised in code, no voice. Master `audio/WareOrb-promo-score-master.wav`: 48 kHz / 24-bit, −16.2 LUFS, −2.8 dBTP |
| Final QA | **Passed** (`qa/final/`): per-frame on all 630 frames (MP4 and PNG) with 0 issues; encode fidelity; loudness; A/V sync within 1 ms. Contact sheets inspected by eye. |
| Docs | `storyboard.md` (the delivered cut, frame by frame), `render-instructions.md` (exact commands, toolchain, hashes), `review-v3b.md` (review record), `production-plan.md` (Stage A/B) |
| Pitch narration, problem and solution | **Drafted, waiting for the team's review**: `pitch/problem-solution.md`. Every line carries a truth label, and the script is for human recording. |
| Stage B: demo recording, team narration, technical and impact sections, pitch assembly | **Not started.** It needs the finished app and the team's voice recordings. See `NEXT-AGENT.md`. |

## 2 · Where everything is

There are two copies of the same `promo/` tree:

| | Git branch `promo/wareorb-video` | Producer's Mac (full local package) |
|---|---|---|
| Location | `POTATO0826/Bababoi`, branch `promo/wareorb-video`, folder `promo/` | `~/Documents/codes/Bababoi/out/wareorb-promo/` (gitignored) |
| App code the harness builds against | the branch itself (it is cut from `origin/Vince`; the app is at the repo root) | `out/wareorb-promo/vince/` (`git archive` of Vince @ `781687f`) |
| Contents | Source; docs; the final MP4 and audio master; review keyframes and sheets; QA reports; the briefs | All of that, plus:<br>• the 630 final frames (`promo/frames/`, 1.0 GB);<br>• the drafts (`promo/drafts/`, 3.4 GB);<br>• every iteration render and QA run (`promo/qa/`);<br>• the v1, v2 and v3 previews;<br>• the full Cowork transcript (`context/`) |

`Vince` @ `8f4d6df` only adds a LICENSE file to `781687f`, so the app code is identical.

Key paths inside `promo/`:

| Path | What |
|---|---|
| `WareOrb-promo-1080p.mp4` | the delivered film |
| `audio/` | `WareOrb-promo-score-master.wav` (in the branch; stems and the pre-master mix are local and regenerable byte-for-byte with `score.py`), `sound-data.json` (cues the score was built from) |
| `storyboard.md` · `storyboard-v1.md` | the delivered 21 s cut · the original 10 s storyboard |
| `review-v3b.md` · `render-instructions.md` · `production-plan.md` | review record · how it was rendered and verified · Stage A/B plan |
| `creative-direction-v2.md` | why "One line" (15-reference evaluation, v1 critique) |
| `pitch/problem-solution.md` | pitch problem/solution storyboard + narration draft, with truth labels |
| `previews-v3b/` | the approved review keyframes, contact sheet, every press transition, v3-vs-v3b comparison |
| `qa/final/` | QA of the delivered MP4 (`qa-mp4.md`, `qa-png.md`, `qa-encode.md`, `qa-av.md`, JSON) |
| `source/harness/src3/` | **the renderer**: `story3.ts` (timeline, cards, presses, camera, cues), `overlay3.ts` (2D layers), `main3.tsx` (R3F scene, post, frame stepping, `motionAt`, `soundData`), `line.ts`, `plane.ts` |
| `source/harness/src3-handoff/` | frozen v3 as handed over from Cowork |
| `source/harness/public/` | real UI crops (`ui3/`, `ui2/`), ledger snapshots, Geist fonts |
| `source/capture/` + `source/captured/` | Playwright drivers of the **real app**, and the 2× captures + ledger snapshots they produced |
| `source/render/` | pipeline:<br>• rendering: `render-frames.mjs`, `render-film.mjs`, `shutter.py`, `encode.sh`;<br>• QA: `qa_frames.py`, `qa_av.py`, `qa_encode.py`, `compare_runs.py`, `extract_frames.py`;<br>• review sheets: `sheet.py`, `contact_sheet_v3b.py`;<br>• sound data: `export-sound.mjs`;<br>• debugging: `debug/` |
| `source/audio-src/` | `score.py` (music + SFX synthesis), `master.sh` (EBU R128), `balance.py` |
| `briefs/` (branch) · `context/attachments/` (local) | the user's original brief, the creative reassessment, the capacity-reallocation spec |

## 3 · Rules that still apply

* **Truthfulness first.**
  * Only real captures of the running app, the app's own 3D twin and its seeded demo data.
  * Synthetic carrier quotes and the simulated booking stay labelled.
  * No invented features, metrics, results or evaluation findings.
* **Human narration only.** The team records the voice; Claude may write the English script. No AI or synthetic voice.
* **No external-API dependence.** Anthropic, Lalamove, Fish and Codex features need keys or aren't built, so they are not shown as working. The `backend` branch is still in development.
* **Product source stays untouched.** Video work lives in `promo/` (branch) or `out/` (local).
* **Everything code-driven and deterministic.**
  * `renderFrame(n)` is a pure function of *n*. Verify with `compare_runs.py`: renders in different orders must be byte-identical.
  * No AI video. No watermarks.
* **The visual QA loop is mandatory** (the user's standing requirement):
  1. Render.
  2. Extract frames every 0.5 s plus every transition window, from the **encoded file**.
  3. Make contact sheets and look at them.
  4. Fix, re-render, re-verify.
  5. Keep every earlier version in its own folder.

  Never call a video done because it rendered.
* **Review gate.** Show keyframes, a contact sheet and a draft before any final long render, and wait for approval.

## 4 · Rebuild or re-render the promo

On the branch:

```bash
git clone -b promo/wareorb-video https://github.com/POTATO0826/Bababoi.git && cd Bababoi
bun install --frozen-lockfile                               # the app's modules (the harness imports the real 3D scene)
cd promo/source && npm ci                                   # Playwright for the renderer
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python pillow numpy scipy matplotlib opencv-python-headless
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # GPU path; Playwright's Chromium download stalled on this Mac
cd harness && OUTDIR=dist3b ENTRY=v3 bun run build.ts      # finds the app at the repo root automatically
cd ../render && node render-film.mjs --dist ../harness/dist3b --out ../../frames --frames 0-629 --dpr 2 --shutter 180 --gap 4 --max-samples 48 --workers 3
```

Then follow `render-instructions.md` for:
1. the score: `export-sound.mjs` → `score.py` → `master.sh`;
2. the encode: `encode.sh`;
3. the QA: `qa_frames.py`, `qa_av.py`, `qa_encode.py`, then sheets.

Notes:
* Render time on the M1 Pro: about 18–21 min at dpr 2 with 3 workers.
* In the local package, run the same commands from `out/wareorb-promo/promo/`, with the app at `out/wareorb-promo/vince/`.
* In the branch layout the bundle's path comments differ from the delivered bundle, so its hash differs; the code is the same. To prove a rebuild matches, render a few frames and `cmp` them against the delivered frames on the Mac.

## 5 · Lessons from this production (don't relearn them)

1. **Bundling.** A fresh checkout could bundle a second React or three.js from an ancestor `node_modules`. `build.ts` now rebuilds in a fresh process and refuses duplicates.
2. **Frame purity.**
   * The app's R3F clock drives an animation (the dock's pending-delivery pulse), so the harness sets the clock to `600 s + n/30`.
   * Any new time-based effect must derive from the frame number, never from the call count or wall clock.
   * Prove it by rendering frames in ascending and descending order: the results must be byte-identical.
3. **Motion blur.**
   * The shutter samples each frame from `window.motionAt`: camera, pen tip, dispatch units, morph outline.
   * Anything new that moves on screen must be added there, or its fast frames step into copies (found at the opening morph).
4. **Screen-fixed type** renders at the integer frame. Otherwise the shutter averages a text change into a double exposure (found on the disclosure footer).
5. **Layout changes.** A cross-dissolve between two different UI layouts reads as a muddy double exposure. State changes use the **press wave**: the next real capture is revealed from the pressed control.
6. **Holds.** Every press needs a short result hold before the camera moves on.
7. **Banding.** Dark gradients band after encoding, so a fixed sub-visible grain sits over the frame, and the caption scrim only appears with captions.
8. **Colour.** `encode.sh` sets the BT.709 matrix explicitly; ffmpeg would otherwise convert PNG with BT.601.
9. **QA the encoded file, not the PNGs.** The final QA of the first encode caught two defects the draft review had missed.

## 6 · Open items that need the user

* **The team's review** of `pitch/problem-solution.md`, then their recording of it.
* **Cleanup**, only with the user's OK:
  * the transfer leftovers `out/wareorb-promo.tgz` and `out/wareorb-promo-transfer/` (about 195 MB);
  * `promo/drafts/` (3.4 GB, superseded drafts);
  * the iteration folders in `promo/qa/`.
* **Promo choices** the user approved as delivered: 21.0 s rather than 21.5 s, the "WareOrb — by Team Bababoi" credit under the wordmark, and the real capture timestamp. Change them only if the user asks.
* **`lemo-opuscar`.** The skill is installed, but its external style library (github.com/lemomo-ai/lemo-opuscar) was never fetched. It's not needed for the approved direction.
