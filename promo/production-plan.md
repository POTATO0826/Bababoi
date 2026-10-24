# WareOrb: video production plan (Stage A / Stage B)

*Revised 24 Oct 2026. Supersedes the first plan, which is kept unchanged in `production-plan-v1.md`. That version proposed synthetic narration, API-key chapters and recording the demo now; all three are withdrawn.*

**Two deliverables, one asset set:**

| | Promo (/brag) | Pitch video |
|---|---|---|
| Purpose | A memorable 21-second film; the pitch's cold open | Explain the problem and product; show genuine behaviour |
| Length | 21.0 s · 630 frames @ 30 fps (18–22 s window) | 5–7 min (provisional skeleton about 6:10) |
| Voice | **None** (music and SFX only) | **Human narration recorded by the team.** No AI or synthetic voice. |
| Source | `source/harness/src3` renderer (real UI captures + the app's own 3D twin) | Promo, title cards in the same design system, a real-app screen recording, the team's voice |
| External APIs | **None** | **None required.** Keyed features are shown only if keys exist, and only as optional. |

Ground rules:
* Nothing unfinished is presented as working.
* Every number on screen is the app's own seeded demo data.
* No invented metrics, gains or evaluation results.
* Product source is untouched; generated files stay out of the repo unless authorised.

---

## Stage A (now)

| # | Work | State (24 Oct) |
|---|---|---|
| A1 | Fix the v3 visual issues: orphaned button loops, dissolve ghosting, cut-off cards, dangling trails and tips, legibility, end-card timing, banding | Done in v3b (see `review-v3b.md`) |
| A2 | Motion blur: a real 180° shutter, sampled adaptively from on-screen travel | Done (renderer `--shutter`) |
| A3 | **Review gate**: six keyframes plus contact sheet (`previews-v3b/`), every press transition, and a timing draft MP4 | **Approved** (draft 3), 24 Oct |
| A4 | Final render (dpr 2, shutter) into `frames/`; code-synthesised music and SFX from `cues()` (48 kHz stereo, no voice, headroom for later ducking); encode `WareOrb-promo-1080p.mp4` | **Done**, 24 Oct |
| A5 | Full per-frame QA of the final MP4, encode fidelity, audio loudness and peaks, A/V sync at the four presses; contact sheets inspected | **Done.** 0 issues after two harness fixes (`qa/final/`). |
| A6 | `render-instructions.md`: exact commands, versions, hashes | **Done** |
| A7 | Problem/solution storyboard and English narration draft (`pitch/problem-solution.md`) | Drafted; for team review |

## Stage B (later, once the app is ready)

| # | Work | Who |
|---|---|---|
| B1 | Record the prototype demo on the Mac with real clicks and recorded outcomes. Reuse `source/capture/` as the driver; seeded demo data is reset before each take. | Claude drives; team confirms the app build |
| B2 | Record the narration from `pitch/problem-solution.md` (plus the demo and close sections once written). Human voices, 48 kHz WAV, one file per line. | Team |
| B3 | Technical section, provisional: architecture, plus a real / simulated / needs-keys table taken from the code at the recorded commit | Claude drafts; team checks |
| B4 | Impact section, provisional: what will be measured and how (re-entry, missed hand-offs, time to a decision). No results until measured. | Team decides; Claude drafts |
| B5 | Assemble the 5–7 min pitch: the 21 s promo as cold open, then title cards, demo, voice, music ducked under the voice (about −14 LUFS), captions plus SRT | Claude |

**Not in scope until the team says otherwise:**
* the Codex/backend integration (the `backend` branch is still in development);
* live Anthropic, Lalamove or Fish features;
* any Orbyte integration claim (the fit is proposed, not sponsor-approved).
