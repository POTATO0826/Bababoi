# Local demo handoff review — 24 October 2026

> **Resolved in the Claude Cloud continuation** (see `docs/local-demo.md`): local isolation (preflight over
> ambient/`.env.local`/`.env`, exact loopback URL checks, allow-listed child environments, re-check after
> the CLI writes), voice evidence with or without transcript, unknown condition preserved until confirmed,
> one shared budget/space replenishment plan used by the panel and the agent, measurement UI and honest totals,
> Jarvis ↔ Pi streaming with visible tool calls, portable Node selection, demo mode refused in release builds,
> and new local-runtime / measurement / configuration / integration tests.

Reviewed commit: `ddbb9445113115d2e045672e4b9a796ef6f4e553` on `backend-production`.

## Verdict

The handoff accurately calls this a WIP. **The local demo is not acceptance-complete.** Its new measurement UI and Pi chat wiring are missing, and its new local runtime paths are not covered by the existing tests. Continue implementation from this commit; do not claim the demo already runs end to end.

This review changes documentation only. Product fixes below are assigned to the Claude Cloud continuation. The original checkout, video work, cloud deployments and operator credentials were not modified or used.

## Fresh checks

In the isolated review checkout, `bun install --frozen-lockfile` succeeded without changing the lockfile. `bun run check` exited 0:

- Bun: **27 passed** (21 domain + 6 voice tests), 0 failed.
- Convex/Vitest: **49 passed**, 0 failed.
- Frontend typecheck, Convex typecheck and frontend production build passed.
- `git diff --check` passed.

There are no committed tests under `src/local/`, no measurement-specific test file, and no local-runtime/Agent/UI end-to-end evidence in this run. The current tests therefore do not establish Pi authentication, photo recognition, microphone capture, local bridge connectivity or restart persistence.

Temporary isolated review probes reproduced three defects below. All three probes passed by asserting the **observed incorrect behavior**, not by asserting the intended behavior. The temporary probe file was then removed; these probes are not additional acceptance tests.

## Confirmed missing work

1. `src/components/detail/receipt-detail.tsx` has no measurement inputs or totals view using `lineTotals`/`receiptTotals`. The schema fields alone do not expose the feature.
2. The new `/api/agent/chat` and `/api/agent/status` routes are not consumed by the existing Jarvis frontend. Tool-start/tool-end rendering is not implemented.
3. `.env.example` still primarily describes cloud/Clerk setup, and `scripts/build-production.ts` does not explicitly reject `BUN_PUBLIC_WAREORB_LOCAL_DEMO=1`. The promised local setup document is missing.

## Findings to fix

### P1 — A recorded voice note is rejected by the receiving mutation

`convex/receiving.ts:100–109` accepts uploaded image/PDF evidence, then rejects any `storageId` for the remaining kinds. The voice UI passes both the retained audio `storageId` and its transcript to `receiving.addEvidence`, so the ordinary recorded-voice path fails even when speech recognition succeeds.

Reproduced using `convex-test`: bootstrap an owner, create a receipt, store an `audio/webm` Blob, then call `addEvidence({kind:"voice", storageId, text:"Two chairs, ten kilograms each", expectedVersion:1})`. It throws **"Enter the note or voice transcript"**. A recording with no transcript is also blocked by the same branch.

Fix: accept and validate actual stored audio metadata/size for voice, with optional transcript. Keep plain text notes separate. Preserve the recording even when transcription fails. Add backend tests alongside the existing browser transcription fallback tests; ensure the receipt renders the evidence.

### P1 — Local-only startup can inherit cloud selectors and unvalidated URLs

`scripts/demo.ts:58` copies all ambient environment variables into Convex subprocesses; `:77–80` checks only the `.env.local` deployment prefix. The installed Convex CLI's `deploymentSelection.ts` explicitly gives deploy keys precedence over deployment selectors. An ambient/cloud-file `CONVEX_DEPLOY_KEY` can therefore redirect `convex env set --force` and other CLI commands despite the local prefix check.

Later, `scripts/demo.ts:126–140` trusts generated/stored `CONVEX_URL` and `CONVEX_SITE_URL` without verifying loopback before sending a presenter bearer token or querying the ledger. The local Bun route configuration also trusts the supplied Convex URL.

Fix and test before any startup run: reject or remove cloud deploy-key/token/self-hosted selectors from both ambient and loaded env sources; use an explicit isolated local target; validate all database/site/agent URLs as exact permitted loopback URLs with expected ports and no credentials/query/fragment before CLI mutation, bearer use, bootstrap or seed/reset. Do not merely test string prefixes. Use mocked CLI/fetch spies to prove cloud env inputs produce **zero external requests/writes**. No cloud-directed reproduction was performed in this review.

### P1 — Replenishment results can spend the same budget and bay twice

`src/domain/replenish.ts:98–116` supplies the same complete `budgetLeftSen` and free-bay count to every SKU. `src/local/warehouse-tools.ts:78–113` labels the resulting amounts as `recommendedQty`, totals them, and warns afterward if they exceed shared resources. It also derives committed PO costs from catalogue prices instead of each confirmed order's actual `unitCostSen`; existing incoming orders do not reserve their planned bays in the recommendation.

Reproduced with two SKUs, each needing one unit at 500 sen, one free bay, and a shared 500-sen budget. Both rows recommend one unit: the result requires **1,000 sen and two bays**.

Fix: return a deterministic feasible allocation across all recommended SKUs, consuming shared remaining budget and space once, or clearly separate unconstrained candidates from the final feasible recommendations. Account for actual outstanding PO costs and planned incoming bays. Unknown costs/history must remain explicitly insufficient. UI and Agent must consume the same result. Add competing-SKU, differing-PO-cost, incoming-space, unknown-cost and short-history tests.

### P2 — Unstated condition becomes "good"

The shared reading rules require an unstated condition to remain empty. `convex/ai.ts:72–76` and `convex/receiving.ts:393–394` replace it with "good".

Reproduced through `internal.receiving.setExtraction`: an AI line with `condition:""` is persisted with `condition:"good"`. It remains unverified, but its displayed condition is still invented.

Fix: preserve unknown/blank condition through both local and cloud extraction paths. Require the presenter to confirm physical condition before posting. Add an actual-mutation regression test.

### P2 — Cloud/Linux runtime setup needs portable Node selection

`scripts/demo.ts:43–53` recognizes a supported Node 20/22/24 on PATH, then probes only Homebrew Mac locations. This works on Linux when PATH already has a supported version; otherwise its only instruction is `brew install node@24`.

Cloud work must explicitly provision/select supported Node on Linux, with a configurable path or platform-appropriate instructions. Preserve the Mac/Homebrew path. Make port/binary-download failures actionable. Do not copy this Mac's local credentials or database into Cloud.

## What was deliberately not judged as verified

- Pi live login, available account models and subscription access: no credentials read, copied or provider requests sent.
- Browser microphone, real handwritten-note accuracy, Agent tool streaming and local database restart persistence: pending the completed UI/runtime and a real presentation-machine walkthrough.
- Claude's claimed earlier hosted acceptance: not re-run; it is outside the current local-only scope.
- A running local backend on fixed ports: not started or reset by this audit, to avoid colliding with other local work. Cloud must test in a fresh isolated workspace and document its ports/data directory.

The authenticated local presenter design, loopback Bun binding, separate extraction bridge secret, Pi tool allowlist and synthetic-data labelling are good foundations. They do not replace the remaining integration and regression work above.
