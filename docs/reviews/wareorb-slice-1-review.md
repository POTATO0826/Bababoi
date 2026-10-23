# WareOrb Slice 1 backend review

Initial review: 2026-10-23. Repair verification: 2026-10-24 (Asia/Kuala_Lumpur). Scope: the local Bun/SQLite receiving implementation and the UI wiring needed to demonstrate its stock effects.

**Current verdict: R1–R4 corrected and independently verified for this isolated backend slice.** The `backend` branch contains the implementation, repairs and review evidence. Integration with the newer `main`/`Vince` application is still unreviewed and requires the ledger decision below. No branch integration or deployment is approved by this review.

The initial review changed no application source and found the defects recorded below. At the user's subsequent request, a coding agent implemented the repairs; the coordinating reviewer checked the diff, reran the complete checks and repeated the browser repros. The original finding descriptions and line references are retained as the record of the pre-repair behavior.

## Repair verification — 2026-10-24

| Finding | Correction and independently observed evidence |
| --- | --- |
| R1 — resolved | Every linked line receives purchase eligibility/SKU checks; aggregate outstanding validation remains. Matching-first and mismatching-first regression cases reject the post and compare every business table before/after. A valid same-SKU split receipt still posts. |
| R2 — resolved | Background reads preserve dirty forms; request generations and mutation guards discard obsolete reads. Edits and genuine remote conflicts clear goods confirmation. In two actual browser tabs, creating another draft increased the pending count from one to two while `UNSAVED-REVIEW-CHECK` and the enabled Save draft control remained. Saving DN-2291 in the other tab then displayed a version-2 conflict notice while retaining that local text. Explicit Reload deliberately loaded the saved version. |
| R3 — resolved | Restored-session bootstrap loads persona options. After a page reload with a valid warehouse session, the picker displayed owner, warehouse and sales choices. The automated test also exercised switching to sales. |
| R4 — resolved | Readiness warns about missing supplier and/or document reference. Tests cover all missing combinations, complete references and different suppliers sharing a document number. The empty-draft warning was also visible in the browser. |

Fresh coordinating-reviewer results: **62 tests passed, 0 failed, 264 assertions across seven files** on Bun 1.4.3; `bun run typecheck`, `bun run build` and `git diff --check` passed. No new dependencies were added. Client response-order coverage tests the extracted load-decision policy; the two-tab browser observations separately verify its UI integration. An artificially delayed network response was not injected in the browser.

After the conflict test, the reviewer explicitly reloaded DN-2291, confirmed the synthetic goods and posted it. The UI again showed SKU **16 / 5 / 11 / 0**, warehouse **531 / 140 / 391 / 95**, and Floor 1 **245 units / 71 occupied bays**. This used a newly created temporary disk database; existing warehouse data was not changed. The full automated suite includes server restart persistence and independent-process contention checks. Microphone interaction and integration with `Vince` remain outside this verification.

## Repository and integration context

| Reference | Observed commit | Meaning |
| --- | --- | --- |
| Local implementation baseline | `f14ac31beb856042c45148ad44a1628c389746ee` | Cloud's Slice 1 changes were uncommitted on local `main` when reviewed. |
| Fetched `origin/main` | `614ef5e6abecdba3916850c791469d9fad0cfba6` | One commit ahead of the local baseline, with overlapping UI changes. |
| Fetched `origin/Vince` | `781687f39bcd1381541fcd0d3f3d2084bea5006b` | Includes a Convex backend, live ledger subscriptions, receiving and later business flows. It is not solely a frontend branch. |

These references are observations from this review, not a promise that remote branches will remain unchanged. Repository: `POTATO0826/Bababoi`, now private. Native Git access worked; the connected GitHub app did not have access.

The requested branch name is exactly `backend`. Preserve the reviewed code on its original baseline rather than blindly combining it with newer `main` or `Vince`. Their application data paths differ: this branch uses same-origin `/api` and SQLite; `Vince` uses Convex queries and subscriptions. Before integrating them, choose one authoritative stock ledger and explicitly map contracts, identities and posting rules. This review does not assess the correctness of the complete `Vince` implementation.

## Original findings (R1–R4 now resolved)

### R1 — P1: a later receiving line can consume another SKU's purchase outstanding

