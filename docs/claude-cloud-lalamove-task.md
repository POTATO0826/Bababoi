# Claude Cloud task: complete the existing Lalamove sandbox integration

## Objective and branch

Complete the Lalamove quotation experience in WareOrb's **local, accountless presentation demo**.
Reuse the implementation that already exists on `Vince`; connect the unfinished local configuration,
UI and Jarvis paths. Deliver working code and evidence, not another plan or a replacement warehouse app.

Repository: `https://github.com/POTATO0826/Bababoi`

Work from the latest `origin/backend-production`. Reviewed application baseline: `ea79cae`.
Reference branch: `origin/Vince`, fetched at `8f4d6dfe76f257c2f53e16bb03839e194f2f7d8f`.
Fetch both branches and inspect newer commits before proceeding. Do not reset either branch or copy
the old role-simulation/authentication design back into the current app.

Read `AGENTS.md`, `convex/_generated/ai/guidelines.md`, `docs/local-demo.md`, and the shipment rules
in sections 5.1–5.3 of `AdvancedWareorb.md`. Older `HANDOFF.md` describes historical behavior and
targets Vince; this task explicitly targets `backend-production` and the current local demo.

## Independently verified findings

This is not a missing implementation on Vince:

- `origin/Vince` is an ancestor of the reviewed backend branch (their merge base is `8f4d6df`).
- `src/domain/lalamove.ts` has exactly the same Git blob on both branches:
  `543c72fbb2570e0ea5eb8d5918ec551c1b991af7`.
- `convex/lalamove.ts` differs only by the current branch's staff authorization check. It already
  implements signed `GET /v3/cities` and `POST /v3/quotations`, timeouts, service caching and fallbacks.
- `convex/quotes.ts` already has quote storage, deduplication, expiry/reuse and manual carrier replies.
  The current branch adds business/authentication protections that must remain.
- A real read-only call to `api.lalamove.services` on the running local backend at port 3231 returned
  **`source: "fixture"`, 3 vehicles**. The local `.env.local` had neither Lalamove credential set;
  only presence booleans were inspected or printed. No Lalamove order was placed.
- `src/local/demo-runner.ts` provisions the local presenter/agent bridge settings, but has no
  Lalamove configuration flow. Adding a key to the web server environment alone does not configure
  functions that read `env` from the Convex deployment.
- The local Jarvis tool list (`src/local/warehouse-tools.ts`) has only inventory, movements, purchase
  orders and reorder analysis. The hosted `convex/ai.ts` has a `get_delivery_quotes` implementation;
  local Jarvis does not call that hosted agent path.
- The Delivery screen currently shows **"No deals need quotes"** on this Mac and offers no way to
  connect Lalamove or proceed from that empty state. The quote form is inside a deal with buyer details.
- **Reproduced navigation bug:** typing `/delivery` and pressing Enter opens Receive. The menu uses
  substring matching across IDs/labels/keywords; Receive's `delivery note` keyword appears first.
  Actual reproduction: `{ typed: "/delivery", suggestions: ["receive", "delivery"], enterRuns: "receive" }`.
  Clicking the Delivery suggestion directly opens the correct page.
- Vehicle fit currently uses `sku.packages` in `DealDetail`, not the actual measurements entered
  on receipt lines. Receipt posting links a batch to its receipt but does not preserve an explicit
  receipt-line measurement snapshot on the batch. Do not assume those newly measured values already
  drive delivery suitability.

Fresh focused check during this audit: `bun test src/domain/domain.test.ts` passed 21/21. Its Lalamove
case covers HMAC/body/quotation parsing, not a live provider round trip. This audit did not run the
complete check for `ea79cae` and did not make authenticated Lalamove requests.

## Required experience

1. **Discoverable connection.** From Delivery, show Lalamove's connection state and a small setup
   form for **API key + API secret**. Default to **Malaysia / Sandbox**. Use masked fields with labels,
   loading, cancellation and actionable errors. Configuration should work without terminal commands
   or a cloud dashboard. Keep the warehouse accountless and Jarvis's Claude login independent.
2. **A real connection check.** Validate with a signed city/service request. A nonempty key or saved
   fixture is not proof of connection. Display whether vehicles came from Lalamove, a cache, or an
   explicitly selected sample. Never hide missing keys, authentication failures or network errors
   behind a connected badge.
3. **A useful Delivery page.** Explain the required sale/shipment information when there are no
   quotable deals and provide a path to select stock or open/create the corresponding deal. A blank
   list alone is insufficient. Reuse existing deal creation and buyer/address validation.
4. **Correct command selection.** `/delivery` + Enter must open Delivery. An exact command ID must
   win over keyword matches by default; preserve deliberate arrow-key selection, partial search,
   mouse selection, role restrictions and `/login`/`/logout` behavior.
5. **Explicit shipment data.** Show the selected stock, quantity, package count, dimensions, weight,
   pickup/destination coordinates and time, with the source of measurements. Use verified actual
   shipment measurements when available; allow staff to confirm/correct them. A catalogue fallback
   must be labelled as such. Unknown measurements remain unknown and require clarification; never
   become zero or a confident "Fits" result. Handle multiple receipt lines for the same SKU without
   guessing which measurements belong to a batch.
