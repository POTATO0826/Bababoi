# WareOrb backend coding-agent prompts

Use these English prompts after the plan has been reviewed and implementation has been authorized. The coordinating agent's role in this handoff is backend planning and review. Do not ask the coding agent to build every slice in one turn.

Current handoff (2026-10-24): Slice 1 and its [bounded repairs](../reviews/wareorb-slice-1-fix-prompt.md) have been implemented and independently verified. Read the [review results and branch context](../reviews/wareorb-slice-1-review.md) before assigning further work. Resolve the SQLite/Convex integration decision before merging branches or advancing to the next feature slice; do not rerun completed prompts automatically.

## Prompt 1 — Implement only the first backend vertical slice

```text
You are the coding agent for WareOrb in /Users/saou/Documents/codes/Bababoi.

Read applicable repository instructions and docs/plans/wareorb-backend-plan.md first. Inspect the actual checkout, package scripts and git status. The inspected planning baseline was f14ac31; preserve newer/user changes and identify material drift before changing the design. The current requirements override older concept/design-handoff documents. Respond and document your work in English.

Implement ONLY Slice 1: a manually reviewed receiving draft posts stock atomically to a durable backend and updates the existing warehouse UI, 3D positions, history and Jarvis facts. The scope includes the minimum frontend data wiring necessary to prove this backend outcome; do not redesign the interface.

Architecture:
- Extend the existing Bun/TypeScript server with same-origin JSON /api routes.
- Use bun:sqlite with explicit versioned SQL migrations, foreign keys, short write transactions and parameterized SQL. No ORM, microservice, event-sourcing framework, queue, new frontend framework or database service is needed.
- Use shared JSON-safe contracts and runtime validation. Do not serialize the current cyclic Category/Model/Sku objects.
- Keep database files and sidecars out of Git/public assets. Make demo initialization explicit, rerunnable and non-destructive. Never reseed on startup.
- Implement the minimal labelled demo-session/role boundary from the plan, with server-side authorization. Browser-supplied roles/actors must not authorize posting.

Required data behavior:
- Persist existing catalogue IDs, geometry and initial per-bay allocations: 43 SKUs, 527 on hand, 140 reserved, 387 available, 99 incoming, 140 of 144 bays occupied.
- Seed explicit lot/balance/movement records, synthetic opening reservations and confirmed incoming purchase records. Later sales/purchase editing screens are outside this slice.
- Seed DN-2291 as a draft for four SOFA-HAVN-2140 linked to its four confirmed incoming units. It is NOT an already-posted receipt.
- A receiving draft or edit does not change stock. Posting requires an authorized user, expectedVersion, idempotency key and explicit actual-goods confirmation, plus resolved SKU/count/base unit/date and valid allocations.
- Within one write transaction, validate current capacity and purchase outstanding, create lots/balances/receipt movements, record activity, mark the receipt posted, update the snapshot revision and store the idempotency result. Roll back all effects on failure.
- Maintain onHand, reserved, available and incoming invariants. No generic endpoint for changing a count.
- No provider or AI dependency is needed for this first proof.

Specific placement issue:
Floor 1 Zone A is FULL. Use existing empty location IDs 1B23 and 1B24 for two pending sofas each, subject to the user's review. These display as Floor 1 / B-3-04 and B-3-05. Do not recompute all bays from SKU totals, move existing goods, change the geometry, or silently drop overflow. Allow a zone to contain multiple categories. A SKU can have multiple actual locations; its old floor/zone is not authoritative stock ownership.

Existing consumers to wire:
- InventoryColumn including module-level TOTAL_UNITS and totals memoized with []
- DetailsPanel, actual movements/history and pending-receipt review entry
- Header status/notification count and fabricated verification timestamps
- Viewport occupancy legend, BaysLayer/hover/empty-bay filtering
- placements.ts and FurnitureLayer, whose current placement memo only depends on floor
- actions.ts and JarvisSession for fresh counts, positions and actual daily activity
Preserve camera, furniture templates, styling, search and browser speech behavior. Update by stable IDs rather than object identity. Remove live use of fabricated history and contradictory DN-2291 summary text. New manual receiving UI should be a small form/drawer using the current components.

Acceptance demonstration:
1. Initial snapshot matches the exact seed totals. Loading/restarting/reseeding does not duplicate them.
2. Editing DN-2291 changes nothing physical; a sales persona cannot post it, even via direct HTTP.
3. Posting four units to 1B23/1B24 changes SOFA-HAVN-2140 from onHand/reserved/available/incoming 12/5/7/4 to 16/5/11/0. Warehouse totals become 531/140/391/95, occupied bays 142/144.
4. All existing quantity/location/history/voice surfaces update consistently without needing a floor toggle. Pending dock units disappear. Every previous stock position stays fixed.
5. Browser reload and a server restart with the same disk database retain the posted result. A second browser refresh sees it.
6. Same-key retry returns the committed result; different-key repost and stale updates cannot duplicate it. Conflicting concurrent capacity requests cannot overfill a bay. A mid-transaction error changes nothing.
7. Backend failure shows loading/stale/error state, never silently falls back to seed quantities.

Verification:
- Add focused Bun service/API tests for the above transactions, authorization, capacity, duplicate posting, version conflict and linked incoming accounting.
- Include disk-database close/reopen persistence verification, not only :memory: tests.
- Run the existing typecheck and relevant build. Walk through the receipt in a browser and check the actual meshes/labels and Jarvis facts; service tests alone are insufficient for stale scene memoization.
- Report what passed, what was observed, and any inability to run a check. Do not claim unseen browser behavior works.

Stay inside Slice 1. Do not implement OCR/LLM extraction, ageing dashboards, sales flows, carrier messaging, payment, complex forecasting, stock transfers/returns, or production identity infrastructure. Do not contact external parties, reset existing data, deploy, commit or push without separate authorization. Use existing dependencies where possible; explain any necessary new dependency.

When finished, provide: files changed, schema/API choices, exact verification commands/results, the demonstrated before/after quantities, material deviations/blockers and review notes. Stop for backend review before starting Slice 2.
```

