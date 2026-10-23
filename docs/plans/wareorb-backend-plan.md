# WareOrb backend implementation plan

Date: 23 October 2026 (Asia/Kuala_Lumpur)

Status update, 24 October 2026: Slice 1 and its review repairs are implemented and verified on `backend`; later slices remain planned. See the [review and integration decision](../reviews/wareorb-slice-1-review.md) before assigning further work.

Application baseline: `f14ac31` (`Feat: UI added`)

Product revision: `2026-10-23-complete-warehouse-workflow`

## 1. Scope and authority

The intended operating loop is receiving capture → human verification and posting → ageing-stock visibility → product/stock brief for human salespeople → buyer and delivery details → comparable carrier quotations → owner decision → physical dispatch → continuing replenishment advice.

This plan covers the backend and the minimum connections needed for the existing warehouse interface to display its records. Preserve the warehouse, camera, furniture meshes, inventory search and useful Jarvis interactions. Add small operational forms/drawers using existing components; do not undertake a frontend redesign.

The user's supplied requirements and current clarification govern this plan. The research checkout's `knowledge/candidates/wareorb-capacity-reallocation.md`, revision above, supplies context. Earlier concept documents and reviews do not override the latest request. In particular:

- Retain voice, handwritten photo/video-frame capture and standard business-document entry into one receiving draft.
- Salespeople use their own contacts and groups. They return buyer, goods, quantity, price and delivery information. No CRM, performance dashboard, mandatory follow-up reports or competing-offer engine.
- Replenishment is ongoing advice. Clearance approval does not require a replacement-profit calculation or an AI profit veto.
- AI extracts and explains. Application services validate, calculate, reserve and post stock.
- Synthetic data and explicitly simulated external channels are the default demonstration boundary. No payments, real carrier bookings or unsolicited external messages.

All architecture choices below are recommendations, not previously approved user decisions. The accompanying [coding-agent prompts](wareorb-backend-agent-prompts.md) stage implementation and review; this planning task does not authorize executing them.

## 2. Current project assessment

### Verified baseline

| Area | What actually exists | Backend implication |
| --- | --- | --- |
| Runtime and dependencies | [package.json](../../package.json): Bun, TypeScript, React 19, Zustand 5, R3F/drei/Three, Tailwind 4; committed `bun.lock`. Local Bun reports 1.4.3. | Extend this stack; no reason for a second language, framework or frontend migration. |
| Server | [src/index.ts](../../src/index.ts) uses `Bun.serve`, port from `PORT`, and an HTML catch-all. | A page server exists, but no business API, authentication, database or stock-writing service exists. |
| Deployment | `dev` and `start` run the Bun source server. [build.ts](../../build.ts) builds browser assets to `dist/`. No tracked container, CI or hosting configuration was found. | A static deployment of `dist/` cannot run the proposed backend. Hosting is not established by this repository. |
| Inventory | [catalog.ts](../../src/data/catalog.ts) builds cyclic Category → Model → SKU object graphs from constants. | Reuse SKU codes, labels, categories, colours and rendering metadata; do not serialize these cyclic objects as API JSON. |
| Positions | [layout.ts](../../src/data/layout.ts) creates `BAYS` once by filling slots sequentially from each SKU's seeded `onHand` and `cap`. | Persist the initial allocation once. Subsequent receipts/dispatches change explicit allocations, never rerun this fill algorithm. |
| UI state | [store.ts](../../src/store.ts) holds selection, camera, voice and settings. | Keep interaction state; add a separate reactive server-data slice and request status. |
| Counts and history | Components import `SKUS`, `CATEGORIES`, `SKU_BY_CODE`, `BAYS`, `PENDING_NOTE`; inventory totals include module-level and empty-dependency memoization. History is fabricated display text. | Updating one count variable will not update the application consistently. All stock consumers need a common backend snapshot. |
| Voice | [actions.ts](../../src/actions.ts) uses browser speech recognition (`en-US`), speech synthesis and keyword matching. | Retain navigation/TTS. There is no LLM, OCR, provider SDK or AI service to extend. |
| Operational UI | Pending-note badge and display, stock detail/history presentation and a movements button exist; no receiving editor or working approval workflow. | These are entry points, not completed workflows. Add the minimum forms and connect the existing affordances. |
| Verification | `bun run typecheck` passed during planning. No tracked test suite or test script found. | Add focused service/API tests when implementing. This baseline is not a runtime/browser test. |

The old design handoff recommends React 18/Vite and mentions 38 SKUs. The actual repository uses React 19/Bun and **43 SKUs**. Actual code takes precedence.

A read-only execution of the current seed/layout modules produced:

| Scope | On hand | Occupied / total bays |
| --- | ---: | ---: |
| Floor 1, A | 52 | 18 / 18 |
| Floor 1, B | 45 | 15 / 18 |
| Floor 1, C | 108 | 18 / 18 |
| Floor 1, D | 36 | 18 / 18 |
| Floor 2, A | 34 | 17 / 18 |
| Floor 2, B | 90 | 18 / 18 |
| Floor 2, C | 108 | 18 / 18 |
| Floor 2, D | 54 | 18 / 18 |
| Total | **527** | **140 / 144** |

Reserved = **140**, available = **387**, incoming = **99**. All seeded units map to bays; none are currently truncated. All occupied bays are at their SKU's configured capacity. The four empty location IDs are `1B23`, `1B24`, `1B25`, `2A25`. Display code alone is not unique across floors.

Two inconsistencies must disappear during integration:

1. `DN-2291` is pending for four `SOFA-HAVN-2140` units, but seeded history and Jarvis's daily summary also claim it was received. Seed it as pending only; replace both fabricated histories with actual records.
2. “Live”, “Verified 09:42” and the notification count are static. Derive connection status, timestamps and pending counts from the backend; never present fixtures or stale data as verified live records.

## 3. Recommended architecture

### One Bun application with SQLite

Use the existing **Bun/TypeScript process**, same-origin JSON routes under `/api`, **SQLite through `bun:sqlite`**, explicit SQL migrations and a local private directory for source files. Keep a small layering boundary:

```text
Existing React / Zustand / 3D / browser speech
                 ↓ same-origin /api
Bun routes → runtime validation + session/role checks
                 ↓
Application services: receiving, stock, sales, quotes, purchases, analytics
                 ↓
SQLite transactions + private source-file storage
                 ↑
Server-only extraction adapter: live provider OR labelled fixture mode
```

No ORM is necessary for this size. Use parameterized SQL and shared runtime validators with exported TypeScript DTOs; TypeScript types alone are not input validation. Do not introduce Redis, queues, event sourcing, microservices, a general workflow engine or forecasting infrastructure.