Location: [receiving.ts, lines 225–236](../../src/server/services/receiving.ts#L225).

`computeIssues` groups quantities by purchase-line ID, but uses `lines.find(...)` to check SKU compatibility only for the first receiving line in each group. Later lines with a different SKU pass validation. Posting repeats this same incomplete check inside its transaction, so atomicity does not prevent the incorrect result.

Reproduced against a fresh, seeded, on-disk database using the runtime request parser and ordinary receiving services:

1. Create a draft with two `SOFA-HAVN-2140` in `1B23` and two `SOFA-HAVN-2141` in `1B24`.
2. Link both lines to `demo-po-sofa-havn-2140-line-1`, whose outstanding quantity is four units of `2140`.
3. Both lines have valid count, unit and receipt date. Runtime parsing succeeds and the only readiness issues are `cargo_unknown` warnings.
4. Posting succeeds. `2140` changes from **12 on hand / 4 incoming** to **14 on hand / 0 incoming**, although only two of its four ordered units arrived. `2141` changes from eight to ten on hand.

Required correction: validate the SKU of **every** linked receiving line against its purchase line, while retaining the aggregate outstanding-quantity check. Return a line-specific issue. Reject posting without stock, movement, activity, receipt-state, revision or idempotency side effects.

Regression: matching line first and mismatching line second, plus reversed order. Compare the full persisted state immediately before and after the rejected post. Preserve valid split-line receipts for the same SKU and aggregate over-receipt rejection.

### R2 — P1: an unrelated refresh silently discards unsaved receiving edits

Location: [receiving-drawer.tsx, lines 204–226](../../src/components/receiving/receiving-drawer.tsx#L204).

The drawer reloads whenever the global snapshot revision changes. Its dirty-form guard runs only when the current receipt's version differs. If another receipt changes, the fetched current receipt still has the same version, so `apply` replaces the form and clears its dirty state without warning.

Reproduced in two browser tabs using the isolated review database:

1. Open `DN-2291` version 1 in tab A and change its document reference to `UNSAVED-REVIEW-CHECK`, without saving.
2. In tab B, create a separate empty manual receiving draft.
3. Allow tab A's background snapshot refresh to run.
4. Tab A's document reference reverts to `DN-2291`, the save control returns to its saved state, and no conflict warning appears. `DN-2291` is still version 1.

The same form replacement affects counted quantities and allocations. Staff can lose reviewed input during normal concurrent warehouse work.

Required correction: preserve dirty local fields on every background load, including same-version responses. Show a remote-change notice only when the receipt itself changes. Make explicit reload/discard deliberate, and reject obsolete responses that race with an edit, save, post or receipt switch. Keep the actual-goods confirmation tied to the reviewed content/version.

Regression: unrelated revision preserves local edits and dirty state; a genuine edit to the same receipt preserves local input and presents a conflict; a delayed stale read cannot undo a completed save or newer edit. Demonstrate the two-tab scenario in a browser as well as testing the relevant state behavior.

### R3 — P2: restoring an existing session leaves the persona picker empty

Location: [server-data.ts, lines 91–101](../../src/server-data.ts#L91).

The initial `personas` array is empty. Successful session bootstrap loads the session and inventory, but fetches personas only on the unauthenticated path. A reload or newly opened tab with a valid session therefore shows the synthetic-persona label and **Sign out**, without the owner, warehouse or sales choices.

Observed in the browser with an existing warehouse session. Signing out first is a workaround, but the role-switching demo no longer works directly after reload.

Required correction: load the server-provided persona options when restoring a supported demo session, preserving the existing disabled-demo behavior and server-side role authorization. Add a regression for fresh page state plus a valid session cookie; check all three role options appear after reload.

### R4 — P3: missing supplier information disables duplicate matching without a warning

Locations: [receiving.ts, lines 166–171](../../src/server/services/receiving.ts#L166) and [seed.ts, lines 27–28](../../src/server/db/seed.ts#L27).

Reference-based duplicate protection requires both supplier and document reference, but readiness warns only about a missing document reference. With `supplierRef: null` and a document reference present, `normalizeRef` returns null and duplicate matching is disabled silently.

Reproduced two valid drafts with the same document reference, no supplier, separate empty-bay allocations and separate idempotency keys. Both post; both show only the cargo warning.

Required correction: disclose weaker duplicate protection whenever the normalized reference cannot be formed, naming the missing supplier and/or document. Keep incomplete manual drafts allowed. Do not change the duplicate policy to document-only matching, which could conflate different suppliers.

## Initial verification and limits — before repairs

| Check | Observed result |
| --- | --- |
| Full `bun test` on Bun 1.4.3 | **50 passed, 0 failed, 236 assertions, five files.** Includes role enforcement, idempotency, stale versions, transaction rollback, disk reopen and two-process capacity contention. |
| Independent service review checks | **38 passed, 0 failed, 142 assertions** across receiving, seed and concurrency tests. The reviewer independently reproduced R1 and R4. |
| `bun run typecheck` | Passed. |
| `bun run build` | Passed; this builds browser assets, not a standalone API deployment. |
| `git diff --check` | Passed for the reviewed implementation. |
| R1 and R4 additional repros | Independently reproduced by the coordinating reviewer using parsed inputs and separate temporary disk databases. |
| Browser receipt happy path | Confirmed `DN-2291` with two units each in `1B23` / `1B24`. SKU became **16 / 5 / 11 / 0** (on hand / reserved / available / incoming); warehouse became **531 / 140 / 391 / 95**. Floor 1 showed **245 units, 71/72 occupied bays**. The receipt displayed as posted. |
| Browser concurrency/session checks | R2 and R3 reproduced in the actual UI. |

The first sandboxed full test run could not open local HTTP listeners (reported `EADDRINUSE` for port 0). The complete suite passed when rerun with the local permissions required for those listeners. That initial result was an environment restriction, not evidence of nine application failures.

Browser checks used a separate temporary, explicitly seeded database. They did not modify any existing warehouse database. Disk reopen was tested automatically; this review did not separately demonstrate a full server-process restart in the browser or exercise microphone/voice interaction. The happy-path observation does not establish that every scene/history/Jarvis surface is correct.

Versioned migrations also run at server startup. This is documented in the implementation README and differs from an explicit-migration-only deployment flow; startup does not seed/reset stock. Production rollout and identity infrastructure remain outside this slice. The implementation report path mentioned in the pasted Cloud handoff, `claude/wareorb-slice-1-implementation-report.md`, was not present in this checkout; evidence above comes from code and executed checks.

## Next handoff

The coding agent completed [the bounded repair prompt](wareorb-slice-1-fix-prompt.md); its scope is retained for traceability. Resolve the SQLite/Convex integration decision before combining branches or assigning the next feature slice. Passing this branch's tests alone does not validate that integration.
