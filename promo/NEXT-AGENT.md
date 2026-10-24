# Next agent: what to do (updated 25 Oct 2026)

**Immediate objective: the extended WareOrb promo film** (≥ ~30 s; you choose the final length and the creative execution).

It's separate from the official **5–7 min SDC Hackathon pitch video**: different length, and the pitch has a voice. The pitch's earlier brief is kept unchanged in `NEXT-AGENT-pitch-stageB.md`, and its plan in `pitch/pitch-plan.md`. Both rest on build assumptions that are now outdated; see `VIDEO-EXTENSION-HANDOFF.md` §6.

## Paste this to start the next agent

> You are taking over WareOrb video production for Team Bababoi:
> * Alfred Lee Khai Zher, team leader;
> * Deng Zhenqun;
> * Loo Yi Sheng.
>
> The credit wording is "WareOrb — by Team Bababoi".
>
> **Your job:** a premium cinematic **extended promo film of at least ~30 seconds** (30–45 s is a starting point; there's no fixed upper limit). It should show genuine inventory automation, meaningful human approvals, Lalamove **sandbox** quotation and Jarvis agent assistance, **only where they demonstrably work**. You decide the duration and the creative execution.
>
> **The existing 21 s promo** (`promo/WareOrb-promo-1080p.mp4`, SHA-256 `86640bae…`) is a finished, approved asset. Keep it unchanged. Make the longer film as a **new** file, and don't just slow the 21 s cut down.
>
> **Repository:** `POTATO0826/Bababoi`.
> * Video branch: `promo/wareorb-video`, worktree `~/Documents/codes/Bababoi-promo-video`, folder `promo/`.
> * Product source of truth: `backend-production` (audited at `4c2cc973ffccc2691019429605982b6d2989cd3f`). Read it only; never merge it into the video branch; never change business logic.
>
> **Read, in order:**
> 1. `promo/NEXT-AGENT.md` (this file);
> 2. `promo/VIDEO-EXTENSION-HANDOFF.md`;
> 3. `promo/VIDEO-CAPABILITY-AUDIT.md`;
> 4. `promo/storyboard.md`;
> 5. `promo/HANDOFF-promo.md` §3 (rules) and §5 (lessons);
> 6. `promo/render-instructions.md`.
>
> Then follow `VIDEO-EXTENSION-HANDOFF.md` §12 step by step. Start by fetching both branches (re-check the audit if `backend-production` moved), and **ask the user, in one round**:
> * whether they will enter Lalamove sandbox keys and/or connect Jarvis (a Claude API key, or Pi's Codex login) in the page for filming;
> * any duration preference;
> * confirmation that the 21 s film stays a separate cut.
>
> **Rules that override everything:**
> * real app behaviour only;
> * synthetic data, test entries, sandbox quotes and fixtures always labelled;
> * a sandbox quote is never a booking;
> * Jarvis never approves, posts, buys or dispatches;
> * no invented features, metrics or results;
> * no AI or synthetic voice;
> * deterministic, code-driven rendering;
> * a review gate (keyframes, contact sheet, draft) before any final long render;
> * the visual QA loop on the **encoded** file;
> * keep every earlier version;
> * never delete anything in `out/`;
> * never commit credentials, `.env*`, frames or drafts;
> * ask before pushing large binaries;
> * no force-push.
>
> Answer the user in English.

## Where things are

| What | Where |
|---|---|
| Video docs and code | `~/Documents/codes/Bababoi-promo-video/promo/` (branch `promo/wareorb-video`) |
| Large local outputs (frames, drafts, QA, exports, logs) | `~/Documents/codes/Bababoi/out/wareorb-promo/` (gitignored in the `backend` checkout; never commit there) |
| Current product export, ready to run | `~/Documents/codes/Bababoi/out/wareorb-promo/app-backend-production-4c2cc97/`:<br>`env -u ANTHROPIC_BASE_URL WAREORB_DEMO_PORT=3350 WAREORB_CONVEX_PORT=3360 bun run demo`<br>No login. Port 3210 is used by another checkout. |
| Evidence screenshots of the new UI | `~/Documents/codes/Bababoi/out/wareorb-promo/pitch/qa/backend-4c2cc97-screens/` |
| The 21 s renderer | `promo/source/harness/src3/` (build: `OUTDIR=dist3b ENTRY=v3 bun run build.ts`); render: `promo/source/render/`; score: `promo/source/audio-src/` |
| Evidence script (not the recording driver) | `promo/source/capture-backend/smoke-screens.mjs` |

## Kept from earlier briefs (still true)

* **Toolchain:** render with Google Chrome via `CHROME_PATH` (GPU). The Python venv is `promo/source/.venv`. Node 24 (keg-only, Homebrew) serves the local Convex backend.
* **Use these skills' methods:**
  * `onetake`: a palette in one room, carries between beats, the shutter, oracle-style checks;
  * `brag`: about 0.3 s of reading time per word, no crossfades between busy layouts.
* **Every lesson in `HANDOFF-promo.md` §5:**
  * one React and one three.js in the bundle;
  * frame purity (app clock `600 s + n/30`);
  * every mover registered in `window.motionAt`;
  * screen-fixed type at the integer frame;
  * the press wave instead of cross-dissolves;
  * result holds;
  * grain against banding;
  * explicit BT.709;
  * QA on the encoded file.
* **The team's narration** (for the pitch, not the promo) is human-recorded only. `pitch/problem-solution.md` is still waiting for the team's review.

## The separate 5–7 min pitch (not the immediate task)

* **Plan:** `pitch/pitch-plan.md`, approved 24 Oct with decisions A–E. Its demo-build parts (`e935ae6`, Clerk sign-in) are outdated; the local no-login demo at `4c2cc97` replaces them.
* **Status:** see `HANDOFF.md`.
* **Still open:**
  * the hackathon's rules (length, sections, aspect ratio, deadline), which the user didn't know yet;
  * the team's narration review, and who narrates.
