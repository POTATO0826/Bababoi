# WareOrb Advanced — build handoff

Give this file to the next coding agent (Claude Code or Codex) to continue. Branch: **`Vince`** (push here only, never `main`).
Spec: `AdvancedWareorb.md` (9-stage workflow). Plan: minimized build, deadline < 3 days.

## Rules for whoever continues
- Read `convex/_generated/ai/guidelines.md` before touching `convex/` (Convex 1.48: `ctx.db.get("table", id)`, `ctx.db.patch("table", id, …)`, env via `env` from `./_generated/server`, bounded `.take()`).
- UI: shadcn components, minimal copy (short badges), keep the 3D map. **No tabs** — workflow panels open from the **Jarvis chat** (type `/` for the role's commands, ask in plain words, talk, or scan a delivery note). `/` or Ctrl+K opens Jarvis with `/` typed; Esc returns to the map. Jarvis is tuned per role (greeting from live counts, suggestions, Claude focus).
- Pure rules live in `src/domain/*.ts` (relative imports only), shared by Convex + browser + `bun test`.
- Simulated roles (Owner Mei / Sales Arif / Warehouse J. Lim) pass `actor` to every mutation; the server checks with `requireRole`.
- Never: invent prices/coordinates, count unknown cost as 0, move stock at approval, call Lalamove `/v3/orders` (booking is simulated), let Jarvis approve/post/collect.
- Commit after every step; `git push origin Vince`.

## Run
- `bunx convex dev` (separate terminal; deployment `dev:admired-swordfish-390`) · `bun dev` → http://localhost:3000
- `.env.local` needs `BUN_PUBLIC_CONVEX_URL` and `BUN_PUBLIC_CONVEX_SITE_URL` (same values as `CONVEX_URL` / `CONVEX_SITE_URL`). Restart `bun dev` after changing it.
- `bunx convex run seed:run` — wipe + load synthetic data · `bun test src/domain` · `bunx tsc --noEmit` · `bunx tsc -p convex --noEmit`
- URL flags: `?role=owner|sales|warehouse`, `?ai=0` (Jarvis offline rules only).
- Campus Wi-Fi (Taylor's) breaks Node/Bun HTTPS — use a phone hotspot.

## API keys (all optional — Convex dashboard → Settings → Environment Variables)
| Variable | Turns on | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` (+ optional `CLAUDE_MODEL`, default `claude-opus-5`) | Jarvis tool-calling, "Read with AI" receipts, product icons | Jarvis keyword rules (EN + 中文); manual receipt lines; colour swatch |
| `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET` (+ optional `LALAMOVE_BASE_URL`, default sandbox) | Real sandbox quotes + live vehicle sizes from `/v3/cities` | Labelled "Saved demo" quote (never ranked/approvable) + sample vehicle sizes |
| `FISH_API_KEY`, `FISH_VOICE_ID` (+ optional `FISH_TTS_MODEL`, default `s2.1-pro-free`) | Natural EN/中文 voice in and out | Browser speech (Chrome: en-US / zh-CN) |

## Status
| Step | State |
|---|---|
| Convex setup, domain rules + 20 tests | ✅ |
| Backend: schema, seed, ledger, deals, quotes, Lalamove, receiving, replenish, AI actions, voice HTTP | ✅ verified via `convex run` (full §8 path incl. role refusal, double-click refusal) |
| Frontend on Convex (LedgerSync → 3D map) | ✅ |
| Command palette UI + panels: receive, ageing, deals/delivery/approve/collect, replenish | ✅ screenshot-verified |
| Map states: ageing violet, reserved teal, freed green, inbound dock from real receipts | ✅ |
| Jarvis: utterance loop, Claude tools, offline EN/中文 rules, EN/中文/Auto toggle | ✅ offline path verified; Claude path needs key |
| Live tests with real keys (Lalamove sandbox, Claude, Fish) | ⏳ waiting for keys |
| Polish ideas | Fly the map to new bays after posting a receipt; outbound-dock marker for approved deals; mobile layout pass |

## Backend map (`convex/`)
- `schema.ts` — skus, batches (own bays via `locations`), reservations, purchaseOrders, movements, audit, receipts, deals, quotes, settings, kv
- `ledger.ts` — `snapshot({since})`, `history({entity})`
- `deals.ts` — `create` (owner) · `update` (sales, version++) · `confirmDestination` · `confirmFit` · `submit` (sales) · `decide` (owner; approve reserves + simulated booking; reject needs reason) · `confirmCollection` (warehouse; only now stock falls) · `close`
- `quotes.ts` — `forDeal` · `request` (Lalamove, dedupe/reuse) · `addManual` · `addDemoReplies` (§8 synthetic) · `setUnloading`
- `lalamove.ts` — `fetchQuote` (internal, HMAC, falls back to labelled `demo_fallback`) · `services` (cities cache / sample sizes)
- `receiving.ts` — `generateUploadUrl` · `create` · `addEvidence` · `requestExtraction` · `saveLines` · `post` (warehouse) · `reject` · `createModel`
- `ai.ts` ("use node") — `extractReceipt` (structured output) · `generateIcon` · `jarvisAsk` (tools; never approve/post/collect) · `aiData.ts` — its queries
- `http.ts` — `/voice/tts`, `/voice/asr` (Fish; 501 → browser fallback) · `limits.ts` — rate limiter · `replenish.ts` — `createPO` (owner) · `seed.ts` — `run`, `reset` (owner), `ensure`

## Frontend map (`src/`)
- `commands.ts` — slash commands per role · `components/jarvis/jarvis-chat.tsx` — Jarvis chat (shadcn MessageScroller/Message/Bubble/InputGroup, orb beside it) · `roles.ts` — per-role greeting/suggestions · `scan.ts` — scan → receipt → AI reading
- `components/stages/*` — left-column panels · `components/detail/*` — popups over the map (deal, receipt, batch)
- `workflow.ts` — ageing flags, deal turns, map overlay, replenishment · `ledger.ts` — snapshot selectors
- `voice/voice.ts` — record / transcribe / say · `actions.ts` — navigation + Jarvis loop

## §8 demo path (presenter script)
1. Open Jarvis and type `/` once so judges see the role's commands; switch roles from the header.
2. **Warehouse** (`J. Lim`): `/receive` → DN-2291 → tick *Counted* → **Post** (inbound dock clears, chairs land in a bay).
3. **Owner** (`Mei`): say "有什么旧货？" or `/ageing` → B-2140-A (120 d, A-1-01/02 violet) → **Hand to Arif**.
4. **Sales** (`Arif`): `/deals` → the sofa deal → buyer RM1,200 × 2, PJ preset → **Confirm location** → **Get Lalamove quotes** and/or **Demo** replies → pick RM280 → **Send to Mei**.
5. **Owner**: `/approve` → net recovery **RM900** (before stock cost, not profit) → **Approve** (A-1-01 turns teal, stock unchanged, SIM booking).
6. **Warehouse**: `/collect` → **Goods collected** → A-1-01 freed (green), A-1-02 still full.
7. **Owner**: `/replenish` → 3-Seater Sofa · Oatmeal **+4** → **Order 4**.
8. Reset: `/` → *Reset demo data* (owner).
