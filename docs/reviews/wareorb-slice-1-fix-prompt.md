# Coding-agent prompt: repair the reviewed backend slice

Execution status: completed and independently verified on 2026-10-24; see the [review update](wareorb-slice-1-review.md). This prompt is retained as the exact bounded repair handoff. Do not repeat completed work without a new finding. It does not authorize expanding the feature set or merging branches.

```text
You are the backend coding agent for WareOrb.

Work in the existing repository on the branch named exactly backend. Start by reading applicable repository instructions, checking Git status and confirming the branch. Preserve unrelated changes. Do not assume the old local main checkout or the newer Vince branch represents this task's implementation.

Read:
- docs/reviews/wareorb-slice-1-review.md
- docs/plans/wareorb-backend-plan.md
- README.md and the current receiving services, request validators, receiving drawer, server-data store and tests.

Your task is ONLY to correct review findings R1–R4 and verify Slice 1 again. Respond and document your work in English.

Repository context:
The reviewed Bun/SQLite implementation was built on f14ac31. During review, origin/main was 614ef5e and origin/Vince was 781687f. Vince already contains a Convex backend, not just UI work. This assignment does not authorize rebasing/merging Vince, replacing either backend, adopting dual authoritative ledgers, or rewriting the frontend. Report material drift before making integration assumptions. Do not advance to Slice 2.

R1: validate every receiving line's purchase linkage.
- In src/server/services/receiving.ts, readiness currently groups by purchaseLineId, then validates the SKU on only lines.find(...). A second, mismatching SKU can consume the first SKU's incoming quantity.
- Reproduce with two SOFA-HAVN-2140 in 1B23 and two SOFA-HAVN-2141 in 1B24, both linked to demo-po-sofa-havn-2140-line-1. Parsing succeeds and posting currently leaves 2140 at 14 on hand / 0 incoming although only two of its four units arrived.
- Validate each linked line's SKU, existence and eligibility as appropriate. Retain aggregate outstanding-quantity validation under the posting transaction lock. Return a useful line-specific error.
- Add a regression that exercises runtime-validated input and matching-first/mismatching-second order; also cover reversed order. Snapshot state after draft creation but before posting, then prove rejection leaves balances, lots, movements, activity, incoming, receipt status/version, warehouse revision and idempotency results unchanged.
- Retain valid same-SKU split-line receiving, aggregate over-receipt rejection and concurrency behavior. Do not paper over this with frontend filtering alone.

R2: preserve unsaved receiving edits during background refresh.
- src/components/receiving/receiving-drawer.tsx currently protects dirty fields only when the fetched receipt version differs. Any unrelated global revision triggers a same-version reload that silently calls apply and resets the form.
- Reproduce: tab A edits DN-2291's document reference without saving; tab B creates a separate manual receipt; tab A's background refresh discards its edit without warning.
- Protect dirty local state on every background response. For an unchanged receipt version, keep local fields and dirty state. For a genuine remote change, retain edits and present the existing deliberate conflict/reload flow.
- Ensure delayed responses cannot overwrite a newer edit, successful save/post, or a different selected receipt. Preserve normal initial loading, saved-record refresh and explicit reload behavior.
- Keep actual-goods confirmation attached to the content/version that was reviewed; require a new confirmation when that review is invalidated.
- Add focused behavioral coverage for unrelated revisions, same-receipt conflicts and delayed response ordering. Use existing test facilities where practical; avoid a broad frontend rewrite or unnecessary tooling additions. Demonstrate the two-tab repro in a browser and report exactly what was observed.

R3: populate demo personas when restoring a valid session.
- src/server-data.ts bootstrap currently loads personas only on the unauthenticated path, so a fresh page with a valid cookie shows Sign out but no role choices.
- Fetch the server-provided options for the supported demo session bootstrap path. Preserve disabled-demo/failure behavior; roles must remain enforced by the backend.
- Cover a fresh store plus successful GET /session. Verify owner, warehouse and sales choices are visible after reload, and role changes continue to update the active session correctly.

R4: disclose incomplete duplicate-reference protection.
- normalizeRef requires both supplier and document reference, while computeIssues warns only about a missing document.
- Warn whenever that normalized key cannot be formed. Explain which information is missing. Continue allowing incomplete drafts and the existing manual confirmation policy.
- Test missing supplier only, missing document only, both missing, and a complete reference. Preserve the existing supplier-plus-document duplicate check; do not reject different suppliers merely because they use the same document number.

Boundaries:
- Keep the same-origin Bun/TypeScript API, bun:sqlite persistence, explicit non-destructive seed, warehouse IDs and existing demo data.
- Preserve the rule that drafts do not alter stock and only authorized, version-checked, idempotent posting changes physical inventory atomically.
- Do not reset or reseed an existing database, migrate user data speculatively, change the schema gratuitously, introduce production identity infrastructure, or implement AI/quote/sales/dispatch/replenishment features.
- Do not commit, push, merge, deploy or contact external parties as part of this repair assignment. Stop with a reviewable working diff.

Verification:
1. Demonstrate the relevant regressions fail on the reviewed behavior and pass after the fixes. Keep test fixtures isolated from real warehouse data.
2. Run bun test, bun run typecheck, bun run build and git diff --check. If a sandbox prevents binding a local HTTP port, distinguish that environment error from a code failure and use the supported permission workflow.
3. Repeat the two-tab edit-preservation test and existing-session reload in a browser. Recheck the receipt happy path against a disposable seeded disk database: DN-2291 changes SOFA-HAVN-2140 from 12/5/7/4 to 16/5/11/0, warehouse totals from 527/140/387/99 to 531/140/391/95, and occupied bays from 140/144 to 142/144. Use 1B23 and 1B24; do not move existing stock or overfill Floor 1 Zone A.
4. Report exact results and any checks you could not run. Do not equate passing existing tests with having fixed the new regressions.

Deliver a concise handoff containing the root cause and correction for each review ID, changed files, verification evidence, remaining limitations and any repository drift. Leave review findings marked pending until their fixes are independently checked. Stop for backend review before expanding scope.
```