## Prompt 2 — Review a completed slice before expanding scope

```text
Act as an independent backend reviewer for WareOrb. Review the implemented slice against docs/plans/wareorb-backend-plan.md and the specific coding task, not against unapproved ideas in older documents. Inspect the actual diff and relevant current code. Do not modify application code during this review.

Focus on behavior and evidence:
1. Can a draft, AI result, quote, recommendation or owner approval incorrectly change physical inventory?
2. Are balance, reservation, purchase-outstanding, movement and audit changes atomic and protected against stale versions, duplicate requests and concurrent stock/capacity conflicts?
3. Are source and lot/location identities persistent? Can the renderer reshuffle/drop stock or retain stale counts because of seed imports, module constants, object identity or memoization?
4. Are role checks enforced on the server, including direct requests? Are secrets/evidence kept out of public assets?
5. Do current screens, 3D positions, pending stock, activity and Jarvis agree with the database after mutation, reload and server restart?
6. For later slices, do quotes preserve unknown charges and scope/validity, does approval reserve the exact quoted lot/location allocation, do selected-quote revisions release old holds before reapproval, do material edits invalidate approval, and do replenishment/purchase records remain distinct?
7. Does the implementation remain within the assigned slice and truthful about synthetic data, fixture AI and simulated channels?

Run appropriate existing checks without destructive resets or changing source files. Report actionable findings ordered by severity, with precise file/line references, a concrete failure scenario and the minimum correction. Separate observed defects from untested risks. State whether the slice's acceptance criteria are evidenced, incomplete or failed. Do not call this review proof of production readiness.

Respond in English. Do not commit, push, deploy or contact external parties.
```

## Subsequent slice assignments

After each reviewed slice, issue a fresh bounded task using the full plan and the following scope. Include the common constraints from Prompt 1, the corresponding acceptance criteria in plan section 9, and a request to stop for review.

| Next task | Coding-agent assignment |
| --- | --- |
| Slice 2 | Extend the proven receiving path with private evidence, one server-side extraction adapter, manual/fixture fallback, voice transcript, photo, selected video frames and standard-document capture. All routes converge on the existing draft/posting service. Never let extraction post stock. |
| Slice 3 | Implement explainable lot-age queries, copyable dated sales briefs and the lightweight buyer/delivery request. No CRM or outreach-management subsystem; no reservation yet. |
| Slice 4 | Prepare common cargo/delivery enquiries, record three/four simulated carrier replies, review extracted quote fields and calculate eligible complete-cost comparisons. No actual external sending/booking. |
| Slice 5 | Implement owner decisions, version-bound approval, atomic reservations and exact-shipment dispatch. Preserve stock on approval; reduce it only on confirmed departure. Exercise conflicts, cancellation/edit invalidation and duplicate dispatch. |
| Slice 6 | Implement transparent continuing replenishment advice plus purchase draft/confirmation/cancellation and receipt linkage. Advice is not incoming; incoming is not physical stock. Use reconciled synthetic history. |
| Slice 7 | Verify the integrated synthetic journey, restart durability, failure fallbacks and deployment constraints. Document live/manual/simulated/deferred capabilities without adding new product scope. |

If a slice is not ready, give the coding agent only the concrete review corrections and rerun the affected checks. Do not widen scope to make a failing core flow look more complete.
