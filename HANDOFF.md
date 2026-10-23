# WareOrb Advanced — build handoff

Give this file to the next coding agent (Claude Code or Codex) to continue the build.
Spec: `AdvancedWareorb.md` (9-stage workflow). Plan: minimized build, deadline < 3 days.

## Rules for whoever continues
- Read `convex/_generated/ai/guidelines.md` before touching `convex/` (Convex 1.48: `ctx.db.get("table", id)`, `ctx.db.patch("table", id, …)`, env via `env` from `./_generated/server`, bounded `.take()`).
- Keep the 3D warehouse map. UI: shadcn components, minimal copy (short badges, no explanatory sentences), few screens.
- Pure rules live in `src/domain/*.ts` (relative imports only) and are shared by Convex + browser + `bun test`.
- Simulated roles (Owner / Sales / Warehouse) are passed as `actor` to every mutation and checked with `requireRole`.
- Never: invent prices/coordinates, count unknown cost as 0, move stock at approval, call Lalamove `/v3/orders` (booking is simulated).
- API keys are optional Convex env vars (set by the user later): `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET`, `LALAMOVE_BASE_URL`, `FISH_API_KEY`, `FISH_VOICE_ID`, `FISH_TTS_MODEL`. Every feature must fall back without them.
- Commit after every step (small commits on `main`).

## Run
- `bunx convex dev` (separate terminal; deployment `dev:admired-swordfish-390`), `bun dev` (http://localhost:3000)
- `bunx convex run seed:run` — wipe + load synthetic data · `bun test src/domain` · `bunx tsc --noEmit` · `bunx tsc -p convex --noEmit`
- Campus Wi-Fi (Taylor's) breaks Node/Bun HTTPS — use a phone hotspot.

## Status
| Step | State |
|---|---|
| M0 Convex setup | ✅ |
| M1a Domain rules + 20 tests (`src/domain`) | ✅ |
| M1b Convex backend: schema, seed, ledger snapshot, deals, quotes, Lalamove action, receiving, replenish | ✅ seeded + verified via `convex run` |
| M1c Frontend on Convex: `src/convex.ts`, ConvexProvider, `<LedgerSync/>` mirrors snapshot into zustand `skus` via `toSkuRecords`, remove localStorage ledger | ⏳ next |
| M2 Shell: header tabs (Inventory · Receive · Ageing · Deals · Replenish), role switcher, detail popup host, bay states (ageing violet / reserved teal / awaiting orange / freed green) | ☐ |
| M3 Deal UI: batch → hand off → buyer form → quotes (manual + demo replies + Lalamove) → submit → approve/reject → confirm collection | ☐ |
| M4 Lalamove live check with keys | ☐ (code done in `convex/lalamove.ts`) |
| M5 Replenish list + Create PO | ☐ (backend done) |
| M6 Fish voice: `convex/http.ts` `/voice/tts` (model header `s2.1-pro-free`), `/voice/asr` (multipart, model header `transcribe-1-pro`, accepts webm), browser fallback | ☐ |
| M7 Receiving UI + Claude extraction (`convex/ai.ts` → `internal.receiving.setExtraction`) | ☐ (backend post/review done) |
| M8 Jarvis Claude tools (read / navigate / `get_delivery_quotes`; never approve/dispatch/post) | ☐ |
| M9 Polish + rehearsal | ☐ |

## Backend map (`convex/`)
- `schema.ts` — skus, batches (own bays via `locations`), reservations, purchaseOrders, movements, audit, receipts, deals, quotes, settings, kv
- `ledger.ts` — `snapshot({since})` (everything the map/lists need), `history({entity})`
- `deals.ts` — `create` (owner) · `update` (sales, version++) · `confirmDestination` · `confirmFit` · `submit` (sales) · `decide` (owner; approve reserves + simulated booking, reject needs reason) · `confirmCollection` (warehouse; only now stock falls) · `close`
- `quotes.ts` — `forDeal` · `request` (Lalamove, dedupe/reuse) · `addManual` · `addDemoReplies` (§8 synthetic) · `setUnloading`
- `lalamove.ts` — `fetchQuote` (internal, HMAC, falls back to labelled `demo_fallback`) · `services` (cities cache / fixture)
- `receiving.ts` — `generateUploadUrl` · `create` · `addEvidence` · `saveLines` · `post` (warehouse) · `reject` · `createModel` · internal `forExtraction`/`setExtraction`
- `replenish.ts` — `createPO` (owner) · `seed.ts` — `run` (internal), `reset` (owner), `ensure`
- `limits.ts` — `@convex-dev/rate-limiter` (Lalamove 25/min, Fish, Claude)

## §8 demo path
Warehouse posts DN-2291 (4 chairs) → Owner sees B-2140-A (120 d, A-1-01/02) flagged → hands to Sales → Sales records buyer RM1,200 × 2, PJ preset, confirms location → quotes (Lalamove sandbox + synthetic RM280/RM220/RM300) → net RM900 → submit → Owner approves (reserved, SIM booking, on-hand unchanged) → Warehouse confirms collection (A-1-01 freed, A-1-02 kept) → Replenish suggests 4 × SOFA-NORDE-3301 → PO.
