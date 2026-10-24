# Claude handoff — WareOrb backend and real-business release

Updated: 24 October 2026 (Asia/Kuala_Lumpur).

## Current instruction

The user now wants Claude to take over implementation and launch. This file is the handoff, not a claim that the application is live. Stop expanding scope; finish the external configuration, verify real authenticated workflows and prepare the release. Communicate in concise Chinese.

The requested outcome is a usable warehouse system with real accounts, server-enforced permissions and durable inventory: receiving → review → stock → sales → verified carrier quotation → owner approval/reservation → actual dispatch → confirmed purchasing → linked receiving. Optional AI and voice must not prevent manual daily use.

## Repository and protected work

- Private repository: `https://github.com/POTATO0826/Bababoi.git`.
- Continue **`backend-production`**, based on latest inspected Vince commit `8f4d6dfe76f257c2f53e16bb03839e194f2f7d8f`.
- Current implementation checkout: `/private/tmp/wareorb-production-6FLaVM`. Read `git status`, `git log -3` and this handoff before editing. The branch will be pushed for remote/cloud access.
- **Do not change `/Users/saou/Documents/codes/Bababoi`, its branch, files, or processes.** Claude/Cloud is concurrently making a video. Use the existing isolated checkout or clone `backend-production` into a new isolated directory. Do not reset, clean, stash or merge unrelated work.
- The older **`backend`** branch contains reviewed Bun/SQLite receiving work (`5708e52`). It is a separate reference implementation, not this release's backend. Do not merge two ledgers. This release keeps Vince's React/3D frontend and Convex.
- The earlier preview clone `/private/tmp/wareorb-vince-preview-OQYPnD` runs the unchanged Vince app at `http://localhost:3220/?ai=0`. It is a shared development/demo preview, not proof of the new release. Keep it available and never reset its data.
- Read `AGENTS.md`, then `convex/_generated/ai/guidelines.md` before Convex changes. Follow the user-approved isolated backend scope over older handoff notes that say to push only Vince.

## Implemented changes

### Identity and staff

Clerk `@clerk/react` + `ConvexProviderWithClerk`, authenticated active staff membership, owner/sales/warehouse. The browser's actor/name/role never grants authority. Ledger subscriptions start only after authenticated membership resolves. Sign-in, access-pending/activation, sign-out, staff invitation, role change, deactivation and pending-invite cancellation/reissue are implemented.

`convex/access.ts` is the authority source. `activate` verifies email ownership through Clerk's backend API. First owner is provisioned by **internal-only** `bootstrapOwner`, bound to the exact Convex token identifier. Public `bootstrapIdentity` reveals only the signed-in caller's own identity to help trusted setup. Last active owner cannot be removed.

Public business queries/mutations/actions, uploads, HTTP voice and provider requests are gated. Scheduled quote/extraction/icon jobs recheck the requesting staff where applicable. The old public Bun `/api/icon` credit-spending endpoint is removed and returns 410. Setup creates settings only; demo seed/reset requires explicit opt-in and stays off in production.

### Receiving and catalogue

`createCatalogItem` creates zero-stock real catalogue metadata with measured packages and entered prices; zero price means unknown. No generated supplier prices or stock.

Every receipt draft write uses an expected version. Receipt details include actual arrival date, supplier/document, actual counted lines, chosen valid bays and explicit optional PO links per line. Posting checks quantities, condition, capacity, occupied/repeated bays, duplicate normalized supplier documents and **every** linked line's SKU against its PO. It aggregates each PO's received quantity atomically and never consumes unrelated same-SKU orders. Receipt-ID retries do not duplicate stock.

Async extraction uses a version/requester guard, never overwrites newer edits and cannot mark counts verified or choose purchase links/locations. Evidence validates storage existence, MIME and size. Voice fallback preserves the original stored recording even without a transcript. The UI retains dirty edits on reactive updates and requires explicit reload on a conflict.

### Sales, logistics and dispatch

Owner can start a sale from any available batch, including a fresh non-ageing warehouse. Buyer, delivery time, destination/access and fit are confirmed. Verified manual carrier replies record reference, full terms, validity and charges. Sandbox/demo/expired/incomplete quotes cannot authorize real stock operations.

Approval reserves exact unreserved bay quantities; it does not dispatch goods or invent a booking. An actual carrier arrangement/reference is recorded separately. Actual per-bay partial/full collections reduce stock once; request IDs retain the original payload for uncertain retries, and remaining quantities stay reserved. Undelivered approved deals can be revised, clearing approval/booking and releasing holds. Closing after partial dispatch releases only the remainder; actual past movements stay recorded.

Deal `version` tracks terms/quote compatibility; `stateVersion` tracks workflow transitions. Close/revise/carrier forms capture both to reject stale intent even if approval changed without a terms change.

### Purchasing, history and delivery tooling

Confirmed supplier orders require supplier, external reference, actual unit cost/date and confirmation. They increase incoming only; duplicate references are idempotent and costs/space are checked. Manual PO entry is available before enough sales history exists. Unknown cost does not become a free-stock recommendation. Production history starts with real recorded observation, not an invented 90-day history.

