# WareOrb promo video (Team Bababoi)

**The film: [`WareOrb-promo-1080p.mp4`](WareOrb-promo-1080p.mp4)**: 21.0 s · 1920×1080 · 30 fps · H.264 + AAC 48 kHz stereo.

It is a code-generated launch film built from the real WareOrb frontend on this branch: real UI captures, the app's own 3D warehouse twin, and a score synthesised in code. It is the cold open of the 5–7 min pitch video.

| Start here | |
|---|---|
| [`HANDOFF.md`](HANDOFF.md) | Current state, where everything is, rules, how to rebuild, lessons learned |
| [`NEXT-AGENT.md`](NEXT-AGENT.md) | What the next agent should do (Stage B: the pitch video), with a ready-to-paste brief |
| [`storyboard.md`](storyboard.md) | The delivered cut, frame by frame |
| [`render-instructions.md`](render-instructions.md) | Exact commands, toolchain, file hashes, final QA |
| [`previews-v3b/contact-sheet.png`](previews-v3b/contact-sheet.png) | The six review keyframes |
| [`pitch/problem-solution.md`](pitch/problem-solution.md) | Pitch problem/solution storyboard and narration draft (for the team to record) |

Everything shown in the film is labelled honestly:
* the UI is real, from the running app with seeded demo data;
* the carrier quotes are **synthetic**;
* the booking is **simulated**;
* keyed or unbuilt features are not shown.

The narration for the pitch is recorded by the team; no AI voice is used anywhere.

Quick rebuild (details in `HANDOFF.md` §4):

```bash
bun install --frozen-lockfile                          # at the repo root: the app's modules
cd promo/source && npm ci && cd harness && OUTDIR=dist3b ENTRY=v3 bun run build.ts
```
