# WareOrb video production: handoff (24 Oct 2026, Stage B in progress)

**This is the current handoff.** Earlier handoffs are kept unchanged:
* `HANDOFF-promo.md`: the promo delivery, with rebuild commands and lessons learned. Read its §3 (rules) and §5 (lessons).
* `HANDOFF-cowork.md`: the Cowork history.

Facts marked **verified** were checked in this session. Everything else is marked **assumption** or **not done**.

---

## 0 · Resume here first

**The exact task to resume:** prepare the recording environment for the pitch demo on `backend-production` @ `e935ae6`.
* The isolated local Convex backend works on this Mac (verified).
* The first deploy of the app's functions is **blocked**: it needs the team's Clerk values (see §7).
* The next agent should:
  1. give the team the Clerk checklist in §9.1 (they must do those steps themselves; Claude never handles keys or passwords);
  2. meanwhile, do the Claude-only items in §9.2: run the branch's checks, build the recording driver, and draft the non-demo narration.

**Do not record or render anything for the pitch** until the team's Clerk setup is finished and the seeded ledger is verified. The plan itself is approved.

---

## 1 · Objective and status

**Project:** WareOrb, a hackathon warehouse-operations prototype by **Team Bababoi**:
* Alfred Lee Khai Zher, team leader;
* Deng Zhenqun;
* Loo Yi Sheng.

The credit wording is "WareOrb — by Team Bababoi". The hackathon is the SDC Hackathon, Domain 2 (Orbyte Smart SME Challenge).

| Item | State |
|---|---|
| 21 s promo `WareOrb-promo-1080p.mp4` | **Delivered and approved** (24 Oct). SHA-256 `86640bae8fc1a3634ddecb1d385c7b22a619ae977ad2e42511541f4321ea461b`. **Don't change it.** |
| Stage A: problem/solution narration (`pitch/problem-solution.md`) | Drafted. **Not reviewed by the team yet** (user, 24 Oct). Its optional honesty line H1 is wrong for `e935ae6` and must be rewritten (see plan §6). |
| Stage B, step 0: toolchain | **Verified** (§6) |
| Stage B, step 1: pitch plan `pitch/pitch-plan.md` | **Approved by the user on 24 Oct, with decisions A–E as recommended** |
| Stage B, step 2: demo recording (B1) | **In progress.** App exported and installed; local Convex backend starts; the first function push is blocked on Clerk config (§7). The recording driver is **not written yet**. |
| Stage B, step 3: remaining narration (D0–D8, the new H1, T1–T3, I1–I3, C1–C2) | **Not started** |
| Stage B, step 4: assembly (B5) behind a review gate, then QA | **Not started** |

---

## 2 · Requirements and decisions (all user-approved; non-negotiable unless the user changes them)

**Standing rules:**
* **Truthfulness first.**
  * Only real app behaviour is shown.
  * Seeded demo data, synthetic quotes, test accounts and test entries are always labelled.
  * No invented features, metrics or results.
* **Human narration only, recorded by the team.** No AI or synthetic voice anywhere, not even as a placeholder. Caption-only drafts are fine.
* **No dependence on external APIs.** Anthropic, Lalamove, Fish and Codex stay "wired in, needs a key", never shown working.
  * The one approved exception is below (decision A).
* **Don't modify the product source.** The app is run from a `git archive` export.
* **Everything is code-driven and deterministic.**
* **Review gate before any final long render:** keyframes, a contact sheet and a draft, then the user's approval.
* **Mandatory visual QA loop on the encoded file:**
  1. Render.
  2. Extract frames every 0.5 s and every transition from the **encoded** MP4.
  3. Make contact sheets and look at them.
  4. Fix, re-render, re-verify.
  5. Never call it done because it rendered.
* **Keep all earlier versions.**
* **Never delete anything in `out/`.** The user chose "keep everything" on 24 Oct.
* **Ask before pushing large binaries.**
* **The user writes and wants answers in English.**

**The user's answers on 24 Oct 2026:**
1. **Demo build:** `backend-production` @ `e935ae6`, with no keyed features shown.
2. **Hackathon pitch rules** (maximum length, required sections, aspect ratio, deadline): the user doesn't know yet. **Ask again later.** The plan assumes 6:10 and has a 5:00 variant.
3. **Narration:** not reviewed by the team; no narrator named.
4. **Cleanup:** keep everything.

