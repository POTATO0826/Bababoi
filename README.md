# WareOrb

Two-floor 3D furniture-stock warehouse console: searchable inventory, an isometric digital twin, a stock details popup and the Jarvis voice agent. Built from the design handoff in `docs/design-handoff.md` (product brief: `docs/concept.md`). Backend plan: `docs/plans/wareorb-backend-plan.md`.

**Stack:** Bun (runtime, dev server, bundler, SQLite, tests) · TypeScript · React 19 · React Three Fiber + drei · zustand · Tailwind v4 + shadcn/ui · Orbkit SHDR-11 orb.

```bash
bun install
bun run db:seed  # explicit, non-destructive demo initialization (no-op if already seeded)
bun dev          # http://localhost:3000 with hot reload and labelled demo personas (DEMO_AUTH=1)
bun test         # service, API, persistence and concurrency tests (temporary on-disk databases)
bun run typecheck
bun run build    # browser assets only, into dist/ — the API needs the Bun server (`bun start`)
```

## Backend (Slice 1: manual receiving → persisted stock)

**Review status (2026-10-24): four findings repaired and verified; 62 tests pass.** The `backend` branch contains this isolated Bun/SQLite slice. Integration with the Convex backend on `Vince` still needs an explicit decision about the authoritative ledger. See the [review evidence and integration context](docs/reviews/wareorb-slice-1-review.md) and [completed coding-agent repair prompt](docs/reviews/wareorb-slice-1-fix-prompt.md) before merging or extending it.

One Bun process serves the page and a same-origin JSON API under `/api`, backed by one SQLite file (`bun:sqlite`, WAL, foreign keys, short `BEGIN IMMEDIATE` write transactions, parameterized SQL, no ORM).

| Env var | Default | Meaning |
| --- | --- | --- |
| `DATABASE_PATH` | `data/wareorb.sqlite` | SQLite file on persistent disk. `data/`, `*.sqlite` and WAL/SHM sidecars are git-ignored. |
| `DEMO_AUTH` | off (`bun dev` sets `1`) | Issues **synthetic** persona sessions (owner / warehouse / sales). Without it no session is issued and data routes return 401 — fail closed. |
| `PORT` | `3000` | HTTP port. |

- `bun run db:migrate` applies versioned SQL migrations (`src/server/db/migrations/`). Server startup also applies pending migrations but **never seeds or resets data**.
- `bun run db:seed` creates the demo warehouse once: 43 SKUs, 144 bays, labelled synthetic opening lots/balances/movements (527 on hand), opening reservations (140), confirmed synthetic purchase lines (99 incoming) and the editable `DN-2291` draft. Reruns are no-ops; a database with unmarked records is refused.
- `bun run db:status` prints schema/seed state.

Stock only changes through `POST /api/receivings/:id/post`, which requires a warehouse/owner session, the reviewed `expectedVersion`, an `Idempotency-Key` header and `actualGoodsChecked: true`. In one transaction it re-validates the saved lines (SKU, count, unit, receipt date, allocations, bay capacity, one SKU per bay, purchase outstanding), writes lots, balances and receipt movements, records activity, marks the receipt posted, bumps the snapshot revision and stores the idempotency result. Drafts and edits never change stock; there is no endpoint that sets a count. SQLite triggers back up the bay rules and keep the movement ledger append-only.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Readiness (no secrets). |
| `GET/DELETE /api/session`, `GET /api/demo/personas`, `POST /api/demo/session` | Demo persona session (HttpOnly, SameSite=Strict cookie). |
| `GET /api/warehouse` | One consistent snapshot: products with on hand / reserved / available / incoming, all bays with occupancy, pending receiving drafts, revision. |
| `GET /api/products/:sku`, `GET /api/products/:sku/movements?cursor=&limit=` | Lots by location; movement history. |
| `GET /api/activity?date=` | Actual warehouse-local daily activity (Jarvis "today"). Synthetic opening balances are not counted as receipts. |
| `GET/POST /api/receivings`, `GET/PATCH /api/receivings/:id`, `POST /api/receivings/:id/post`, `POST /api/receivings/:id/cancel` | Receiving drafts, review, posting, cancellation. |

