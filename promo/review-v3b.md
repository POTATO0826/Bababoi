# WareOrb promo v3b: review gate

*24 Oct 2026, Claude Code on the Mac, continuing the Cowork production.*

**Status.** The creative direction is unchanged ("One line", 21.0 s, 630 frames). This round fixes the v3 visual issues, adds real motion blur, rebalances the timing and adds a provisional code-generated score.

**Approved on 24 Oct 2026 and delivered:** `WareOrb-promo-1080p.mp4`, `frames/`, `audio/` and `render-instructions.md` (hashes, final QA).

The full QA of the final file found two harness defects:
* stepped motion blur on the opening morph;
* a frame pulse driven by the render history instead of the frame number.

Both are fixed, and the delivered film differs from the approved draft 3 only in those frames (see `render-instructions.md`). The review record below is kept as it was at the gate.

| What to look at | Where |
|---|---|
| Six keyframes + contact sheet (dpr 2, 180° shutter) | `previews-v3b/keyframe-01..06.png`, `previews-v3b/contact-sheet.png` |
| Every real button press, frame by frame | `previews-v3b/transitions-sheet.png` |
| v3 as handed over vs v3b, same moments | `previews-v3b/compare-v3-v3b.png` |
| Draft MP4 at final quality (dpr 2, shutter), with the provisional score | `drafts/v3b-draft3/WareOrb-promo-v3b-draft3.mp4` |
| Per-frame QA, A/V sync, contact sheets of the MP4 | `qa/v3b-draft3/` |
| Problem/solution storyboard + narration for the team to record | `pitch/problem-solution.md` |

Earlier work is untouched:
* `previews/`, `previews-v2/` and `previews-v3/` are unchanged;
* the handed-over v3 source is frozen in `source/harness/src3-handoff/`;
* the first plan is kept as `production-plan-v1.md`.

**Verified on draft 3** (the encoded MP4 itself, not just the frames):

| Check | Result |
|---|---|
| Video stream | H.264 High · 1920×1080 · yuv420p with BT.709 tags · 30 fps · **630 frames · 21.000 s** |
| Audio stream | AAC-LC · 48 kHz · stereo |
| Per-frame QA, all 630 frames, both MP4 and PNG (`qa_frames.py`) | **0 issues**:<br>• no black or flat frames;<br>• no frozen runs outside the declared holds (opening f0–3, mark rest f33–45, end card);<br>• no flicker pops.<br>Edge contact is 3D warehouse content only. |
| Loudness | −16.2 LUFS integrated · true peak −2.8 dBTP · LRA 2.8 LU |
| A/V sync at the four presses (`qa_av.py`) | Click onsets +0.6 to +1.0 ms from the press frames (one frame = 33 ms) |
| Determinism | Draft 2 vs draft 3, built from bundles differing only in type code:<br>• 492 frames byte-identical;<br>• 124 differ only in the caption/footer zones;<br>• 14 differ only in the hook word ("WareOrb" at f7–21, also screen-fixed type). |
| Visual inspection | MP4 frames every 0.5 s (`qa/v3b-draft3/sheet-a/b/c.png`), every press window and all six keyframes, inspected by eye |

---

## 1 · The v3 issues from the handoff, and what was done

| # | Handoff issue | v3b |
|---|---|---|
| 1 | Orphaned button loop after a card shrinks (Approve, Hand to Arif) | **Fixed.** The selection loop and its approach stroke fade out with the control they selected (press +1…+6). The pen's rest point glides to the card outline's bottom-left corner and stays clamped to the card's live bottom edge. The line leaves from there, never from empty space where a button used to be. |
| 2 | Receipt dissolve ghosting ("Save lines / Post to stock" over the history rows) | **Fixed, for every press.** The cross-dissolve between two different layouts is replaced by a **press wave**: the next real capture is revealed inside a circle that leaves the pressed button. The press ripple's outer ring is the wave's edge, and the outgoing state recedes as the wave crosses it. No frame shows two layouts stacked (`transitions-sheet.png`). The checkbox spreads its change softly instead. |
| 3 | Keyframes 01 and 04 stale | **Re-rendered,** taken straight from the draft's own frames. The set is now f86 / 181 / **312** / 401 / **475** / 615.<br>• 03 moved from f301 to f312: it shows the *result* of Hand to Arif ("Finding buyer"), not a second button press.<br>• 05 moved from f482 to f475: "2 collected" is crisp while the units lift off; at f482 the camera is already following them, so the card smears. |
| 4 | Quotes card text small at zoom 22 | Zoom raised to 24–25 while the comparison is on screen (about 14 % larger type). |
| 5 | Ghost twin muddy in places | Reviewed and left at the established ~30 % ghost. The shots that read muddiest are mid-whip frames, which are now motion-blurred. |
| 6 | Beat snapping | The four presses stay on beats 12 / 20 / 26 / 31, and the fill lands on beat 38. The score places every effect at the film's exact event time (exported from the renderer), so sync doesn't depend on snapping. |
| 7 | No motion blur | **Done.** A real 180° shutter: each moving frame is the linear-light average of 2–48 sub-frame renders, sized so copies are ≤ 4 px apart. Holds stay single-sample and crisp; captions (screen-fixed) stay sharp. |
| 8 | Journey hold: lines leaving the frame | Checked: no lit journey line leaves the frame. The replenishment card, which the pull-back used to swing into the top edge, now leaves first. |
| 9 | End card shows "WareOrb" twice (wordmark + "WareOrb — by Team Bababoi") | Kept, as you worded the credit. **Please confirm.** |
| 10 | Collection card shows the real capture timestamp "Oct 23, 2026, 4:32 PM" | Kept (genuine). **Please confirm.** |
| 11 | Mac GPU vs cloud SwiftShader look | Checked: same look. Mean pixel difference 0.2–0.3/255 at f401 and f615; the differences are font antialiasing and gradient dither. |