**Decisions A–E (approved as recommended; details in `pitch/pitch-plan.md` §1):**

| | Decision |
|---|---|
| **A** | **Clerk exception.** A Clerk *development* instance, used only to sign in three test accounts: owner, sales, warehouse.<br>• The team creates the instance and the users, sets the keys, and signs in.<br>• Claude never sees or types keys, passwords or codes.<br>• No other keyed service is configured. |
| **B** | **Test entries typed on camera, labelled.**<br>• Carrier "Carrier A (test)", Lorry 10ft, RM280 including unloading, reference `TEST-DEMO-001`, terms "Test entry for the pitch video. No carrier was contacted."<br>• Arrangement reference `TEST-ARR-001`. |
| **C** | **Show the app refusing synthetic "Demo" quotes**, but only if the refusal is visible on screen |
| **D** | **Solution section uses the twin, the line and type only**, with no UI cards. The real UI first appears in the demo. |
| **E** | **Replenishment:** show the suggestion and its arithmetic only; no purchase is recorded |

---

## 3 · Git (verified 24 Oct, end of session)

| | |
|---|---|
| Repo | `https://github.com/POTATO0826/Bababoi.git` |
| Working branch | **`promo/wareorb-video`** (folder `promo/`), worktree **`~/Documents/codes/Bababoi-promo-video`**.<br>Commits this session:<br>• `608117a`: plan draft;<br>• `3cb91db`: plan approved;<br>• the handoff commit that adds this file.<br>The branch is pushed (§10). |
| Main checkout | `~/Documents/codes/Bababoi`, branch `backend` @ `5708e52`. The team's in-progress backend work. **Never commit there or touch its files.** `out/` is gitignored there. |
| Other branches (read only) | • `Vince` @ `8f4d6df`: the promo's app code (`781687f` plus a licence).<br>• `backend-production` @ `e935ae6`: **the build to record.** Another Claude session develops it in `/private/tmp/wareorb-production-6FLaVM`; don't touch that folder. If the branch moves past `e935ae6`, confirm with the user before switching.<br>• `main` @ `614ef5e`. |

---

## 4 · Setup and resume commands

**Toolchain (verified):**
* Mac M1 Pro.
* Bun 1.4.3; Node 26.12.1 (the default); Playwright 1.56.1.
* Google Chrome 155 through `CHROME_PATH`; FFmpeg 9.0.2; uv 0.13.5.
* **Node 24.22.1**, installed this session with Homebrew as keg-only (`/opt/homebrew/opt/node@24/bin`), because the Convex local backend needs Node 20, 22 or 24.

**Promo renderer (verified):**

```bash
cd ~/Documents/codes/Bababoi-promo-video
bun install --frozen-lockfile
cd promo/source && npm ci   # .venv exists, pinned to the local package's versions (numpy 2.5.4, scipy 1.18.1, pillow 13.0.0, opencv 5.0.0.93)
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd harness && OUTDIR=dist3b ENTRY=v3 bun run build.ts       # main3.js sha256 a10d0c80… (code-identical to delivered 85dce784…; only path comments differ)
cd ../render && node render-film.mjs --dist ../harness/dist3b --out <dir> --frames 401,615 --dpr 2 --shutter 180 --gap 4 --max-samples 48 --workers 2
```

**The app to record (`e935ae6`), exported, not a git checkout:** `~/Documents/codes/Bababoi/out/wareorb-promo/app-e935ae6/`
* It was made with `git archive e935ae6`; the marker file `.export-commit` holds the full SHA.
* `bun install --frozen-lockfile` has been run (221 packages).
* `.env.local` holds only local values:
  * `CONVEX_DEPLOYMENT=anonymous:anonymous-agent`;
  * `CONVEX_URL` and `CONVEX_SITE_URL` (`http://127.0.0.1:3210` and `:3211`);
  * `BUN_PUBLIC_CONVEX_URL` and `BUN_PUBLIC_CONVEX_SITE_URL`.
* The team must add `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…` themselves.

**The local Convex backend:** run it from the export folder.

```bash
cd ~/Documents/codes/Bababoi/out/wareorb-promo/app-e935ae6
PATH="/opt/homebrew/opt/node@24/bin:$PATH" CONVEX_AGENT_MODE=anonymous \
  ./node_modules/.bin/convex dev --codegen disable --typecheck disable --tail-logs always \
  > ../pitch/logs/convex-dev-N.log 2>&1        # run in the background; Ctrl-C/SIGINT stops it and the backend
```