6. **Provider quotations.** Select supported services using the actual cargo and live city metadata,
   then request sandbox quotes through the existing quote workflow. Show the real returned amount,
   currency, breakdown, source, request/expiry times and relevant unresolved extras. Changing cargo,
   route, quantity, schedule or services must invalidate the prior quote through the same versioning
   rules used by the backend. Preserve idempotent/reused requests and bounded rate limiting.
7. **Jarvis can help.** Add narrow, authorized local tools for inspecting a delivery's missing inputs,
   viewing eligible services, requesting quotes and reading results. Reuse the UI's validation and
   quote records. Jarvis should ask for missing details and report actual results with visible tool
   cards; never invent addresses, coordinates, prices, driver offers, measurements or bookings.
   Provider quote requests are the only new external operation; keep stock posting, approval,
   dispatch, ordering, arbitrary HTTP and shell/file access outside its tool permissions.

## Implementation defaults and boundaries

These are proposed implementation defaults for this continuation, not claims that the user has
already tested or selected every detail:

- Follow the web Claude connection's usability: hold web-entered Lalamove credentials only in the
  local server's memory for this run. Refresh retains the connection; stopping the server clears it.
  Include Test connection, Disconnect and reconnect/replacement behavior. A failed replacement must
  not overwrite a working connection. Disconnect stops further requests using the old credentials.
- Bridge the local Convex quote action to that local service if needed, reusing the authenticated
  loopback pattern already used for receipt reading. Use the existing shared domain HMAC/parsing
  helpers and preserve quote ownership, staff roles, version checks and audit records. Do not put
  the web-entered secret into Convex records or cloud environment variables to work around the boundary.
- Keep this bridge local-only: exact permitted origins/hosts, authenticated backend access, bounded
  request bodies and timeouts, no-store responses and redacted errors/logs. No secret in browser
  storage, URLs, chat, tool arguments/results, generated frontend files or Git. Mask both fields;
  accidentally pasted credentials in normal chat must not be sent to the model or retained.
- Use explicit allowlisted Lalamove sandbox endpoints and `MY`; no arbitrary URL proxy or silent
  switch to production. Cache by the relevant environment/market and invalidate connection-dependent
  state when credentials change/disconnect. A stale cache cannot imply that credentials are connected.
- Real API failures must be shown as failures. Existing saved-demo values may be available through
  a clearly separate, deliberate demo action; they must not masquerade as successful API calls.
- This milestone is **sandbox quotation only**. Do not call `/v3/orders`, charge money, book a driver,
  create tracking/webhook flows or change production deployments. Keep sandbox/demo records visibly
  labelled and preserve existing restrictions on using them for actual-sale approval.
- Preserve human confirmation of physical fit and unknown additional charges. A bounding-box/volume
  check is an estimate, not a guarantee of furniture loading or stacking.
- Add fields/references only where necessary and keep existing receipts, batches and deals readable.
  Do not reset the user's local data or merge in the old SQLite implementation.
- Keep the Jarvis branding work, web Claude login/logout, local isolation and the empty public Clerk
  key bundle fix. Windows startup compatibility is a separate pending issue; do not bundle a runtime
  migration into this feature.

## Provider documentation

Check the current official reference: [Lalamove API v3](https://developers.lalamove.com/).
Its Get City Info endpoint supplies service codes/capacities; the quotation endpoint supplies prices.
The optional `item` feature is currently documented for Thailand, Vietnam and Hong Kong China, not
Malaysia. Keep cargo measurement/vehicle eligibility in WareOrb rather than sending invented MY
weight/dimension pricing parameters. Keep the returned expiry instead of fabricating quote validity.

## Tests and delivery

Add meaningful tests for:

- Exact `/delivery` selection, partial suggestions and intentional keyboard selection.
- Valid, invalid, missing and cancelled/replaced credentials; refresh, disconnect and reconnect;
  no credential leakage; safe origins/bridge authorization; independent Claude/Lalamove connections.
- Cities/vehicle parsing from representative provider responses, unit conversion, missing capacities,
  overweight/oversize/unknown cargo and measurement provenance from received stock.
- Signed quote calls, real price/expiry parsing, unsupported route/service, 401/403, 429, network
  timeout, cache invalidation, quote freshness, concurrent clicks and no silent fixture substitution.
- UI and Jarvis returning the same stored result and refusing incomplete shipments. Tests must assert
  that no order/booking endpoint is ever called. Label mocked provider evidence explicitly.

Run `bun install --frozen-lockfile` and `bun run check`. Verify the complete app where possible, not
just isolated components. If Cloud cannot run the local Convex binary, use the available harness and
state the limitation, leaving exact Mac acceptance steps. Do not claim a live Lalamove check unless
it actually succeeded with authorized credentials; do not reuse keys from chat history or ask for
secrets in chat. The operator enters their current sandbox credentials in the local page.

Mac acceptance path: connect Sandbox MY → select a real local stock/deal → confirm cargo and route →
retrieve at least one actual sandbox quote → compare UI/Jarvis result → change a shipment input and
observe invalidation → test missing/invalid key and unsupported cargo → disconnect and confirm later
requests are refused. Keep original inventory counts unchanged throughout quote-only tests.

Update `docs/local-demo.md`, scan the explicit staged diff for secrets, commit and push to
`origin/backend-production` without force pushing. Report the pushed commit, reused Vince code,
changes, test results, and which live checks remain. Do not touch the original Mac checkout, video
work, shared cloud databases or other agents' uncommitted changes.