Errors are `{ error: { code, message, fields?, issues?, currentVersion? } }` with 400 / 401 / 403 / 404 / 409 / 422 / 503. Unknown `/api/*` paths return JSON 404.

The browser holds one normalized snapshot (`src/server-data.ts`), refreshes it after mutations, on focus and every ~15 s while visible, discards older revisions, and on failure keeps the last snapshot with an explicit **Stale** label and disables stock confirmations. It never falls back to seed quantities.

URL flags override the prototype's tweakable props: `?autoSpin=1`, `?voiceReplies=0`, `?lowStockThreshold=3`, `?showEmptyBays=0`.

## Layout

| Path | What |
| --- | --- |
| `src/data/catalog.ts` | Demo **seed input** only (catalogue + opening quantities), read by the seeder; never imported by the browser |
| `src/data/layout.ts` | Immutable floor geometry from WareTwin `gen_layout.py`: zones, bay IDs/codes/rects, racks, lifts |
| `src/shared/` | JSON-safe API contracts, runtime request validation, warehouse-local date helpers |
| `src/server/` | Config, demo users/sessions, `db/` (migrations, seeder, CLI), `services/` (receiving, stock reads), `app.ts` routes |
| `src/lib/api.ts`, `src/lib/inventory.ts`, `src/server-data.ts` | Fetch client; pure snapshot derivations (totals, locations, zone labels); reactive server-data store |
| `src/store.ts` / `src/actions.ts` | zustand UI state; floor switch, selection, camera actions; Jarvis voice agent (Web Speech API) |
| `src/components/` | Header, inventory column, viewport HUD + Details popup, receiving drawer, Jarvis dock + session |
| `src/scene/` | R3F scene: camera rig, building, bays, instanced furniture (driven by persisted occupancy) |
| `tests/` | Bun tests against temporary on-disk databases, including a two-process concurrency test |

## 3D scene

The prototype drew the warehouse as SVG polygons. The R3F rebuild keeps its layout, colours, camera and interactions, and adds:

- Orthographic true-isometric camera that eases between overview and zone framing, orbits on drag, and tilts smoothly between Isometric and Top-down. Framing keeps clear of the Details popup and the Jarvis drawer.
- About 30 furniture templates (sofas with cushions, L-sofa chaise, recliners, round/coffee/side/console tables, desks, glass tables, dining/bar/office/lounge/rocking/kids chairs, wardrobes with door seams and handles, beds with linen and pillows, bunk and day beds, mattress stacks, rug rolls, floor lamps, cartons on pallets, mirror crates). Each is merged once and drawn with `InstancedMesh`.
- Selection and hover: per-instance glow plus a screen-constant outline hull on every unit of the selected SKU.
- Pallet racking, concrete floor, painted aisles with safety lines and wayfinding chevrons, dock doors, and detailed lifts.
- Walls cut away on the side facing the camera and rise again as you orbit.
- Soft directional shadows and contact-shadow blobs; drops resolution if the frame rate falls.
- Receiving drafts (seeded: `DN-2291`) show as shrink-wrapped units in the inbound dock (hover for details, click to review). They are not on hand until posted, then appear in their bays and leave the dock.

## Notes

- Voice input needs a browser with `SpeechRecognition` (Chrome, Edge). Elsewhere, tap the suggestions. Replies use `speechSynthesis`.
- Jarvis matches commands with keyword rules (no LLM). It re-reads the ledger before answering counts, locations or "today", shows the ledger revision/as-of time under its reply, and never changes stock; transfer requests are declined.
- All data is synthetic and labelled as such; personas are simulated sign-in with real server-side role checks, not production identity.
- In dev, `__ware.getState()` in the browser console shows the app state.