* **Always set `CONVEX_AGENT_MODE=anonymous`.** A Convex CLI login token exists in `~/.convex/config.json`; without the variable, the CLI might offer to link a cloud project.
* `--codegen disable` keeps the exported `convex/_generated` byte-identical.
* The deployment's data lives in `app-e935ae6/.convex/local/default/`: a SQLite database, file storage and a `config.json` with the local admin secret, which must never be committed.
* The backend binary is `~/.cache/convex/binaries/precompiled-2026-10-10-72ce13c/`.
* **Never** point anything at the shared dev deployment `dev:admired-swordfish-390` (used by another workstream and the `Vince` preview) or at production `descriptive-lemur-152`.

Other commands, from the export folder, with `CONVEX_AGENT_MODE=anonymous` set:
* `./node_modules/.bin/convex env set NAME value`
* `./node_modules/.bin/convex run seed:run`, which needs `WAREORB_ALLOW_DEMO_SEED=true`
* `bun dev`, which serves the app at `http://localhost:3000`

---

## 5 · Local paths (all outside git; keep them)

| Path | What |
|---|---|
| `~/Documents/codes/Bababoi/out/wareorb-promo/` | The full local package from the promo:<br>• final frames;<br>• drafts (3.4 GB);<br>• QA runs;<br>• `vince/` export;<br>• `context/`. |
| `…/out/wareorb-promo/promo/pitch/pitch-plan.md` | A copy of the approved plan, for opening in the Claude app. The branch copy is canonical. |
| `…/out/wareorb-promo/pitch/` | **Stage B work area:**<br>• `qa/step0-smoke/frames/` (frames 401 and 615);<br>• `logs/convex-dev.log` (first run: Node 26 refused);<br>• `logs/convex-dev-2.log` (second run: stopped at the missing `CLERK_JWT_ISSUER_DOMAIN`).<br>Planned subfolders: `recordings/`, `voice/`, `frames/`, `drafts/`, `profiles/`. |
| `…/out/wareorb-promo/app-e935ae6/` | The exported app, its node_modules and the local deployment state (see §4) |
| `/opt/homebrew/opt/node@24` | Node 24, keg-only, installed this session |
| `~/.cache/convex/` | The Convex local backend binary and dashboard (190 MB) |
| `~/Library/Application Support/Claude/side-session-notes/local_d5644470-d336-40c5-b715-9e84c868c70b/` | Notes shared between the sessions of this task |

---

## 6 · Verified results

* **Toolchain smoke test:** frames 401 and 615, rendered from the worktree build, are **byte-identical** to the delivered frames (`93228fdb…`, `f6cf89dc…`) and to `previews-v3b/keyframe-04.png` / `-06.png`. Both were also inspected by eye.
* **Code reading of `e935ae6`** (with `git show`; facts listed in `pitch/pitch-plan.md` §0):
  * Clerk is required; without the publishable key the app shows only "needs identity setup".
  * Synthetic, demo and sandbox quotes can't authorise a sale (`convex/deals.ts`, `usableQuote`).
  * There's no simulated booking; the carrier reference is recorded by the owner or sales.
  * The collection is recorded by the owner or warehouse, as per-bay counts, with "Record N collected".
  * "Start sale" (owner) replaces "Hand to Arif".
  * "Send for approval" needs a collection time in the future.
  * The seed (`src/domain/seed.ts`) and the 3D scene (`src/scene/`) are unchanged from `Vince`.
  * The reset (`seed:run`) keeps the `staff` table but doesn't clear `collections`.
  * The app requests Clerk tokens with the template `"convex"`, and the auth config expects application ID `convex`.
* **The Convex local backend starts on this Mac** (anonymous mode, port 3210).
  * Push 1 failed on the server: "use node" actions need Node 20, 22 or 24 (only `convex/ai.ts` uses `"use node"`).
  * Push 2, with Node 24 first on `PATH`, stopped **on the client, before reaching the server**: "Environment variable CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not set".
  * So **the Node 24 fix is applied but not yet verified.**
* **Not run yet:** the branch's own suite `bun run check` at `e935ae6`. Its handoff's "74 passed" is **not** verified by us and must not be quoted.

---

## 7 · When interrupted

I was bringing up the local backend for `e935ae6`. The function push needs `CLERK_JWT_ISSUER_DOMAIN`, which is the team's Clerk Frontend API URL (it isn't a secret). Nothing is running now: both `convex dev` runs were stopped cleanly, and ports 3000, 3210 and 3211 are free.