This recommendation uses capabilities already supported by Bun: [HTTP method/parameter routes](https://bun.sh/docs/runtime/http/server) and the [built-in SQLite driver and transactions](https://bun.sh/docs/runtime/sqlite). These official references were checked during planning. Test implementation against the project's pinned runtime; do not upgrade dependencies just to match the documentation site.

Suggested files, created only during implementation:

| Boundary | Suggested location |
| --- | --- |
| Wire contracts and pure validation/calculation types | `src/shared/` |
| Route composition and server configuration | `src/server/`, wired from existing `src/index.ts` |
| Database, versioned SQL migrations and explicit demo seeder | `src/server/db/` |
| Transactional business services and read queries | `src/server/services/` |
| Extraction/provider boundary and fixture adapter | `src/server/ai/` |
| Private source storage | `src/server/storage/` |
| Fetch client and reactive snapshot selectors | `src/lib/api.ts`, a server-data store alongside `src/store.ts` |
| Service/API tests and synthetic fixtures | `tests/` |

### Persistence, hosting and consistency

- Start with one warehouse, one Bun process and one local SQLite file on a persistent disk. Suggested environment: `DATABASE_PATH`, `UPLOAD_DIR`, `DEMO_AUTH`, `AI_MODE`, server-only provider credentials and the existing `PORT`.
- Keep database files, WAL/SHM sidecars and uploaded evidence outside public/static directories and out of Git. Run explicit schema migration/seed commands; application startup must not reseed or reset stock.
- Use foreign keys, WAL, a bounded busy timeout and short write transactions. Lock before checking stock with `BEGIN IMMEDIATE` or the equivalent Bun transaction mode. Never hold a transaction across model/network calls.
- Read each warehouse snapshot in one database read transaction. Maintain a monotonically increasing `snapshotRevision` in the same transaction as changes affecting its contents.
- Inventory writes update balances, business state, movement rows, actor/activity records and idempotency results together. An error rolls everything back.
- Do not scale this file-backed deployment across instances or ephemeral/serverless disks. If the chosen host lacks persistent storage, revisit this architecture before deployment; do not silently fall back to browser memory.
- Initial hosting can run the existing source-based `start` command with its required locked dependencies and writable persistent storage. The browser-only `build` output remains insufficient on its own. Verify restart persistence in the chosen deployment. Production packaging can be improved separately.

### Small, explicit permission boundary

Use configured synthetic users with `owner`, `warehouse` and `sales` roles. In explicit `DEMO_AUTH=1` mode, a labelled persona selector obtains an opaque same-origin session cookie from the server. The server maps the session to the configured role; requests cannot supply their own authoritative `actorId` or role. This is simulated authentication with real server-side authorization checks, not production login.

| Role | Allowed changes |
| --- | --- |
| Warehouse | Create/edit receiving drafts, verify/post receipts, create/correct descriptive catalogue and cargo metadata, confirm an approved dispatch, prepare/review quote data. Correcting a selected quote invalidates its approval as specified below; this is not permission to approve or commercially cancel a sale. |
| Sales | Prepare stock briefs and create/edit their buyer/delivery requests before approval. No stock posting or owner decisions. |
| Owner | Review/revise/reject/approve/reopen/cancel sales, release reservations through those actions, confirm/cancel incoming purchases, maintain policies/catalogue and perform warehouse actions. Commercial sale cancellation is owner-only. |

Use same-origin checks on mutations, HttpOnly cookies, and Secure cookies under HTTPS. Session state may be in process memory for the demo; a restart requires selecting a persona again, while business records remain persisted. Turn off demo-session issuance outside demo mode and fail closed until real authentication is configured. A publicly accessible real deployment needs an identity solution; it is not part of the first vertical slice.

## 4. Minimal data model

### Shared conventions

- Stable IDs, foreign keys, timestamps and actor IDs. Use existing SKU code as the unique product key. Use `{warehouseId, legacyBayId}` as the location identity, retaining `floor`, `zone`, zero-based row/index and existing display code.
- Quantities are positive integers in one base unit per SKU for this furniture demo (`piece` or an explicitly defined `set`). Do not infer cartons-to-pieces conversions. Distinguish replenishment pack multiple from shipping packages.
- Money is integer minor units with a currency, initially MYR. Do not mix currencies or infer exchange rates. Dimensions are packed length/width/height in millimetres; mass is grams; missing values are `null`, not zero.
- `receivedOn` is a verified warehouse-local date. Event timestamps are UTC; “today”, age and report windows use the warehouse's `Asia/Kuala_Lumpur` timezone. Store `occurredAt` separately from `recordedAt` where needed.
- Mutable business documents have a `version`. Snapshots use plain IDs and JSON-safe values, never Category/Model/Sku object cycles. Evidence/extraction and approval snapshots may use schema-validated JSON; stock quantities and relationships use relational rows.

### Core records

| Record | Essential fields and relationships |
| --- | --- |
| `warehouse_settings` | Warehouse ID/name/timezone/currency, geometry version, `snapshotRevision`, `observationStartedOn`, default ageing/inactivity/window/coverage settings. One row initially. |
| `product` | `sku`, category ID/label, model name, variant, colour, furniture `kind`, `doors`, `unitsPerBay`, base unit, optional packed dimensions/mass, replenishment pack multiple and optional policy overrides. Seed floor/zone become navigation preferences, not stock ownership. |
| `location` | Warehouse + legacy bay ID, floor, zone, row, index, code, rectangle and enabled flag. Geometry is fixed for this version; no location-design editor. |
| `source_asset` | ID, input kind, private storage key or transcript/text, original filename/MIME/size/hash, capture group, optional frame timestamp, creator/time. Source references are checked for session access. |
| `extraction_run` | Target kind/ID, source IDs, provider/model/prompt version, status, bounded raw response, parsed candidate JSON, per-field source references/warnings, start/end/error. A run proposes values; it is not an approval. |
| `receiving` | ID, supplier/reference, document number, source IDs, status `draft/posted/cancelled`, version, reviewer/time, recorded date. Unique nonempty supplier+document reference within the warehouse prevents reposting the same note. |
| `receiving_line` | Receiving ID, product SKU (nullable only while unresolved), actual counted quantity, base unit, `receivedOn`, optional confirmed purchase-line link, packed cargo snapshot, proposed location allocations. Posting requires resolved SKU/unit/count/location. |
| `stock_lot` | ID, posted receiving-line ID, SKU, original `receivedOn`, cargo snapshot. Multiple receipts of the same SKU remain distinguishable. |
| `stock_balance` | Lot ID + location ID, nonnegative `onHand`. Multiple lots of the same SKU may occupy one bay; different SKUs may not share a bay in v1. |
| `stock_movement` | ID, lot/location, signed quantity, kind (`receipt`, `sale_dispatch`, `demo_opening`), source record/line, actor, occurred/recorded time, synthetic-data marker. Synthetic sales history uses `sale_dispatch` with that marker so the same query works; `demo_opening` is never a sale. Immutable operational ledger, written with balance changes. |
| `activity` | Entity/type/ID/version, action, actor/time, reason and small before/after or decision metadata. Records reservations/decisions without pretending they are physical movements. |
| `idempotency_result` | Warehouse+actor+action+key, request hash and committed result. Unique key; same request replays, different payload conflicts. Persist for the lifetime of this demo dataset. |

### Sales and transport records (add in later slices)

| Record | Essential fields and relationships |
| --- | --- |
| `sales_brief` | ID, creator, creation time, selected SKUs/optional lots, stock snapshot revision, product/age/location facts and copyable text. No required assignment/follow-up lifecycle. It is a dated brief, not a commitment of stock. |
| `sale_request` + `sale_line` | Buyer name/contact, salesperson, optional brief link; destination/postcode, delivery window, floor/lift/access/unloading requirements; lines with SKU, optional requested lots, quantity and unit price; currency, freight payer, buyer freight charge and other merchant costs; status `draft/approved/rejected/cancelled/dispatched`, version. |
| `carrier` | ID, synthetic display name/contact and supported-service notes. Seed three or four cooperating carriers; no carrier marketplace. |
| `quote_enquiry` | Sale ID/version, proposed exact lot/location/quantity allocations, cargo/delivery fingerprint, immutable shared enquiry snapshot with package-to-allocation mapping, selected carrier IDs, creator/time, channel `simulated/manual-export`. Proposed allocations do not reserve stock. No actual send operation in this scope. |
| `carrier_quote` | Stable quote ID + version (unique pair), enquiry+carrier, source reply, state `draft/verified`, parsed and corrected structured fields, charge components, service suitability/conditions, validity, delivery timing, coverage/exclusions, reviewer/time. Verified versions are immutable; a revision supersedes the previous version. Only the latest verified version of a quote is eligible. |
| `owner_decision` | Sale/version, decision/reason, selected verified quote version, cargo fingerprint, immutable sale/charges/delivery/allocation snapshot, actor/time. Edits produce a fresh decision, never overwrite the previous one. |
| `reservation` | Sale/decision + lot/location, original quantity, remaining quantity, status `active/released/consumed`, actor/time. For initial seeded reservations only, allow an explicit `demo_opening_booking` source/reference instead of a sale ID. |
| `dispatch` + `dispatch_line` | Sale/decision, confirmed actor/time, actual lot/location quantities, movement links. One complete shipment per approved sale in v1; unique sale ID prevents duplicate dispatch. |
| `purchase` + `purchase_line` | Supplier/reference, status `draft/confirmed/cancelled`, version, confirmed actor/time; SKU, ordered quantity, cancelled outstanding quantity, expected receipt date and optional recommendation snapshot. Received quantity is derived from posted linked receiving lines. |

No persisted analytics table is necessary. Ageing and replenishment results are deterministic queries with their inputs, as-of time, policy and snapshot revision. Saving a purchase can attach a copy of the advice used; viewing advice creates neither a purchase nor stock.

### Invariants and state changes

```text
SKU.onHand    = sum(stock_balance.onHand)
SKU.reserved  = sum(active reservation.remainingQuantity)
SKU.available = onHand - reserved
SKU.incoming  = sum(confirmed ordered - posted received - cancelled outstanding)
bay.occupied  = sum(onHand at that location) > 0
```

Enforce `0 ≤ reserved ≤ onHand` at every lot/location, not only the SKU total. A bay is free only when its physical balance is zero; reservation/cancellation never changes occupancy. Sum of lot balances at a bay must not exceed the occupying SKU's configured `unitsPerBay`. This is a configured demo slot rule, not a measured engineering/load-safety assertion. Rendering dimensions are not cargo dimensions.

| Action | Transactional outcome |
| --- | --- |
| Create/edit/extract a receiving draft | No stock, reservation or incoming change. |
| Post receiving | Recheck draft version, quantities, locations/capacity, date/unit/SKU and duplicate reference. Create lots, balances and receipt movements; mark posted. If linked to a confirmed purchase line, reduce its outstanding quantity by the received amount. Reject over-receipt against that line. |
| Confirm a purchase | Increase incoming through confirmed outstanding rows only. No physical stock. Cancelling unreceived remainder reduces incoming; past receipts stay intact. |
| Save buyer information / prepare enquiry / record quote | No stock change. Quotes are tied to cargo/delivery scope, not to arbitrary text summaries. |
| Approve sale | For a draft sale, recheck selected quote version/validity, reviewed sale version and the exact lot/location quantities frozen in its enquiry. Recompute and match cargo/delivery scope. Reserve those allocations and save the decision atomically; never silently substitute a different lot. On-hand/occupancy unchanged. |
| Edit approved sale | Before dispatch, release that sale's unconsumed reservations, invalidate approval, increment version and return to draft in one transaction. Cargo/destination changes require a new enquiry; price-only edits may reuse a still-valid quote for an identical cargo/delivery fingerprint. |
| Reopen / revise selected quote | Owner reopening, or creating a correction/renewal version of the selected quote, invalidates approval, releases that sale's unconsumed reservations and returns it to draft atomically. Old decisions/quote versions remain inspectable. A fresh approval creates new holds only after availability and scope are rechecked. |
| Reject/cancel | Record reason and release any reservations. No physical movement, booking or payment. A rejected draft can be revised; a cancelled request is terminal. |
| Confirm dispatch | Require current approved decision and matching exact allocations; decrement physical balances and consume reservations together; append movement/dispatch/activity rows and mark dispatched. Never count this twice. |

Keep dispatch simple: v1 confirms the complete reviewed shipment. If actual quantities differ, do not post a partial shipment under the original approval. Revise the request to the actual quantity, obtain a matching quote/renewed approval as necessary, then dispatch; any remainder is a separate request. This is a deliberate bounded implementation choice, not a requirement for a multi-collection subsystem. Dispatched documents cannot be edited retrospectively. Transfers, customer returns and correction workflows are deferred; do not expose a generic balance-edit endpoint. Add explicit movement types and return links if those workflows are later authorized, rather than counting them as sales.

### Mapping the current seed into persistent records

1. An **explicit, rerunnable, non-destructive demo seed command** creates the warehouse, 43 products and 144 locations using existing values and stable IDs. A seed marker/version makes reruns a no-op for an already initialized dataset. Never overwrite user-created transactions.
2. Capture the current `BAYS` allocation exactly once into labelled synthetic posted opening receipts/lots and balances. Preserve 527 on hand. Reconcile movement quantities to balances. A normal application read must never import seed counts as live state.
3. Convert 140 reserved units into explicit `demo_opening_booking` reservation rows allocated to free quantities; preserve 99 incoming with labelled confirmed synthetic purchase lines. These rows have clear provenance; do not invent real buyer orders or approvals.
4. Seed `DN-2291` as one editable pending receiving record for four `SOFA-HAVN-2140`, linked to that SKU's four-unit confirmed purchase line. It contributes **zero** physical stock and is not added a second time to incoming. Remove the contradictory fake “Received DN-2291” history from live reads.
5. For the first posting demo, propose two units into `1B23` (F1/B-3-04) and two into `1B24` (F1/B-3-05), both initially empty. Keep every existing placement fixed. F1/A is full: do not silently overflow it or pretend a free sofa bay exists.
6. Zones are navigation regions, not hard category restrictions. Occupancy may become mixed. `zoneCategory` must become a derived category list/neutral mixed-zone label; one SKU may appear in several zones/floors. Show its actual location list and choose a deterministic occupied location for default focus; clicking a bay keeps that bay's focus.
7. All new ages/history are explicitly synthetic fixtures. Set a demo anchor date once on initial seeding and preserve it on restart. Do not copy the fabricated display history into operational facts. Later analytics fixtures may add past receipts/sales only with a reconciled ending balance and explicit synthetic observation period.

## 5. Concrete API contracts

### Common contract

All routes use `/api`. JSON success is `{ data, snapshotRevision? }`; errors are `{ error: { code, message, fields?, currentVersion? } }`. Use `400` for malformed requests, `401/403` for session/role failures, `404` for missing resources, `409` for stale version/state/idempotency or stock conflicts, `422` for business-field validation, and `503` for an unavailable extraction provider/database.

Every document mutation supplies `expectedVersion` after creation. Posting, approval, dispatch, purchase confirmation/cancellation, sale cancellation/reopening and quote revision also require `Idempotency-Key`. Check a committed matching replay **before** rejecting the old version. In addition, unique business constraints stop duplicates with a different key (one post per receiving, one dispatch per sale, unique document reference). Store the idempotency result in the same transaction as the action. Authentication/authorization is still checked on replay.

Mutation responses identify the changed records and resulting revision; clients refetch the warehouse snapshot. Never optimistically alter committed quantities. Unknown `/api/*` paths return JSON 404, not the HTML application catch-all.

Applying the same uploaded source again should reuse or link its existing draft, not create another receipt silently. Check exact source hashes/groups and normalized supplier/document references on draft creation and posting; return the existing record or a duplicate conflict. An identical file hash is evidence of duplication, not proof that two different photographs are the same delivery. For manual/voice receipts without a document reference, display that weaker duplicate-detection coverage; idempotent posting still applies. Do not build a general document-matching engine.

### Warehouse, identity and receiving

| Method and path | Essential input → output | Consumer |
| --- | --- | --- |
| `GET /health` | No input → `{ready, databaseReady}`; no secrets. | Deployment readiness. |
| `GET /session` | Cookie → configured user, role, demo flag; 401 when absent. | Small persona/status control. |
| `POST /demo/session` | Configured synthetic `userId` → session cookie and role, only in demo mode. | Labelled demo persona selector. |
| `GET /settings`; `PATCH /settings` | Read policy/timezone defaults; owner-only `{expectedVersion, policies}` update → persisted policy version. Geometry/warehouse identity are not editable here. | Analytics assumptions; no settings UI is required in Slice 1. |
| `GET /warehouse` | No required filters → one consistent snapshot: products with global quantities, locations, per-location SKU/quantity, floor totals, pending-receipt summaries, as-of time/revision. | InventoryColumn, DetailsPanel, header, viewport legend, BaysLayer, FurnitureLayer, navigation and Jarvis. |
| `GET /products/:sku` | SKU → product, totals, locations and lots with received dates/cargo. | Selected product detail; receiving matching and sales selection. |
| `GET /products/:sku/movements?cursor=&limit=` | Bounded cursor → dated movement rows and next cursor. | Existing history and “View stock movements” affordance. |
| `POST /products`; `PATCH /products/:sku` | Validated descriptive/render/cargo metadata, version for updates → saved product. No count fields. | Minimal catalogue correction/create form from unresolved receiving; owner/warehouse. Unknown rendering kinds fall back to `carton`. |
| `POST /sources`; `GET /sources/:id` | Multipart allowed image/PDF or JSON transcript/text, optional frame group/time → ID/hash/private preview reference; GET checks session access. | Receiving evidence viewer and carrier reply entry. |
| `GET /receivings?status=`; `GET /receivings/:id` | Optional status / ID → summaries or full editable draft, evidence, warnings and linked extraction-run summaries. | Pending badge, receiving list/drawer. |
| `POST /receivings` | `{supplierRef?, documentRef?, sourceIds?, lines?}` → draft ID/version; unresolved lines allowed. | Manual, voice, visual and business-document capture converge here. |
| `PATCH /receivings/:id` | `{expectedVersion, supplierRef?, documentRef?, lines}` including SKU/count/date/unit/purchaseLineId/cargo/allocations → revised draft and validation issues. | Human review form; corrections are recorded. |
| `POST /receivings/:id/extractions` | `{expectedVersion, sourceIds}` → saved run ID, candidate lines and field evidence/warnings. No automatic overwrite of current draft. | “Extract” action; user applies candidate via PATCH. |
| `GET /extractions/:id` | Run ID with target access check → saved status, candidate, warnings and evidence references. | Restore receiving/quote review after reload; raw provider output remains server-side for diagnostics. |
| `POST /receivings/:id/post` | `{expectedVersion, actualGoodsChecked: true}` plus idempotency key → posted receipt, movement IDs and revision. Server uses saved reviewed lines. | Explicit authorized “Confirm receipt” button. |
| `POST /receivings/:id/cancel` | `{expectedVersion, reason}` → cancelled draft. Posted receipts cannot be cancelled this way. | Receiving drawer. |

`GET /warehouse` example shapes (illustrative, not the entire payload):

```json
{
  "data": {
    "asOf": "2026-10-23T08:00:00Z",
    "products": [{"sku":"SOFA-HAVN-2140","categoryId":"sofas","modelName":"L-Shaped Sofa","variant":"Grey","kind":"sofaL","unitsPerBay":2,"onHand":12,"reserved":5,"available":7,"incoming":4}],
    "locations": [{"id":"1B23","floor":1,"zone":"B","code":"B-3-04","sku":null,"quantity":0}],
    "pendingReceivings": [{"id":"receiving-dn-2291","documentRef":"DN-2291","status":"draft","version":1}]
  },
  "snapshotRevision": 1
}
```

A receiving line ready to post contains:

```json
{
  "sku": "SOFA-HAVN-2140",
  "quantity": 4,
  "unit": "piece",
  "receivedOn": "2026-10-23",
  "purchaseLineId": "demo-po-sofa-havn-2140-line-1",
  "cargo": {"lengthMm": null, "widthMm": null, "heightMm": null, "weightGrams": null},
  "allocations": [{"locationId":"1B23","quantity":2},{"locationId":"1B24","quantity":2}]
}
```

Missing cargo measurements do not block valid receiving; they create visible transport-preparation gaps. Required counts, actual receipt date and allocations do block posting if unresolved.

### Sales, quotes and owner control

| Method and path | Essential input → output | Consumer |
| --- | --- | --- |
| `GET /analytics/ageing` | Optional bounded age/inactivity thresholds → lot-level flags, quantities, actual positions and calculation inputs. | Small ageing list linked to warehouse selection. |
| `POST /sales-briefs`; `GET /sales-briefs/:id` | Selected SKUs/lots → saved factual snapshot and copyable brief, creation time and stock revision. | “Prepare sales brief”; human copies to their existing channel. |
| `POST /sales`; `GET /sales?status=`; `GET /sales/:id` | Buyer/contact, lines/prices, destination/access/window, cost/payer details, optional brief → draft/list/full request with version. Full reads include current decisions/reservations and enquiry/quote summaries. | Lightweight buyer/delivery form and owner/warehouse work list. |
| `PATCH /sales/:id` | Expected version plus changed commercial/delivery/line fields → new version, cleared approval/reservations when applicable, quote-refresh requirement. | Sales edits own unapproved requests; owner edits approved requests. |
| `GET /carriers` | No input → configured synthetic cooperating carriers. | Enquiry carrier picker. |
| `POST /sales/:id/enquiries` | `{expectedVersion, carrierIds, allocations?, cargoPackages, pickup, delivery}` → immutable common enquiry, exact proposed allocations, fingerprint and one manual/simulated copy per carrier. Default proposed allocations use oldest eligible free lots; staff may choose others before freezing the scope. | Merchant reviews enquiry for roughly three or four carriers. |
| `GET /enquiries/:id`; `GET /quotes/:id?version=` | ID and optional quote version → saved scope/proposed allocations or latest/requested quote, source references and extraction summaries. | Reload enquiry/quote review without losing manual or extracted data. |
| `POST /enquiries/:id/quotes` | `{carrierId, sourceIds?, replyText?, fields?}` → draft carrier quote. | Paste/upload a reply or enter it manually. |
| `POST /quotes/:id/extractions`; `PATCH /quotes/:id` | Source IDs / expected version and corrected fields → candidate extraction / revised quote. | Quote review with original reply alongside fields. |
| `POST /quotes/:id/verify` | `{expectedVersion}` → immutable verified version plus completeness/eligibility results. | Human confirms the interpreted reply; verification alone does not make an incomplete quote eligible. |
| `POST /quotes/:id/revisions` | `{expectedVersion, reason}` plus key → new latest draft version, copying prior fields for correction/renewal. Supersedes the old version and atomically reopens/releases any currently approved sale selecting it. | Owner/warehouse records changed selected terms; old approval cannot remain dispatchable. |
| `GET /sales/:id/comparison` | Sale ID → quote versions, complete totals or null, missing conditions, feasibility, expiry, recommended eligible option and owner cost preview. | Carrier comparison and owner review drawer. |
| `POST /sales/:id/decision` | `{expectedVersion, decision:"approve"|"reject", quoteId?, quoteVersion?, reason?}` plus key → decision snapshot and reservations on approval. | Owner's explicit decision on a draft request; reserve the exact enquiry allocations, with no implicit FIFO substitution at this point. |
| `POST /sales/:id/reopen` | `{expectedVersion, reason}` plus key → draft sale, invalidated approval and released reservations. | Owner reopens an approved sale to renew/switch its selected quote or revise the shipment. |
| `POST /sales/:id/cancel` | `{expectedVersion, reason}` plus key → terminal cancellation and released reservations. | Owner-only cancellation before departure. |
| `POST /sales/:id/dispatch` | `{expectedVersion, decisionId, allocations:[{lotId,locationId,quantity}], actualGoodsLeft:true}` plus key → immutable dispatch, movement IDs, updated quantities/revision. | Warehouse confirmation. Exact approved shipment only. |

Source of cargo: confirmed product/lot packed measurements plus operator-confirmed package counts, pickup location and buyer access conditions. Record packaging explicitly; total weight is `sum(packageCount × packageWeight)` and volume is `sum(packageCount × L × W × H) / 1e9` in cubic metres when dimensions are millimetres. Never multiply both SKU count and package count for the same packages. Do not derive road distance from coordinates; supply address/postcode and a labelled manually entered distance only if known.

Each enquiry freezes one cargo/delivery scope and proposed exact allocation shared by all selected carriers. The packages map to those lot/location quantities, and their quantities must reconcile to the requested goods. No reservation is created at enquiry time. At approval, recheck the same allocation and its cargo snapshot under the stock write transaction. If it is no longer available, return a stock conflict; do not substitute a differently packed lot. Choosing different lots/positions requires a new enquiry/fingerprint and carrier reconfirmation. This is a simple requote path, not a competing-offer subsystem.

Each quote records currency, charge components, collection/delivery timing, valid-until time, required access/unloading, any vehicle constraints, insurance/compensation terms and exclusions. Charge components are `priced`, `included`, `not_applicable` or `unknown`; required services explicitly excluded without a priced alternative remain gaps. `included` contributes zero additional charge, with a reference to its covering line. Sum priced components in application code; do not double-count a carrier's summary total as another charge. Unknown tax/surcharge/required unloading means `completeTotal = null`, not zero.

Only quotes confirmed as suitable for the same fingerprint, with resolved required charges/conditions, the same currency and valid timing, enter lowest-total comparison. Show excluded quotes and reasons. Missing cargo measurements must be supplied or explicitly accepted as unnecessary for this scope in the reviewed carrier reply; an AI guess cannot resolve the gap. The owner may choose another eligible carrier with a reason.

Quote expiry blocks dispatch but retains the existing reservation until the owner reopens/cancels; no background hold-expiry job is needed. Renewing/correcting a selected quote uses the revision endpoint, which immediately supersedes it and atomically invalidates approval/releases its holds, even before the new draft version is verified. A renewed approval is allowed only from draft, rechecks availability and creates fresh reservations; it never stacks them over the old holds. To switch carriers without a quote correction, the owner explicitly reopens the sale first. A new unrelated competing quote does not invalidate the selected version. UI must route a correction of existing selected terms through revision, not disguise it as an unrelated offer. If any invalidation/write fails, the transaction preserves the prior state; dispatch still independently checks expiry, selected latest verified version and current approval.

Owner arithmetic is deterministic: `saleProceeds = sum(quantity × unitPriceMinor) + buyerFreightChargeMinor`; `merchantFreight = carrierTotal` if merchant pays, otherwise `0`; `netRecovery = saleProceeds - merchantFreight - otherMerchantCosts`. If the buyer pays the carrier directly, buyerFreightChargeMinor is zero here. Display the full freight cost and payer either way. This is recovery before historical stock cost, not profit or proof of replacement benefit. For RM1,200 proceeds, RM280 merchant-paid transport and RM20 packing, net recovery is RM900.

### Purchases, analytics and Jarvis

| Method and path | Essential input → output | Consumer |
| --- | --- | --- |
| `GET /analytics/replenishment` | Optional bounded analysis/coverage settings → ranked observed sale rates, on-hand/reserved/usable incoming, suggested quantities, arithmetic, warnings and evidence coverage. | Small replenishment panel and Jarvis explanation. |
| `GET /purchases?status=`; `GET /purchases/:id` | Optional status / ID → pending/confirmed incoming and line balances/dates. | Incoming detail and receiving purchase matching. |
| `POST /purchases`; `PATCH /purchases/:id` | Supplier/ref, product quantities, expected dates, optional advice snapshot; expected version on edits → purchase draft. For confirmed purchases, PATCH accepts expected arrival date plus reason only, not quantity changes. | Owner prepares a purchase or reconfirms arrival timing. Advice itself is not a purchase. |
| `POST /purchases/:id/confirm` | `{expectedVersion}` plus key → confirmed outstanding incoming and revision. No supplier message. | Explicit owner confirmation. |
| `POST /purchases/:id/cancel` | `{expectedVersion, reason}` plus key → cancelled unreceived remainder; preserve past receipts. | Owner incoming correction. |
| `GET /activity?date=&cursor=&limit=` | Warehouse-local date or pagination → actual receipts/dispatches/reservations/decisions and summary totals. | History and “Analyze today's changes”. |
| `POST /assistant/interpret` | `{text, context:{selectedSku?,floor?,zone?}}` → whitelisted navigation or draft intent, factual reply, referenced IDs, as-of/revision; ambiguity candidates or fallback status. | Existing Jarvis session; capture intent opens a receiving draft. No arbitrary tool execution. |

Confirmed purchase lines are immutable except cancellation of remaining quantity in v1; changing an expected arrival date needs an explicit versioned owner update with activity. Draft editing must not rewrite quantities already received. Catalogue changes affecting capacity cannot invalidate existing occupancy; block incompatible reductions. Updating catalogue cargo defaults affects future drafts, not a reviewed lot/enquiry/decision snapshot.

## 6. Existing frontend integration points

This is backend data integration, not a separate interface project.

| Existing consumer | Required connection |
| --- | --- |
| `src/store.ts` and new server-data store | Hydrate one normalized warehouse snapshot. Keep camera/selection separate. States: loading, ready, stale/error. Replace snapshots atomically and discard older revisions/out-of-order responses. |
| `inventory-column.tsx` | Replace `TOTAL_UNITS`, `useMemo(..., [])`, seed categories/counts and static verification time with snapshot selectors. Search metadata can still run locally over loaded products. |
| `details-panel.tsx` | Use live product/location data; load real movement history; pending note opens receiving review rather than merely selecting its SKU. Include actual floor in every location label. |
| `viewport.tsx`, `scene/bays.tsx` | Read immutable geometry plus persisted occupancy. Hover, occupied-bay count and empty-bay filter subscribe to changes. |
| `furniture/placements.ts`, `furniture-layer.tsx` | Pass current occupancy and pending receipts into placement functions. Recompute on the relevant snapshot/occupancy change, not only `[floor]`. Preserve mesh/template/camera code. Pending wrapped units come from receiving drafts, are visually separate and vanish when posted/cancelled. |
| `actions.ts`, `jarvis-session.tsx` | Look up products by stable SKU ID and actual locations; remove object-identity comparisons and hard-coded summary text. Read fresh counts before spoken inventory answers and attach as-of/revision; keep valid local camera commands. |
| `header.tsx` | Real pending count, persona/demo label and connected/stale status. No permanent “Live” or fabricated verification claims. |

Fetch on initial load, after mutation, on tab focus and every approximately 15 seconds while visible. A manual refresh is sufficient as fallback; no WebSocket infrastructure is required. On failure, retain the last snapshot with an explicit stale label and disable stock-changing confirmations until current data is obtained. Never silently replace a failed backend read with static seed data. History/detail caches refresh with the same mutation invalidation.

Multi-location detail must not use `s.floor`/`s.zone` as the only location. The floor's counts sum that floor's balances/reservations, not whole-SKU totals repeated on both floors. Warehouse incoming remains a separate overall amount unless a purchase has a planned destination; do not count it on both floors. Non-contiguous positions should be listed, not described as a continuous bay range.

## 7. AI boundaries, evidence and fallbacks

### Capture paths

| Path | Recommended first implementation | Fallback and boundary |
| --- | --- | --- |
| Voice | Reuse browser SpeechRecognition/TTS for live input, then send the transcript to server-side receiving extraction. Store transcript and locale. | Unsupported/blocked speech → editable typed transcript or receiving form. Keep the existing suggestion buttons; no provider key in browser. |
| Handwritten photo | Upload image, retain original, extract candidate lines with field references/uncertainties. | User corrects the same draft; unknown SKU/unit stays unresolved. |
| Handwritten video | Browser lets staff select up to six readable frames from a short clip, retaining capture-group/frame timestamps; send those images through the same extractor. | Label this “selected video frames”, not continuous video understanding. Multiple frames of one note are evidence for one receipt, not repeated quantities. Full video upload/transcoding is deferred. |
| Standard business document | Manual structured entry plus image/PDF extraction of a delivery note/invoice into the same draft. | PDF text/vision support depends on the selected provider; unsupported formats return a clear error and manual entry. Spreadsheet/ERP connectors are not prerequisites. |
| Carrier reply | Store pasted text or supported attachment, extract charge/condition candidates, then human review/verification. | Manual structured quote editor remains usable if extraction fails. |

Start with bounded synchronous extraction requests: suggest 10 MiB per file, 20 MiB per capture group, six images or a ten-page PDF, bounded transcript/reply text, and a 30-second provider timeout. Validate actual MIME/signature and bounds server-side. Reject unsupported/encrypted/oversized files explicitly rather than truncating their business meaning. Private source downloads use safe content types/disposition; sanitize displayed text, never render untrusted document HTML.

### Deterministic versus model work

The provider adapter exposes narrow operations such as `extractReceiving`, `extractCarrierReply` and `interpretIntent`. Select one supported hosted provider/model during the extraction slice; credentials and all provider calls stay in server-only modules. The current repository gives no evidence for choosing a vendor or assuming access. The first inventory slice has no provider dependency.

The model receives only needed product candidates and evidence. Save raw output, validated candidate and provenance separately from staff-corrected fields. Validate the result against a runtime schema, resolve exact SKU/unit/date/amount references in code, and return uncertainty instead of fabricating values. Treat source text as data: instructions inside invoices or carrier replies cannot grant tool permissions, approve a sale or alter stock.

An extraction run never calls posting/approval/dispatch services. Re-running it cannot overwrite a staff-edited draft: it creates a new candidate, and applying it requires the current draft version. A stale candidate gets a conflict/review message. Network timeout, provider refusal, malformed JSON and unresolved matching all retain the source and editable manual draft. Retry explicitly; do not silently switch to a fixture response and claim it was live AI.

Jarvis uses structured facts from queries for quantities, dates, charge totals and recommendation arithmetic. Simple count/location/summary replies can be deterministic templates. Any generated explanation must use those facts; the server returns a whitelisted navigation target or “open review draft” action, never executable code, SQL or a model-authorized stock mutation. Simulated extraction mode is useful for repeatable tests and rehearsals, but must be visibly labelled.

## 8. Simple analytics rules

### Ageing stock

Recommended starting settings: age threshold `A = 90` days and inactivity window `N = 30` days, configurable by owner. These are demo policy defaults, not validated merchant policy.

For each remaining lot at time `t`:

```text
ageDays = warehouseLocalDate(t) - receivedOn
remainingQty = sum(lot balances)
lastSaleDate = latest confirmed sale_dispatch date for this lot, if any
idleDays = warehouseLocalDate(t) - max(receivedOn, lastSaleDate if present)
ageing = remainingQty > 0 AND ageDays >= A
stagnant = ageing AND idleDays >= N
```

Show both old stock and the narrower stagnant flag. A small recent sale must not hide the age of the remaining lot. Include total/available remaining quantity, actual locations and quantities, receipt date, last sale date, SKU sale volume in the last 30 days, and explanation. If the lot was received 120 days ago with no sale, `ageDays = idleDays = 120`; it is stagnant. If one unit sold yesterday, old remaining units are still ageing but not stagnant.

Represent warehouse pressure as occupied positions and units. “Positions occupied” counts distinct current bays; “positions freed if this allocation is dispatched” counts only bays whose entire physical quantity would leave. Multiple lots sharing a bay must not be summed as separate freed bays. Do not infer true floor area, warehouse-wide capacity gain or profit from stylized mesh dimensions. Reservations affect available quantity, not age or occupancy.

### Continuing replenishment

Recommended defaults: a trailing `W = 30` warehouse-local calendar-day window through the as-of date, lead time `L = 7` days, review coverage `C = 14` days and safety coverage `S = 0`. Target coverage `H = L + C + S = 21` days. Minimum observed history is 14 days; all settings are visible, editable owner assumptions. Use the same inputs and calculation in UI, API tests and Jarvis.

```text
observedDays = min(W, days covered since observationStartedOn, inclusive)
soldUnits = sum(confirmed sale_dispatch quantities in the covered window)
dailyRate = soldUnits / observedDays
targetUnits = ceil(dailyRate * H)
availableNow = onHand - reserved
eligibleIncoming = confirmed outstanding purchase units expected within [today, today + H]
rawNeed = max(0, targetUnits - availableNow - eligibleIncoming)
suggestedQty = ceil(rawNeed / purchasePackMultiple) * purchasePackMultiple
```

Count only confirmed sales dispatches, not reservations, enquiries, owner approvals, supplier receipts, transfers or opening balances. Customer-return entry is outside this version; if introduced later, subtract correctly linked returns and disclose the chosen net-sales convention before using the term “net sales”. Until then, label this metric **recorded dispatched sales** and expose that limitation.

Example: 12 confirmed sale units over 30 recorded days → 0.4/day; target = `ceil(0.4 × 21) = 9`. Five on hand, two reserved → three available. Two confirmed incoming due in the horizon → `max(0, 9 - 3 - 2) = 4`. With a purchase pack multiple of one, suggest **four**, independently of any particular clearance.

If history is shorter than 14 days, return `insufficient_history` with observed facts, not invented demand. Unknown or overdue unconfirmed arrival dates are excluded from eligible incoming, shown separately, and make the recommendation `needs_input` rather than an unqualified order quantity; resolving the dates reruns the rule. If there are no sales during a sufficiently observed period, the basic rule returns zero with that explanation. Stockouts or promotions can bias the rate: show known limitations, do not invent corrected demand. Rank “selling well” by recorded units/day and show the observation window, not an assertion of margin or future growth.

Show current free bays and known slot constraints alongside advice; do not automatically constrain a later purchase by today's free bays or promise future fit. This initial rule does not optimize budget or guarantee revenue/profit. An owner checks timing, space and budget. Recommendations recalculate on request and after relevant receipts, dispatches, reservations or purchase changes; they do not wait for a clearance and require no scheduler initially.

## 9. Ordered implementation slices and acceptance criteria

Implement and review one slice at a time. The complete direction remains all nine workflow stages; slices limit each coding task, not the product definition.

### Slice 1 — Persist one approved receipt in the existing warehouse

Deliver the Bun routes/database/migrations, minimal demo sessions/role checks, source-free manual receiving, seed-to-database mapping, snapshot/stock reads and all existing warehouse consumers. Only implement the inventory/receiving core needed here; seeded purchase/reservation records may be created by the seeder before their later editing workflows exist. Add a small receiving drawer reachable from the pending note. No AI dependency.

Observable acceptance:

1. Explicit demo initialization produces 43 SKUs, 527 on hand, 140 reserved, 387 available, 99 incoming, 140 occupied bays. Reload/restart/reseed do not duplicate anything.
2. Open and edit `DN-2291`; quantities remain unchanged until an authorized human confirms actual goods. Missing counts/date/unit/location or mismatched allocation sum prevents posting. A sales role receives 403 on direct post attempts.
3. Allocate its four sofas to `1B23` and `1B24`, two each. Confirmation changes `SOFA-HAVN-2140` from `12/5/7/4` to **`16/5/11/0`** (on-hand/reserved/available/incoming). Warehouse totals become **531/140/391/95**, occupied bays **142/144**. No existing unit changes location.
4. Counts, details, history, pending dock meshes, notifications, bay hover/legend, mixed-zone label and Jarvis count/daily responses agree without switching floors to force a refresh. The pending item disappears and its real receipt appears once.
5. Refresh browser and restart the server using the same database: all posted facts persist. A second browser sees the result after refresh/polling.
6. Same idempotency key replays safely; a different key cannot repost the document. Stale edits return conflict. Two concurrent attempts to fill the same remaining space cannot overfill it. Injected mid-transaction failure leaves no partial stock, movement or purchase updates.
7. Failed reads display a clear unavailable/stale state; no fallback to seed quantities. Existing search, selection, floor changes, camera, low-stock display and voice navigation still work.

**This is the first slice proving that an approved stock change persists and appears correctly in the existing warehouse.** Do not postpone the scene/data conversion until a later feature slice.

### Slice 2 — Multimodal evidence into that same draft

Add private source storage, extraction runs, one server-only provider adapter, explicitly labelled fixture mode, and receiving capture/review UI. Demonstrate a spoken synthetic receipt, handwriting photograph, selected frames of one handwritten note, and a standard note/PDF. Each reaches the same editable draft and posting service. None posts automatically. Ambiguous SKU/unit, duplicate reference, unreadable input, invalid provider output and timeout have a recoverable manual path. Reload retains source, candidate and staff corrections. Verify that duplicated video frames do not duplicate received units and provider secrets are absent from browser assets/network payloads.

### Slice 3 — Ageing facts, sales brief and buyer return

Add deterministic ageing queries, small attention view, copyable dated product brief, and lightweight buyer/delivery request persistence. Seed explicitly synthetic aged lots with valid receipt dates; show their actual positions. A recent sale distinguishes ageing from stagnant. Salespeople can return buyer/quantity/destination/access/price information without recording their outreach activities. Missing delivery fields are visible for quote preparation. This slice does not reserve or deduct stock.

### Slice 4 — Consistent carrier enquiry and reviewed comparison

Prepare one immutable cargo/delivery scope for three or four seeded carriers. Record manual or synthetic replies; extract/review/version their fields. Compare RM280 including required unloading, RM220 excluding it, and RM300 expired: only the complete valid RM280 option is initially eligible. Unknown fees stay unknown, included charges are not added twice, and different currencies/scopes cannot be ranked together. No messages leave the application. Changing cargo/destination requires refreshed quotes. Source reply and corrected fields remain inspectable.

### Slice 5 — Owner approval, reservation and actual dispatch

Add decisions, atomic lot/location reservations and full-shipment confirmation. Owner approval reduces availability only. A second approval cannot reserve already committed units. If an enquiry's proposed lot becomes unavailable, approval cannot substitute a different lot/cargo under the same quote. Editing/cancelling releases reservations and preserves the audit trail. Quote expiry retains holds but blocks dispatch; selected-quote revision or owner reopening releases holds and requires fresh approval. Test that renewed approval never double-reserves. An unauthorized role, stale version, expired/superseded selected quote or mismatched actual allocation cannot dispatch. Successful dispatch reduces physical quantity, consumes the reservation, frees only actually empty bays and creates one sale-linked movement set. Retry after a lost response cannot create a second movement. Display net recovery as cost arithmetic, not guaranteed profit.

### Slice 6 — Continuing replenishment and confirmed incoming

Add recommendation queries, incoming purchase draft/confirmation/cancellation and receiving linkage UI. Reproduce the four-unit recommendation above. Viewing advice or saving a purchase draft changes neither incoming nor on-hand. Explicitly confirming four raises incoming by four only; receiving two lowers its outstanding incoming by two and adds two physical units only after receipt posting. Cancelling the remaining two leaves prior receipts intact. Too little history and missing arrival dates yield explanations instead of confident forecasts. Use labelled, reconciled synthetic history for demonstration; do not change live seed balances to fake a result.

### Slice 7 — Integrated demonstration and deployment verification

Run the full synthetic journey with a restart mid-flow and a role switch for approval/dispatch. Audit all existing UI/voice consumers for static quantities/history/status. Check database and evidence durability on the intended persistent host, known API errors, limits and unavailable-provider fallback. Document exactly which integrations are live, manual, simulated or deferred. Do not expand the product into authentication infrastructure or external messaging while hardening the demo.

### Verification expected from the coding agent

Use Bun's test runner with temporary, isolated databases. Prioritize behavioral invariants: transaction rollback, duplicate posting, concurrent reservation/capacity checks, approval invalidation, dispatch idempotency, PO receipt accounting, exact analytics and quote completeness. Add route tests for role enforcement and error contracts. Inject clocks and provider adapters for deterministic boundary tests. Include at least one disk-file close/reopen persistence test; an in-memory test alone does not prove persistence.

Run the repository typecheck and relevant build after implementation, and a browser walkthrough of the first receipt/scene integration. Tests of services alone cannot establish that `[floor]` memoization or module constants no longer leave the scene stale. Record actual test commands/results and browser observations; disclose anything untested. Do not add tests that merely reproduce styling or implementation details.

## 10. Bounded demonstration

Use a team-created synthetic dataset, local/demo personas and persistent application state:

1. Start with the known seed snapshot; capture/edit/post `DN-2291`, showing its new positions and persistence.
2. Display an explicitly seeded older lot, its receipt age and occupied bays; produce a sales brief. A teammate plays the salesperson and enters a fictitious buyer request.
3. Show a reviewed common enquiry and three labelled simulated replies with different completeness/validity. Inspect the original text behind the parsed fields.
4. Switch to owner, review proceeds/freight/other costs and approve. Show stock still physically present but availability reduced.
5. Switch to warehouse, confirm actual departure. Show changed quantities, precisely freed bays and movement record; repeat submission to demonstrate safe replay.
6. Show a separately seeded, reconciled selling-history example and the ongoing replenishment calculation. Preparing advice changes no quantities; owner purchase confirmation creates incoming, and later verified receipt creates stock.

| Demonstration element | Truthful label |
| --- | --- |
| Persistence, validation, calculations, authorization checks, reservation and posting | Working application logic against synthetic business data. |
| Browser speech and selected-frame capture | Working browser capture where supported; transcript/manual fallback otherwise. |
| AI extraction | Live configured provider **or** visible fixture mode, explicitly stated for each run. |
| Salesperson, buyer and carrier | Synthetic participants; manual entry/copy or simulator. No real outreach. |
| Orbyte identity/platform connector | Simulated roles/compatibility boundary; no verified platform integration. |
| Payment, transport booking and purchase transmission | Not implemented or executed. Purchase confirmation records an internal commitment only. |

Do not claim that the 3D view senses goods, that extraction confirms physical receipt, that a quote was actually sent, or that demo sales prove commercial impact.

## 11. Material open decisions and chosen defaults

None blocks the first slice.

| Decision | Recommended default now | When it must be resolved |
| --- | --- | --- |
| Hosting/persistence | One Bun process and SQLite/private files on durable local disk. | Before hosting outside local development; ephemeral-only hosting requires a changed storage choice. |
| Live extraction provider/model and language | Adapter boundary; existing browser speech first, manual/labelled fixture mode always available. | Before claiming live voice/vision/document extraction. Confirm supported PDFs/images, target speech locale and credentials. |
| Real identity/external channels | Synthetic demo identities; manual copy/paste/simulated carriers. | Before any real users, buyer data, sending or booking. No production integration is assumed. |
| Merchant-specific policies | Age 90d, inactivity 30d, window 30d, history minimum 14d, coverage 7+14+0d, integer base units, complete shipment per request. | Review against actual merchant practice before real operation; keep these visibly configurable or documented. |

Do not restart a broad product questionnaire, require legacy stock-age reconstruction, or treat unapproved historical review suggestions as scope. The remaining technical details can be settled by the coding agent within these boundaries.

## 12. Planning verification record

- Read the current application files, repository documentation, scripts and deployment-related configuration; no application `AGENTS.md` was found at the repository or inspected ancestor paths.
- Read the current research proposal as context and kept its user clarification separate from older design recommendations.
- Executed read-only seed/layout inspection and the existing no-emit typecheck to establish the baseline. Exact seed totals and location IDs above came from the modules, not the old handoff. A transient in-memory `SELECT` also confirmed that the installed Bun exposes immediate SQLite transactions; it did not create a persisted database or schema.
- No application code changes, dependency installation, migration, persisted database creation, external-party contact, commit or push were part of this planning task.
- Independent backend builder review identified three material gaps: exact quoted-cargo allocation at approval, reservation behavior during selected-quote renewal, and inconsistent warehouse/owner permissions. The plan was revised and re-reviewed; the reviewer reported no remaining blocking contradiction. This was an agent design review, not human approval or an implementation review.
- Document checks passed for relative links, fenced examples/JSON, required sections, seven ordered slices and first-slice arithmetic. Working-tree inspection confirmed that only this plan and its agent-prompts document were added; existing tracked application files were unchanged.
- No implementation acceptance criterion is claimed as passed by this plan. The first-slice checks are requirements for the future coding agent, not tests performed against a backend that already exists.