Receipt/deal history is paginated independently from active stock; >1,000 historical documents no longer disables the overview. Older deals use a protected direct detail query. Other active-ledger bounds fail explicitly instead of returning false balances; see `docs/deployment.md`.

Added `.env.example`, `vercel.json`, production build checks, CI, `bun run check`, frontend-only liveness endpoints and a deployment/backup runbook. Runtime secrets are not present in source. Generated API/env declarations were refreshed locally; real `convex deploy` must regenerate/validate them against the intended deployment.

## Fresh verification and review

Parent independently ran after the final functional edits:

```sh
bun run check
git diff --check
```

Result: **26 domain/voice tests + 48 Convex integration tests = 74 passed, 0 failed**, frontend and backend TypeScript checks passed, production frontend build passed, diff checks passed. Convex integration tests use `convex-test` and mock identities/provider responses; they exercise actual functions and transactional records. They do **not** prove real JWT validation, hosted login or external provider success.

Independent reviewer confirmed no remaining Critical/Important findings in the reviewed code. Review fixes included pending invitation cancellation/reissue, voice evidence loss on provider fallback, historical growth, unstable Zustand selector, document/photo picker race and stale close/revise/carrier form intent. Reviewer also independently reran all 74 tests, both typechecks, diff checks and a production-style bundle.

Local Bun checks confirmed `/healthz` = 200 and removed `/api/icon` = 410. No real logged-in browser walkthrough, hosted deployment, provider request or backup restore drill has been completed. Do not describe the app as launched.

## Cloud facts and outstanding access

Existing shared development deployment:

```text
team: vince-loo
project: wareorb
CONVEX_DEPLOYMENT=dev:admired-swordfish-390
https://admired-swordfish-390.convex.cloud
https://admired-swordfish-390.convex.site
```

The in-app browser has an authenticated Convex dashboard session. Read-only inspection found an existing **Production** deployment:

```text
descriptive-lemur-152
https://descriptive-lemur-152.convex.cloud
https://descriptive-lemur-152.convex.site
```

It displayed **Never deployed**, **No backup yet**, no deploy keys and no configured environment variables in the inspected views. Confirm its current state before any action. Its environment page is:

`https://dashboard.convex.dev/t/vince-loo/wareorb/descriptive-lemur-152/settings/environment-variables`

The user supplied Lalamove **test** credentials and MY sandbox configuration in the conversation. **Values are intentionally absent here, from source files, and from agent prompts.** Do not print them, commit them or embed them in frontend variables. No cloud secrets or deploy keys were saved/generated by this team. There is no authorized cloud credential change pending: the user responded to the last confirmation request by asking for this handoff, which is not approval.

No local Convex deploy key/CLI login, Clerk app configuration or Vercel hosting configuration was available. The first production owner's email/exact authenticated identity was not designated. Do not infer it from demo names or promote the first public signup.

## Finish in this order

1. Read the plan and deployment runbook, inspect branch/diff, rerun `bun run check`. Preserve the isolated workspace and video work.
2. Use the existing dashboard session or user-authorized CLI access to finish setup. If browser rules require approval to create/save credentials, explain the exact operation at that point; do not treat the earlier handoff request as credential approval. Do not expose keys in chat. Check whether the user already has Clerk/Vercel applications before creating anything, and hand off any required terms/payment confirmation.
3. Configure a Clerk application with Convex audience `convex`; backend needs `CLERK_JWT_ISSUER_DOMAIN` and `CLERK_SECRET_KEY`. Frontend needs `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY`. Use production Clerk configuration for the public business site. Confirm the designated owner.
4. Configure the selected isolated production Convex target and Vercel, with production-scoped deploy key and correct public cloud/site URLs. Never deploy this changed schema to the shared development/demo data by accident. Keep demo seed disabled. Lalamove sandbox remains optional; manual confirmed carrier replies support real work.
5. Deploy, then provision the exact first owner through internal `access:bootstrapOwner`. Run a real browser walkthrough with distinct owner/sales/warehouse accounts, including sign-out/reload/revocation and direct unauthorized calls.
6. From an empty business ledger, verify catalogue → receipt → posting → stock → buyer → verified manual quote → approval/hold → actual carrier reference → partial/full collection → confirmed PO → explicit linked receipt. Verify refresh, stale forms, duplicate/retry requests and stock/incoming balances.
7. Verify optional Lalamove sandbox calls without creating paid orders. Keep sandbox outputs labelled and unusable for real approval. Verify AI/voice only when configured, keeping manual fallbacks intact.
8. Take a backup including files and restore into a separate drill deployment. Record actual results. No existing restore success is claimed.
9. Report the real hosted URL and tested boundaries. If setup access remains missing, state exactly what is needed without claiming the app is live. Do not stop at another general plan or prompt.

Useful files: `docs/production-plan.md`, `docs/deployment.md`, `AdvancedWareorb.md`, `convex/access.test.ts`, `convex/receiving.test.ts`, `convex/business.test.ts`, `src/voice/voice.test.ts`.