---

## 8 · Blockers, known issues and assumptions

* **Blocker:** the team's Clerk development instance and keys (§9.1).
* **Assumption: Clerk test emails.** Clerk development instances accept `+clerk_test` email addresses with the code `424242`. This is from Clerk's documentation, not tested here.
* **Assumption: the identity key.** The owner's identity key for `access:bootstrapOwner` is `<issuer exactly as set in CLERK_JWT_ISSUER_DOMAIN, no trailing slash>|<Clerk user ID>`, following Convex's `${iss}|${sub}` format. Check it against `access:bootstrapIdentity` if bootstrap doesn't match.
* **Assumption: `convex env set`** works while the push is failing.
* **Assumption: restart after setting env vars.** `convex dev` may need a restart before it pushes.
* **Risk: no walkthrough yet.** `e935ae6` has never had a real logged-in walkthrough (its own handoff says so). Expect bugs. Report them; never patch the product source or fake an outcome.
* **Risk: dropped frames.** Screen capture may drop frames with the 3D view. Test a take first; the fallback is a lossless avfoundation capture, which needs the team to give the terminal Screen Recording permission.
* **Risk: Convex telemetry.** The Convex CLI starts the local backend with Convex's own error-reporting (Sentry) DSN. That's the tool's telemetry, not an app dependency.
* **Mismatch with the cold open.** The cold open (`Vince` UI, synthetic approval, `SIM-7001`) differs from `e935ae6`. The plan handles it with labels and chapter 4's refusal beat.

---

## 9 · Next steps, by priority

### 9.1 · Team (Claude must not do these)

1. **Create the Clerk application** (development instance) and enable its **Convex integration** (this creates the JWT template `convex`). Note the Frontend API URL (the issuer).
2. **Create three test users**, named Mei (owner), Arif (sales) and J. Lim (warehouse). Suggested emails use `+clerk_test`.
3. **Add the publishable key:** `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…` in `app-e935ae6/.env.local`.
4. **Set the secret key** in the export folder, with the backend running:

   ```bash
   CONVEX_AGENT_MODE=anonymous ./node_modules/.bin/convex env set CLERK_SECRET_KEY sk_test_…
   ```

5. **Give Claude** the issuer URL, the owner's Clerk user ID and the three emails. None of these is secret.
6. **Sign in when Claude opens each recording profile.**

### 9.2 · Claude

1. **Set the non-secret variables** on the local deployment:
   * `CLERK_JWT_ISSUER_DOMAIN=<issuer>`;
   * `WAREORB_ALLOW_DEMO_SEED=true`.
2. **Restart `convex dev`** (§4) and confirm the push succeeds. This also verifies the Node 24 fix.
3. **Run the branch's checks:** `bun run check` in the export. Record the exact results and the date; they're needed for the "how it's built" section.
4. **Bootstrap the owner:** `./node_modules/.bin/convex run access:bootstrapOwner '{"tokenIdentifier":"<issuer>|<user id>","email":"…","name":"Mei"}'`. Then the owner invites Arif and J. Lim in **Staff**, and they activate.
5. **Load the seed:** `./node_modules/.bin/convex run seed:run`. Verify DN-2291 to verify, B-2140-A flagged, and no open deal, with `convex data` on the CLI.
6. **Write the driver** `promo/source/capture-pitch/`:
   * one Chrome persistent profile per role, under `out/wareorb-promo/pitch/profiles/`;
   * real clicks and typing only, no `__ware.setState` on camera;
   * CDP screencast resampled to 30 fps;
   * an event log and ledger snapshots.
7. **Make a test take**, then record chapters 0–8 per plan §4.3. Make a contact sheet per chapter and look at it.
8. **Write the narration:** D0–D8, the new H1, T1–T3, I1–I3 and C1–C2, in the format of `problem-solution.md`, for the team to review and record.
9. **Ask the user again** for the hackathon's rules: maximum length, sections, aspect ratio and deadline.
10. **Assembly (B5)** per plan §7. Show the review gate before the final render, then QA on the encoded file.

---

## 10 · Push record

The branch `promo/wareorb-video` is pushed to `origin`, fast-forward only. Check the pushed head with `git ls-remote origin promo/wareorb-video`. No large binaries were added this session; only Markdown files changed.
