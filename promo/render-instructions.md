# WareOrb promo: render instructions

*Status: final. v3b approved and delivered 24 Oct 2026; hashes and QA results are in the last section.*

Everything is code. Every frame is `renderFrame(n)`, a pure function of the frame number, and the score is generated from the film's own cues. A re-render on the same toolchain reproduces the film. GPU rendering differs from SwiftShader only in sub-LSB antialiasing.

## Toolchain used (Mac)

| | Version |
|---|---|
| Machine | Apple M1 Pro, macOS 15.7.3 |
| Bun | 1.4.3 (builds the harness against the app's own modules) |
| Node | 26.12.1 · Playwright 1.56.1 |
| Browser | Google Chrome 155.0.8059.85 via `CHROME_PATH` (headless, ANGLE/Metal GPU). Playwright's bundled Chromium also works. |
| App modules | Vince @ `781687f`, `bun install --frozen-lockfile`: three 0.180.0, @react-three/fiber 9.8.2, react 19.3.1 |
| Python | 3.12.15 venv at `promo/source/.venv`: numpy 2.5.4, scipy 1.18.1, pillow 13.0.0, opencv-python-headless |
| FFmpeg | 9.0.2 (Homebrew) |

## One-time setup

```bash
cd ~/Documents/codes/Bababoi/out/wareorb-promo
(cd vince && bun install --frozen-lockfile)
(cd promo/source && npm ci && npx playwright install chromium)
uv venv --python 3.12 promo/source/.venv
uv pip install --python promo/source/.venv/bin/python pillow numpy scipy matplotlib opencv-python-headless
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # optional
```

## Build

```bash
cd promo/source/harness
OUTDIR=dist3b ENTRY=v3 bun run build.ts
```

* The build fails loudly if a second React or three.js would be bundled.
* On a fresh checkout it creates `node_modules → vince/node_modules` and rebuilds itself in a fresh process.

## Render (pictures)

```bash
cd promo/source/render
# keyframes / spot checks (one browser)
node render-frames.mjs --dist ../harness/dist3b --out /tmp/check --frames 86,181,312,401,475,615 --dpr 2 --shutter 180 --gap 4 --max-samples 48
# the whole film (three browsers in parallel, then the shutter merge)
node render-film.mjs --dist ../harness/dist3b --out ../../frames --frames 0-629 --dpr 2 --shutter 180 --gap 4 --max-samples 48 --workers 3
```

* **`--dpr 2`** renders the WebGL and line canvases at 2× and downsamples to 1920×1080 (supersampling).
* **`--shutter 180`** is real motion blur. A frame whose content travels on screen during the half-frame shutter (`window.motionAt`) is rendered as 2–48 sub-frames, which `shutter.py` averages in linear light. Holds are a single capture.
* **Time:** about 18–21 min on the M1 Pro at dpr 2 with 3 workers (about 7,100 captures).

## Score (music + SFX, no voice)

```bash
cd promo/source/render
node export-sound.mjs ../harness/dist3b ../audio-src/sound-data.json          # the film's cues and curves
cd ../..
source/.venv/bin/python source/audio-src/score.py source/audio-src/sound-data.json audio/
sh source/audio-src/master.sh audio/WareOrb-promo-score.wav audio/WareOrb-promo-score-master.wav   # -16 LUFS, <= -2 dBTP
source/.venv/bin/python source/audio-src/balance.py source/audio-src/sound-data.json audio/   # SFX vs music per cue
```

## Encode + QA

```bash
sh source/render/encode.sh frames WareOrb-promo-1080p.mp4 16 audio/WareOrb-promo-score-master.wav
source/.venv/bin/python source/render/qa_frames.py WareOrb-promo-1080p.mp4 qa/final/qa-mp4 --expect 630 --holds 0-3,33-45,580-629
source/.venv/bin/python source/render/qa_av.py WareOrb-promo-1080p.mp4 audio/sound-data.json qa/final/qa-av.md
source/.venv/bin/python source/render/qa_encode.py WareOrb-promo-1080p.mp4 frames qa/final/qa-encode.md
source/.venv/bin/python source/render/extract_frames.py WareOrb-promo-1080p.mp4 qa/final/mp4-frames "0-629:15"   # then sheet.py, and look at the sheets
```

What the encode sets:
* H.264 High, yuv420p, BT.709 matrix and tags (set explicitly; PNG→YUV would otherwise use BT.601);
* AAC-LC 320 kb/s, 48 kHz stereo;
* `+faststart`.

## Final render (24 Oct 2026, after approval of v3b draft 3)

**Exactly what produced the delivery**, from `promo/` on the toolchain above:

```bash
(cd source/harness && OUTDIR=dist3b ENTRY=v3 bun run build.ts)                 # bundle sha256 85dce784…
(cd source/render && node render-film.mjs --dist ../harness/dist3b --out ../../drafts/v3b-final/frames \
   --frames 0-629 --dpr 2 --shutter 180 --gap 4 --max-samples 48 --workers 3)  # 18 min, 7,092 captures
cp -c drafts/v3b-final/frames/frame-*.png frames/                              # APFS clones
(cd source/render && node export-sound.mjs ../harness/dist3b ../../audio/sound-data.json)
source/.venv/bin/python source/audio-src/score.py audio/sound-data.json audio
sh source/audio-src/master.sh audio/WareOrb-promo-score.wav audio/WareOrb-promo-score-master.wav
sh source/render/encode.sh frames WareOrb-promo-1080p.mp4 16 audio/WareOrb-promo-score-master.wav
```

**Two harness fixes made after approval**, found by the full QA of the first final encode. Neither changes the cut, timing or look. `render-frames.mjs` writes each frame's sample count to its log, and the approved draft 3 is kept in `drafts/v3b-draft3/`.

1. **Shutter sampling of the opening morph.** `motionAt` measured the camera, the pen tip and the units, but not the outline's own deformation. At f50–54 the sides of the morphing silhouette stepped into 3–5 visible copies; they now smear continuously. Only f46–58 and f564–566 get more samples.
2. **A frame-pure app clock.** The app's pending-delivery mark pulses with R3F's `clock.elapsedTime`, which the harness had advanced per call. That made f59–203 depend on how many sub-frames a worker had rendered before them (≈0.01 % of pixels). The clock is now `600 s + frame/30`, so `renderFrame(n)` is a pure function of *n*. The same frames rendered in ascending and descending order are byte-identical.

**Against the approved draft 3:**

| Frames | vs draft 3 | Why |
|---|---|---|
| f0–45, f204–563, f567–629 (469 frames) | **byte-identical** | unchanged |
| f46–58, f564–566 | differ (0.3–1.6 % of pixels) | morph now fully sampled (fix 1) |
| f59–203 | differ by ≈0.01–0.02 % of pixels | the pending mark's pulse, now from the frame clock (fix 2) |

The score data under the final bundle is byte-identical to the reviewed one, and so are the stems and the master.

### Delivered files (SHA-256)

| File | SHA-256 | Notes |
|---|---|---|
| `WareOrb-promo-1080p.mp4` | `86640bae8fc1a3634ddecb1d385c7b22a619ae977ad2e42511541f4321ea461b` | 22.4 MB; H.264 High, yuv420p, BT.709; AAC-LC 48 kHz stereo |
| `audio/WareOrb-promo-score-master.wav` | `5cbb92beb640ca997b2c6f80727ac1a6fa51df1f3ad58a78e417ca820f2971dd` | 48 kHz / 24-bit stereo, −16.2 LUFS, −2.8 dBTP |
| `audio/WareOrb-promo-score.wav` | `884d1d0c55d292c99cb482707e99c500d51f4df6f89b5f77c8c7a084c6c6308d` | pre-master mix (float32) |
| `audio/music.wav` · `audio/sfx.wav` | `e66ebcb3…` · `46229895…` | stems |
| `audio/sound-data.json` | `a56b6e51cd2e0e03c9bdc6cfadba8dc1d64dc86301c2c137d8ab04f9e5c35b92` | the cues and curves the score was built from |
| `frames/frame-0000…0629.png` | listed in `frames/FRAMES.sha256` (that file's own hash: `5549aacb…`) | 630 PNG, 1.0 GB |
| `source/harness/dist3b/main3.js` | `85dce7844c181805f57090c935711dd46991a9ef24020028eec0c07cbcac925c` | the render bundle; source hashes in `frames/SOURCE.sha256` |

### QA of the delivered MP4 (`qa/final/`)

| Check | Result |
|---|---|
| Streams (`ffprobe`) | 1920×1080 · 30/1 fps · **630 frames · 21.000 s** · yuv420p · BT.709 · AAC-LC 48 kHz stereo |
| Per-frame, all 630 frames, MP4 and PNG (`qa-mp4.md`, `qa-png.md`) | **0 issues**:<br>• no black or flat frames;<br>• frozen runs only in the declared holds;<br>• no luma pops;<br>• no frame over 2 % blown pixels.<br>Edge contact is the 3D world only. |
| Encode fidelity (`qa-encode.md`) | Every sampled decoded frame matches its own source frame (27/27, no off-by-one). Mean signed colour difference +0.18 / −0.34 / −0.27 code values (no matrix shift). |
| Loudness (`qa-av.md`) | −16.2 LUFS integrated · true peak −2.8 dBTP · LRA 2.8 LU (no clipping) |
| A/V sync (`qa-av.md`) | Press clicks +0.6 to +1.0 ms from frames 180 / 300 / 390 / 465 |
| Visual inspection | Frames every 0.5 s, plus every press, card reveal, punch-in, the morph and the reel-in, decoded from the MP4: `sheet-*.png` |

The QA of the superseded first encode is kept in `qa/final-superseded-draft3-encode/`.
