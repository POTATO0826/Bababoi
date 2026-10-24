# Next agent: what to do (Stage B, the WareOrb pitch video)

## Paste this to start the next agent

> You are continuing the WareOrb hackathon video production (Team Bababoi). The 21-second promo is **finished and
> approved**; do not re-render or change it unless the user asks. Your job is **Stage B: the 5–7 minute pitch video**,
> with the promo as its cold open.
>
> Start by reading, in this order:
> 1. `promo/HANDOFF.md` (current state, rules, lessons);
> 2. this file;
> 3. `promo/storyboard.md`;
> 4. `promo/pitch/problem-solution.md`;
> 5. `promo/production-plan.md`.
>
> The material is on branch `promo/wareorb-video` of `POTATO0826/Bababoi` (folder `promo/`). The full local package is in
> `~/Documents/codes/Bababoi/out/wareorb-promo/` on the producer's Mac.
>
> Rules that override everything:
> * real app behaviour only, with synthetic and simulated parts labelled;
> * **human narration only, recorded by the team** (never AI or synthetic voice);
> * no dependence on Anthropic, Lalamove, Fish, Codex or any external API;
> * don't modify the product source;
> * everything code-driven and deterministic;
> * a review gate with the user before any final long render;
> * the visual QA loop on the **encoded** file before saying anything is done.
>
> Before building anything, confirm the open questions in §1 with the user, then follow §2 step by step.

---

## 1 · Ask the user or team first (blocking)

1. **Which app build to record.** Branch and commit. The promo used `Vince` @ `781687f`; `Vince` is now at `8f4d6df` (license only). `backend` / `backend-production` are in development. Is the app "ready enough" for the demo?
2. **Pitch requirements.** The hackathon's required sections, maximum length, aspect ratio and deadline. The plan assumes about 6:10: cold open, problem, solution, demo, how it's built, impact plan, team.
3. **Narration.** Has the team approved `pitch/problem-solution.md`? Who reads it? Where will the WAVs be delivered (48 kHz / 24-bit, one file per line)?
4. **API keys.** Are any configured on the Convex deployment they want shown? Default: **no**. Keyed features (Read with AI, Lalamove quotes, Fish voice, Claude Jarvis) are then mentioned only as "wired in, needs a key", never shown working.
5. **Cleanup permission** for the large local leftovers listed in `HANDOFF.md` §6.

## 2 · The work, in order

### Step 0: orientation and environment (no rendering yet)

* Read the documents above. Check the skills `onetake` and `brag` (`~/.claude/skills/`).
  * Use onetake's methods: a palette in one room, carries between beats, the shutter, the oracle-style checks.
  * Use brag's rules: reading time about 0.3 s per word; no crossfades between busy layouts.
* Set up the toolchain as in `HANDOFF.md` §4, and run the smoke test: build, then render frames 401 and 615. They must look like `previews-v3b/keyframe-04.png` and `-06.png`.
* **Done when:** the toolchain works and the smoke-test frames match.

### Step 1: plan the pitch (a document; no renders)

* Write `promo/pitch/pitch-plan.md`. For every section give: its time, the visuals and their source, the on-screen text, the narration file it uses, and a truth label on each claim (real / simulated / needs keys / proposed / hypothesis).
* The cold open is `WareOrb-promo-1080p.mp4` (21.0 s) with its own score, ducked as the voice starts.
* Problem and solution: reuse `pitch/problem-solution.md` (storyboard + script) as approved by the team.
* **Done when** the user approves the plan.

### Step 2: record the prototype demo (B1)

Do this only once the user confirms the app build.

* **Recording.**
  * Record on the **Mac with the GPU**, with real clicks driven by Playwright. Frame-stepped capture in the cloud was ≥20× too slow.
  * Reuse and update `source/capture/` (`capture-flow.mjs`, `step.mjs`, `steps/*.mjs`), whose selectors may have changed in the newer app.
  * Run against a **local Convex backend with the app's seeded demo data**, reset before each take: `bunx convex dev` per the app's README; on Linux the self-hosted `convex-local-backend` was used.
* **Chapters,** each with a visible recorded outcome:
  1. receive and post;
  2. ageing flag;
  3. hand to sales;
  4. buyer and quotes (Demo replies, labelled **Synthetic**);
  5. approve (reserve, **simulated booking**);
  6. confirm collection (bay freed);
  7. history;
  8. replenishment (press "Order 4" only if the team wants a purchase-order shown).
* **Also produce:** an event log (time, action, screen position) for automatic zooms and captions, and full-quality frames or a lossless capture.
* **Never fake an outcome.** If a step fails in the app, report it; don't patch around it on screen.
* **Done when:** each chapter is recorded with its outcome visible, and you have looked at a contact sheet of every chapter.

### Step 3: write the remaining narration (for human recording)

* Sections still to write:
  * the demo voice-over;
  * "how it's built", with a real / simulated / needs-keys table taken from the code at the recorded commit;
  * the impact plan (what will be measured and how; **no results, no invented metrics**);
  * the team and close (Alfred Lee Khai Zher, team leader; Deng Zhenqun; Loo Yi Sheng; credit "Team Bababoi").
* Follow the format of `pitch/problem-solution.md`: per-line timings at 140–150 wpm, a clean script, pronunciation notes, recording notes.
* **Done when** the team has the full script to record.

### Step 4: assemble the pitch (B5), code-driven

* **Parts:** cold open, then title cards in the promo's design system (Geist, `#09090b`, the state colours), then the demo with automatic zoom-to-click from the event log, then the team's narration.
* **Text:** captions plus an SRT file.
* **Mix:** music ducked under the voice; the whole pitch at about −14 LUFS with true peak ≤ −1 dBTP. Check that the voice clearly leads.
* **Review gate first:** keyframes, a contact sheet and a draft MP4. Then the final.
* **QA:** run `qa_frames.py`, `qa_av.py` and `qa_encode.py` on the encoded pitch. Look at sheets every 0.5 s and at every transition. Write `render-instructions`-style notes with hashes.
* **Done when** the user approves the final file after you have verified it.

## 3 · Don't

* Don't re-render or "improve" the delivered promo unless asked; its hash is recorded.
* Don't use AI or synthetic voices, even as placeholders in a delivered file. A silent or caption-only draft is fine for timing.
* Don't show keyed or unbuilt features as working.
* Don't state benefits, savings or adoption as results.
* Don't commit `frames/`, `drafts/`, `.venv`, `node_modules` or the Cowork transcript. Ask before pushing large binaries.
* Don't delete anything in `out/` without the user's OK.

## 4 · Useful facts

* **App seeded personas:** J. Lim (Warehouse), Mei (Owner), Arif (Sales).
* **The demo path the promo used:**
  * DN-2291 → C-3-01;
  * B-2140-A (120 days) → D-1001;
  * three synthetic quotes, Carrier A RM280 lowest;
  * Approve with net recovery RM920 ("before stock cost · not profit");
  * SIM-7001 → "2 collected", A-1-01 freed;
  * 3-Seater Sofa · Oatmeal +4 ("9 − 3 − 2 = 4").
* **Brand tokens:**
  * colours: bg `#09090b`; blue `#4F8BEA` / `#8db1f3`; violet `#a78bfa` (ageing); teal `#2dd4bf` (reserved); green `#22c55e` (freed); warn `#E3BD78`;
  * type: Geist 600 / Geist Mono.
* **Render speed** on the M1 Pro (GPU via `CHROME_PATH`): about 0.2–0.3 s per capture. A 630-frame film at dpr 2 with the shutter takes about 18–21 min on 3 workers.
