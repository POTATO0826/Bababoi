# WareOrb usable business release — 2026-10-24

## Authorized outcome

The user wants this team to implement and prepare the application for real daily use, not just write a prompt or publish a simulated demo. Use the newest Vince frontend and its Convex backend. Preserve the original checkout and concurrent video work. Work only in this independent checkout on backend-production, based on Vince 8f4d6df; backend 5708e52 remains a separate reviewed SQLite reference, not an integration base.

The first release serves one business/warehouse deployment with owner, sales and warehouse staff. Multi-company SaaS, billing, automatic paid carrier booking and broad visual redesign are out of scope. The existing workflow in AdvancedWareorb.md governs the business outcome.

## Implementation decisions

- Keep Bun, React, the existing 3D scene and Convex as the single authoritative ledger.
- Use Clerk's supported React/Convex identity integration (official docs currently use @clerk/react and ConvexProviderWithClerk). Server-side active staff membership determines permissions. Browser actor fields and role query parameters never grant authority.
- First owner is provisioned through a deployment-admin-only internal operation bound to an exact authenticated identity. No first-public-signup owner promotion. Owner manages staff invitations/roles/deactivation; pending staff must prove their email through the identity provider before binding an invitation. Never accept an unverified email claim.
- Auth UI: login/logout, real profile, access-pending state, owner staff management. No simulated role switch in business mode. Do not run ledger subscriptions before authentication and membership resolve.
- Authentication and staff checks cover public queries, mutations, actions, uploads, file access and HTTP/provider paths, with authorization checked before returning data or spending provider credits. Internal scheduled operations use trusted stored identifiers and recheck eligibility where needed.
- Production starts with empty business records. Setup creates settings/geometry only; owner/warehouse can create real catalogue items, receive stock and record confirmed purchase orders. Demo seeds/reset and simulated records must be explicitly isolated and disabled by default. Never reset the existing admired-swordfish-390 development deployment.
- Manual receiving, verified manual quotes and manual carrier-reference recording must support real operations when optional AI, speech or carrier providers are unavailable. Preserve multimodal capture into reviewable drafts. Never label sandbox prices, simulated bookings or model guesses as real confirmed operations.

## Release milestones

1. Identity, staff authorization and safe business initialization; meaningful integration tests for unauthorized calls, impersonation and deactivated staff.
2. Correct receiving → stock → ageing/sales → buyer/delivery → real/manual quote → owner approval/reservation → physical dispatch → replenishment/purchase → receiving loop. Exercise atomicity, stale versions, retries and concurrent allocation in backend tests. Business users must be able to start from an empty warehouse without fixture SKUs.
3. Production configuration, browser walkthrough with distinct users, deployment/backup/restore instructions and release verification. Deploy only to a verified intended project with the required access; prepare and report exact missing configuration while continuing all independent work.

## Shared implementation contracts

Backend identity owner provides convex/access.ts:
- getActor(ctx, ...allowedRoles): authenticated, active staff actor; ignores client identity claims.
- getViewer(ctx): authenticated active membership for protected reads, actions via an authenticated internal query where necessary.
- Public api.access.me: current staff profile or null for signed-out/unprovisioned users; no inventory exposure.
- Public api.access.activate: bind authenticated verified-email identity to an owner-created pending invitation, with no privilege selection from the client.
- Owner-only api.access.listStaff, inviteStaff, updateStaff; preserve at least one active owner and audit changes.
- Internal bootstrapOwner is callable only through trusted deployment administration and never exposed as a public action.

If implementation details require a contract change, communicate it to the parent and frontend owner before editing shared callers. Identity agent owns all convex files initially, dependency manifests and src/domain/types.ts. Frontend agent owns UI integration; business-flow auditor initially reads only. Parent owns this plan, deployment files and integration review. No agent may deploy, reset data, send real messages, commit or push without parent coordination.

## Acceptance evidence

- Real login with reload persistence and logout; direct unauthenticated API access fails; supplied actor=owner cannot elevate a warehouse/sales user; disabled membership takes effect on the server.
- Fresh business setup has no synthetic catalogue, stock, customers or quotes. Authorized staff can create a SKU and a receipt from the UI, attach/review evidence and post once to valid bays. Drafts and AI extraction do not change stock.
- Receipt count/date/unit/purchase linkage, all line SKUs, capacity, duplicate references, optimistic versions and retry keys are checked under an atomic write. Edits cannot be silently overwritten by refresh.
- Offer/quote changes invalidate previous approval and release obsolete holds; approval reserves exact lot/location quantities without dispatch; confirmed collection decrements only reserved goods once. Incomplete/expired/sandbox quotes do not masquerade as production-ready proposals.
- Confirmed purchases increase incoming, not physical stock; linked receipts reduce the matching outstanding quantity. No invented sales history or silent seed fallback.
- Automated backend/integration tests, client/domain tests, frontend and Convex typechecks, build, real browser checks and explicit external-provider limits are reported separately. A clean build or simulated token test is not proof that production login/deployment works.
- Deployment target uses independent business data, correct environment variables, HTTPS, health/error visibility and a tested backup/restore path. No real deployment is claimed until its URL and authorized flows are verified.

## Known external configuration

User supplied the existing development deployment identifier dev:admired-swordfish-390 and Lalamove MY sandbox configuration. These are not production deployment credentials. No Convex CLI login/deploy key, hosting account or Clerk application configuration was found locally. Secrets supplied in conversation must not be committed, logged or copied into agent prompts. Production owner identity and final hosting access are still needed for final activation; implementation proceeds independently.
