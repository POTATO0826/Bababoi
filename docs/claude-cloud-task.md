# Claude Cloud continuation — finish the local warehouse demo

## Mission

Finish the **local presentation demo**, starting from `backend-production` at or after `ddbb9445113115d2e045672e4b9a796ef6f4e553`. Read `docs/local-demo-handoff.md`, **`docs/local-demo-review.md`**, `AGENTS.md` and `convex/_generated/ai/guidelines.md` first. The review adds required corrections to the original handoff. This task supersedes earlier public/production-launch plans.

The user wants one local startup command, no application login window, voice/photo receiving with editable measurements and a real Pi warehouse analyst. Public hosting, Vercel/Clerk setup and cloud database changes are out of scope.

## Work in this order

1. Inspect the actual checkout/branch and preserve any existing edits. Install pinned dependencies with Bun and select Node 20/22/24 for local Convex on the Cloud Linux runner. Reuse existing code and design; avoid a framework rewrite.
2. **First fix local isolation before running startup.** Address the review's ambient-cloud-selector and URL issues. Add tests proving cloud selectors/URLs are refused before any credential-bearing request, environment mutation, bootstrap or seed/reset. Do not run against shared `admired-swordfish-390`, hosted `descriptive-lemur-152` or the Vercel site. Use a fresh ephemeral local deployment/database and configurable conflict-free ports.
3. Complete receipt measurement UI: unit, package count, L/W/H in cm, per-item weight, per-package weight and separately stated total weight. Display per-line and receipt totals, their basis, mismatches and incomplete/unknown totals. Blank, unreadable and non-finite input must never become guessed values or misleading zero totals. Respect draft versions and retain unsaved edits. Preserve unknown condition until the presenter confirms it.
4. Fix the actual voice-evidence backend rejection, not just transcription response handling. Voice with a recording and transcript, recording without transcript, and text-only note must work with proper file metadata/size validation. Preserve original evidence. Browser speech is the selected transcription path; do not claim Pi models transcribe audio, install an unrequested speech model, or silently substitute a paid speech provider. State Chrome/microphone/network requirements clearly.
5. Wire local-demo Jarvis free text to `/api/agent/chat` and `/api/agent/status`. Implement robust SSE handling and render real text deltas plus tool calls, arguments, results, errors and model/provider state. Handle split chunks, completion, cancellation, missing/invalid credentials, busy sessions and failed requests. No scripted fallback masquerading as a connected Agent. Preserve existing production behavior outside explicit local-demo mode.
6. Keep Pi sessions restricted to the intended warehouse read/analysis tools, without shell/files/extensions. Verify current pinned SDK behavior with tests. Finish extraction bridge → structured editable draft handling for readable, unreadable and malformed image results. Model responses never post stock automatically. Test using a clearly labelled mocked provider/session; do not label this as successful live AI.
7. Correct the shared-budget/space replenishment defects in the review. Use actual outstanding PO costs and incoming-space commitments, allocate scarce budget/bays across SKUs deterministically, and keep unknown cost/history honest. The Agent and UI must explain the same feasible recommendations. No automatic purchasing or dispatch.
8. Add local-demo setup documentation and a single clear configuration example. Generated private JWKs, bridge secrets, Pi auth files, local database files and logs must stay private and ignored. Explicitly reject demo mode in production builds. Keep the presenter free of an application login screen; provider login is a one-time operator step outside the app.
9. Run all checks, local startup/bridge smoke tests, browser tests where the runner supports them and restart-persistence tests. Re-run existing receiving, PO, approval, partial-dispatch, stale-write and duplicate/retry protections. Do not stop at another handoff or a passing typecheck while the requested UI remains missing.

## Cloud versus presentation Mac

Cloud has no access to the user's Mac, `~/.pi/agent/auth.json`, microphone, existing browser session or local database. **Do not ask for subscription tokens or API keys to be pasted into the task, read from unrelated files, or committed.** Implement and test all independent work with isolated synthetic data and mocked providers.

For a final live Pi/photo/microphone walkthrough, provide exact steps for the user to run on the presentation Mac after their own Pi login. Clearly mark those checks pending if credentials/hardware are unavailable; this must not block finishing code, UI and automated tests. No claim that mocked Agent responses are a working live connection.

If Cloud cannot download/run the local Convex binary or bind ports, report the precise environment failure. Continue the independent implementation and mocks, and provide a deterministic smoke-test command for the presentation Mac. Do not solve a Cloud limitation by deploying to a real cloud database.

## Completion evidence

- `bun run check`, `git diff --check` and any new focused tests pass. Baseline before this task: 27 Bun tests + 49 Convex tests; the original WIP has no local-runtime/measurement tests.
- Local app opens without a login screen and uses persistent isolated data.
- Photo/voice evidence produces a reviewable draft; editing measurements shows correct honest totals; only confirmed posting changes stock once.
- Jarvis shows actual streamed tool calls/results. Analysis is grounded in current stock/movements and obeys shared resource constraints.
- Restart retains records; missing credentials, unreadable photos, unknown weight, duplicate posting and insufficient history have visible tested behavior.
- Stage only explicit intended source/tests/docs. Scan staged changes for secrets without printing matched values. Commit and push to **`backend-production`**, attach a concise result with commit SHA and verification evidence.

Preserve the protected original `/Users/saou/Documents/codes/Bababoi`, the video project and other tasks. Do not delete or alter superseded hosted resources. All business/provider actions in acceptance use synthetic test records. Report the runnable local command, changed files, results, remaining operator settings and live checks still pending.