## 2 · Other defects found in this round's visual QA, and fixed

* **Pressed results never held.** After Post to stock, Hand to Arif and Confirm, the camera whipped away before the new real state had settled. Each press now gets a short **result beat** (the camera holds about 0.3 s on the outcome), then chases the line with a motion-blurred whip. Approve already had one.
* **Cut-off cards.** The quotes card was cut by the left edge during the Approve press-in, and the replenishment card by the top edge during the pull-back. Both now leave before the camera swings them out of frame.
* **Floating pen glow.** The pen's glow was left alone near the top of the frame after the replenishment card faded. It now fades with the card and comes back gently when the pen sets off home.
* **Under-timed reading.**
  * The arithmetic card was readable for about 0.4 s; it now gets about 0.7 s.
  * The end card's tagline and credit held about 1.0 s and 0.8 s; they now get about 1.4 s and 1.3 s, against /brag's ≈ 0.3 s-per-word rule.
  * The journey map now lights up during the pull-back and reels straight into the mark.
* **Banding.**
  * The dark background gradient banded after 8-bit / yuv420p encoding.
  * The caption scrim stayed on the end card, darkening its lower-left in visible rings.
  * Fixes: a fixed, sub-visible grain (±1–2 code values) and a scrim that follows the captions.
* **A text change averaged into a double exposure.** On the first draft-2 keyframe, the disclosure footer swapped its wording on a moving frame, and the shutter averaged both texts (keyframe 03). Two fixes:
  * screen-fixed type now renders at the frame's own time (it never moves with the camera, so it needs no blur);
  * the footer dips out and back in around each wording change.
* **Glow sizes differed between draft and final quality.** Canvas glows are in device pixels; they are now DPR-consistent.
* **Build reproducibility.** On a fresh checkout the bundler could pick up a second React / three.js from the repo's own `node_modules` and the page failed to boot. `build.ts` now builds in a fresh process and refuses any duplicate.

## 3 · How the installed skills were used

* **onetake.** Methods applied to this harness rather than its templates:
  * the shutter (sub-frame averaging in linear light, sample count from on-screen travel);
  * dither against banding;
  * rest/carry review of the cut: every press now has a rest, and every boundary is carried by the line;
  * the sound approach: one palette in one room, fewer events than beats, music ducked under the effects, no stock "vibraphone + crotale" ending, and effects measured against the music in their event windows.
* **brag** (on Opus 5.5 it hands off to brag-slim):
  * "a plain crossfade between two busy layouts makes a muddy double exposure" led to the press wave;
  * reading time ≈ 0.3 s per word for captions and the end card;
  * keep the hook, show the real product.
* **lemo-opuscar.** Its SKILL.md is readable, but it is only a loader for an external style library (github.com/lemomo-ai/lemo-opuscar), which is not on this Mac. I haven't downloaded it. Its purpose is choosing a named film style and writing a new treatment, which would replace the approved direction rather than refine it. I can fetch it if you want its guidance on the audio or delivery steps.

## 4 · Provisional score (no voice)

* Synthesised in `source/audio-src/score.py`; no samples, no AI audio.
* 120 BPM in D major.
* **Bed:** a soft pad; the groove (kick, bass, a marimba-like ostinato) enters with "Capture stock.", takes one beat of air after Approve, and resolves on the mark fill.
* **Effects**, timed from the renderer's own cues:
  * press clicks (mouse-down / up 66 ms apart) and a bloom with each wave;
  * closure plucks and violet "lock" notes;
  * the pin, a rail whoosh panned with the units, the freed arpeggio, the reel-in riser;
  * a pen-on-paper rasp that follows tip speed, and camera "air" that follows whip speed.
* **Master:** −16 LUFS integrated, true peak ≤ −2 dBTP, 48 kHz / 24-bit stereo. That leaves headroom for ducking under the team's narration in the pitch.
* This is a first pass to judge rhythm and sync. Tell me if you want a different musical feel.

## 5 · Decisions for you

1. **Approve v3b for the final render?** Draft 3 is already at final quality (dpr 2, shutter). If you approve it as is, its frames become `frames/`, and I mux the final audio, run the full QA again and complete `render-instructions.md`.
2. **Length.** I kept 21.0 s. "Make better decisions" is the tightest beat (about 1.6 s). Option: **21.5 s** (645 frames, still inside /brag's 18–22 s) would give it and the end card more air.
3. **Credit wording** "WareOrb — by Team Bababoi" appears under the wordmark, so the name shows twice. Keep it, or show "by Team Bababoi" only?
4. **Timestamp.** The collection card shows the genuine capture time "Oct 23, 2026, 4:32 PM". Keep it?
5. **Score direction.** Keep this restrained electronic bed, or go warmer or more energetic?
