# Business deployment

This branch uses the Vince Convex ledger. The older `backend` SQLite implementation is a separate branch. Work has been performed in an isolated checkout; the original checkout and current shared preview are not deployment targets.

## Choose the target

Prepare a separate business production deployment in the existing `vince-loo/wareorb` Convex project, or a dedicated project. Do not deploy this branch to the shared `dev:admired-swordfish-390` demonstration database. Start production with empty business records. Existing synthetic inventory is not opening stock.

The prepared hosting configuration uses Vercel with Bun and a static frontend. It does not create accounts, hosting resources or a domain. Connect the `backend-production` branch only after review; set it as the intended production branch explicitly. Preview builds require their own isolated Convex deployment/key. Never give a preview build a production deploy key.

## Identity and environment

Create a Clerk application, enable its Convex integration with audience `convex`, and configure permitted website origins, sign-in and sign-up for the final HTTPS domain. Use the production Clerk application for the business site. A new sign-up has no business access until an owner invites a verified email.

Set these on the **Convex production deployment**:

| Variable | Value |
| --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Exact Clerk JWT issuer URL |
| `CLERK_SECRET_KEY` | Clerk backend secret; used to verify invitation email ownership |
| `WAREORB_ALLOW_DEMO_SEED` | Leave unset in production |
| `ANTHROPIC_API_KEY` | Optional; manual entry works without it |
| `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET`, `LALAMOVE_BASE_URL` | Optional sandbox quotation integration; sandbox results cannot authorize a real sale |
| `FISH_API_KEY`, `FISH_VOICE_ID` | Optional; browser speech/manual input remain available |

Set these on **Vercel**, scoped to the intended production environment:

| Variable | Value |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | Production Convex deploy key for the chosen target, with deployment permission |
| `BUN_PUBLIC_CONVEX_SITE_URL` | That deployment's HTTPS `.convex.site` URL |
| `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production `pk_live_…` key, safe for the browser |

`vercel.json` uses `convex deploy --cmd` to inject the matching `BUN_PUBLIC_CONVEX_URL` during the frontend build. The release build rejects missing settings, a mismatched cloud/site pair and the known shared demo target. Browser variables are public: never prefix a secret with `BUN_PUBLIC_`. Enter secrets in platform settings rather than commit files. The provided `.env.example` contains names only.

The Lalamove sandbox remains a quotation test. Real carrier replies can be recorded manually with source reference, full terms, validity and staff confirmation. WareOrb records an existing carrier booking/reference; it does not place a Lalamove order or make payments.

## First owner

1. Deploy the configured backend and frontend. Sign in with the designated owner's Clerk account. The application will show Access pending.
2. A trusted deployment administrator reads `access:bootstrapIdentity` with that account's authenticated identity, or uses the account's exact Convex token identifier. It consists of issuer and subject; do not guess it from an email.
3. Run the internal-only `access:bootstrapOwner` from Convex administration for the **verified intended production target**, with `{ "tokenIdentifier": "exact identity key", "email": "actual owner email", "name": "actual owner name" }`. This operation refuses to run when staff are already provisioned. It creates staff and default settings only.
4. Refresh the owner session. Invite sales/warehouse staff through Staff; users verify their email and click Activate invitation. Verify role boundaries with distinct accounts and confirm deactivation blocks direct calls immediately.

No public signup can make itself owner. Do not expose deployment administration credentials in the website. Defaults are a 30-day observation window, 21-day purchase coverage and RM20,000 outstanding purchase budget; review these against the business before placing purchase records. Cost `0` means unknown and does not produce a purchase recommendation.

## Release verification

Run `bun run check` before release. These checks use local fixtures, including mocked identity-provider responses; they do not prove hosted login works. Then verify the real hosted application with owner, sales and warehouse accounts:

- Signed-out requests cannot read the ledger, upload documents or call provider actions. A supplied owner actor cannot elevate a sales/warehouse account.
- Start empty. Add a real SKU with measured cargo and known/unknown prices; catalogue creation leaves stock at zero.
- Create receipt, attach evidence/manual lines, confirm arrival date, actual counts, bay allocations and any linked purchase. Post once, refresh and retry. Stock increases once; only the explicitly linked PO quantity is received.
- Record a buyer, collection time, destination/access and vehicle fit. Add a verified complete carrier reply. Sandbox/expired/incomplete quotes cannot be approved.
- Owner approval reserves stock. Record the actual agreed carrier reference. Confirm counted partial/full departures and retry the same request; physical stock falls once per actual collection.
- Revise an undelivered order and verify its hold/approval is cleared. Cancel remaining quantities after partial dispatch only after dealing with the carrier externally.
- Record a confirmed supplier order with external reference/cost. Incoming increases while on-hand stock does not. Receive against that exact order.

`/health.json` (static hosting) and `/healthz` (Bun development server) assert frontend liveness only. Check authenticated ledger access and Convex logs separately; investigate failed scheduled extractions/provider calls in the dashboard. Do not label the site ready until these hosted checks pass.

## Backup and restore drill

Use the Convex dashboard's scheduled backups for the production deployment. Keep a pre-release export including evidence files in a restricted location outside source control:

```sh
bunx convex export --prod --include-file-storage --path /secure/warehouse-backups/pre-release.zip
```

Confirm CLI account/project/target before running. This command needs administrative access; a local path here is an example. The repository ignores `backups/`, but that is not an access-control or backup policy.

Restore **into an empty, separate drill deployment**, with external providers disabled and no public business traffic:

```sh
bunx convex import --deployment RESTORE_DRILL_DEPLOYMENT /secure/warehouse-backups/pre-release.zip
```

Inspect SKU/batch/active reservation/open PO totals, receipt-to-movement links, collection request IDs, staff bindings and file downloadability. Compare them to the source export and run a receipt/collection retry check on the drill. Configure auth environment for the drill deliberately; environment secrets are not restored from a data export. Record the date, target and result. Do not import over a live database or use replace flags as a routine recovery step. A restore has **not** been tested until this drill succeeds with real deployment access.

Frontend rollback can redeploy the previous Vercel build. Backend rollback requires the matching schema-compatible code and a reviewed data recovery plan. Retain the pre-release snapshot and never downgrade schema over new business records blindly.

## Current scale boundary

The overview deliberately fails instead of displaying incomplete balances beyond 500 SKUs/open POs, 1,000 active batches/reservations/open receipts/open deals, or 3,000 movements in its requested history. It loads recent completed documents separately; older receipts/deals are paginated and do not exhaust the live overview. Paginate/archive inventory before the other bounds are reached. There is one business per deployment; no multi-company tenancy is claimed.

References: [Clerk integration](https://docs.convex.dev/auth/clerk), [Vercel deployment](https://docs.convex.dev/production/hosting/vercel), [data export](https://docs.convex.dev/database/import-export/export). CLI flags were checked against the installed Convex CLI. Production login, hosted deployment and backup restore remain external activation checks.
