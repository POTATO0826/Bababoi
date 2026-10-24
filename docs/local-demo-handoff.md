# Handoff — WareOrb local presentation demo (2026-10-24)

Read this first. It supersedes `docs/claude-handoff.md` for current work.

## Current requirement (user, verbatim intent)

A **local demo on the presentation Mac**; production launch, Clerk login and Vercel are **out of scope**.

1. Open on localhost and use immediately — no login/signup screen.
2. Record a spoken receiving note → editable receiving form.
3. Upload a photo of a handwritten note / delivery document → extracted into the same form.
4. Fields: SKU/model, qty, unit, condition, package count, dimensions, weight. Keep weight per item / per package separate from total weight; calculate totals from confirmed data; unknown stays unknown (never invent).
5. Presenter corrects the draft and confirms physical receipt before stock changes; keep original photo/audio; no duplicate posting.
6. A **real agent** with warehouse tools: queries actual inventory and movements, explains, recommends what/how much to reorder (available stock, reservations, incoming POs, sales history, budget, storage capacity). Insufficient data → honest explanation.
7. Prefer **Pi** with the user's subscription; provider auth is a one-time operator step outside the UI; no credentials in the browser; no unrestricted shell for the agent.
8. Show actual tool calls/results; no scripted answers or fake "connected"; posting, purchasing and dispatch stay human-confirmed.

Constraints: keep the existing UI, warehouse logic and production auth code; local persistent data (local Convex, never the shared cloud DB); separate explicit demo mode with synthetic data; one documented config template; secrets out of Git/logs; Homebrew for system CLIs, Bun for project deps; **do not touch `/Users/saou/Documents/codes/Bababoi`** (concurrent video work, branch `backend`).

Deliverables still owed: working start command, concise setup doc, exact remaining config values, evidence of what was tested — separating mocked tests from live-provider checks.

## Where

- Isolated checkout: `/Users/saou/Documents/codes/Bababoi-backend-production`, branch `backend-production` (push to this branch only; user approved).
- Commits on top of `e935ae6`: `5dfba81` (Clerk native Convex token for voice + interim guard), `834ee1c` (bindings), `d19bad2` (acceptance fixes: canonical collection retry payload, same-minute collection, posted receipt shows linked PO), then the WIP commit that adds this file.
- Start the demo: `bun run demo` (first run creates everything); `bun run demo:reset` reloads synthetic data.

## Verified facts

**Pi 1.4.0** (Homebrew `pi-coding-agent`; npm scope moved to `@earendil-works/*`, pinned `1.4.0` in package.json) — checked in its source:
- `openai-codex` = "OpenAI (ChatGPT Plus/Pro)" subscription OAuth (browser or device code, refresh). Models `gpt-5.6-*`, `gpt-6-*`, `gpt-6.1-sol`: input text+image. **No audio input** in any Codex or Claude model.
- Anthropic via `/login anthropic` (API key) or `ANTHROPIC_API_KEY`; models incl. `claude-sonnet-5-5`, `claude-opus-5-5` (text+image).
- SDK: `createAgentSession({ tools: [...allowlist], customTools, resourceLoader (custom: no extensions/skills/AGENTS.md), sessionManager: SessionManager.inMemory(), settingsManager: SettingsManager.inMemory({ enableInstallTelemetry: false }) })`; events `tool_execution_start/end`, `message_update/text_delta`; `prompt(text, { images })`. Telemetry off with `PI_TELEMETRY=0`.
- Pi does **not** reuse `~/.codex/auth.json`; operator must run `pi` → `/login` once. Credentials land in `~/.pi/agent/auth.json`. As of handoff: **no `~/.pi/agent/auth.json` yet** (login not completed).
- The user pasted a Claude API key in chat. Do **not** write it anywhere; the user must enter it via `pi` → `/login anthropic`. Recommend revoking it after the demo (also rotate the Lalamove sandbox secret pasted earlier).

**Local Convex** (`CONVEX_AGENT_MODE=anonymous`, CLI 1.48): deployment `anonymous:anonymous-agent`, `http://127.0.0.1:3210` / `:3211`, data in `.convex/local/default/` (git-ignored). The local backend needs **Node 20/22/24** for `"use node"` actions — this Mac's default is Node 26; `node@24` (keg-only) already installed; `scripts/demo.ts` puts it first on PATH for Convex only. `auth.config.ts` must read only variables that are set: it now branches on `isLocalBackend(env.CONVEX_CLOUD_URL)` (local → `customJwt` with `WAREORB_LOCAL_DEMO_JWKS`; cloud → Clerk) — production behaviour unchanged.

**Local auth verified live** (`/tmp/wareorb-probe/jwt-check.ts`): presenter ES256 token → `me` = Demo presenter/owner; no token → null; token from another key → rejected; expired → rejected; valid token for a non-staff subject → null. `bun scripts/demo.ts --setup-only` succeeded: env set, push, presenter bootstrapped, synthetic seed loaded. `.env.local` is mode 600 and git-ignored.

Checks at handoff: both typechecks pass; `bun test src/domain` 21/21; vitest 49/49 at `d19bad2` (re-run after WIP not done).

## Implemented in the WIP commit (typechecked, NOT yet run end-to-end)

- `scripts/demo.ts` — one command: refuses cloud `CONVEX_DEPLOYMENT`; generates presenter key pair + agent secret into `.env.local`; sets local backend env from a 0600 temp file; pushes; runs `convex dev` (log `.convex/demo-backend.log`); bootstraps presenter; seeds when empty; starts `bun src/index.ts` with `WAREORB_LOCAL_DEMO=1`, `BUN_PUBLIC_WAREORB_LOCAL_DEMO=1`, port 3000 on 127.0.0.1.
- `src/local/demo-identity.ts` (WebCrypto ES256 keys/tokens), `src/domain/local-demo.ts` (issuer/audience/presenter constants), `convex/localDemo.ts` (`isLocalBackend`, `localAgent()` honoured only on a 127.0.0.1 backend).
- `src/local/routes.ts` (Host/Origin-guarded): `GET /api/demo/token`, `GET /api/agent/status`, `POST /api/agent/chat` (SSE: status/text/tool_start/tool_end/done/error), `POST /internal/extract-receipt` (Bearer secret, called by the Convex action).
- `src/local/agent.ts` — Pi runtime; model choice `WAREORB_AGENT_MODEL` else `openai-codex/gpt-6.1-sol` if logged in, else `anthropic/claude-sonnet-5-5`; honest "not configured" with setup hint; analyst prompt; refuses to run if any tool other than the allowlist is active; `readDeliveryEvidence` uses a forced `submit_receipt_draft` tool (TypeBox schema).
- `src/local/warehouse-tools.ts` — read-only tools `get_inventory`, `get_movements`, `get_purchase_orders`, `analyze_reorder` over `ledger.snapshot` (presenter token); reorder reuses the domain rule and adds combined budget/bay warnings + insufficient-data list.
- `src/domain/replenish.ts` — `replenishmentRows`/`historyStart` moved out of `workflow.ts` (UI behaviour unchanged).
- `src/domain/measure.ts` (`lineTotals`, `receiptTotals`, `measure`, `cleanMeasures`), `src/domain/receipt-reading.ts` (shared reading rules, `draftLine` validation). Schema `receiptLine` gained optional `unit, packageCount, packageDimsCm{lCm,wCm,hCm}, itemWeightKg, packageWeightKg, statedTotalWeightKg` (null = unknown). `saveLines` refuses invalid numbers; `setExtraction` keeps AI-stated condition and cleaned measures.
- `convex/ai.ts` — `extractReceipt` delegates to the local agent when `localAgent()` is set; Anthropic schema/prompt extended for cloud use.
- `src/identity.tsx` — identity context (`ClerkIdentity` unchanged behaviour; `DemoIdentity` + `useDemoConvexAuth`); `frontend.tsx` chooses demo or Clerk; `App.tsx`/`header.tsx` use it (demo: no sign-in, no staff dialog, "Local demo · synthetic data" badge).

## Remaining work, in order

1. `bun run demo`; check `curl -H 'Host: 127.0.0.1:3000' http://127.0.0.1:3000/api/demo/token`, `/api/agent/status` (expect not-configured), open the UI (no login). Create a receipt with a text note and request extraction: expect extraction error "No agent provider is configured…" — this proves **Convex → 127.0.0.1 bridge** works (unverified so far).
2. UI: receipt line measurement inputs (unit, packages, L×W×H, weight per item / per package / stated total) + computed totals and warnings from `lineTotals`/`receiptTotals` in `src/components/detail/receipt-detail.tsx`; show "no transcript" clearly for voice (browser speech only — user declined a Whisper download).
3. UI: in demo mode route Jarvis free text (`src/actions.ts runCommand`) to `POST /api/agent/chat` (SSE), render tool calls/results (extend `TranscriptLine` in `src/store.ts`, render in `src/components/jarvis/jarvis-chat.tsx`), show agent status/model; no offline scripted answers when not configured — show the setup hint.
4. Tests: `src/local/*.test.ts` (views incl. insufficient history, combined budget/space warnings, demo token roundtrip), `src/domain/measure` tests, convex tests for measurement validation and extraction sanitisation; mocked-provider tests labelled as mocked.
5. Live (after the user runs `pi` → `/login`): agent tool-call answer, photo extraction (handwritten note), unreadable photo, invalid credential message.
6. Verify: restart persistence, duplicate posting, unknown weight, insufficient history (new SKU), missing/invalid provider.
7. Docs: `docs/local-demo.md` (setup + start + troubleshooting), local-demo section in `.env.example`; make `scripts/build-production.ts` refuse `BUN_PUBLIC_WAREORB_LOCAL_DEMO`. Commit and push `backend-production`.

## Remaining operator configuration

- One-time Pi login on this Mac: `cd ~ && pi`, then `/login` → **OpenAI (ChatGPT Plus/Pro)** or **Anthropic** (API key), then `/quit`. Optional `WAREORB_AGENT_MODEL=provider/model`, `WAREORB_DEMO_PORT`.
- Voice transcript: Chrome's built-in speech recognition (online, Chrome only). Original audio is always stored.

## Superseded cloud work (left as is)

- Convex `vince-loo/wareorb` prod `descriptive-lemur-152`: deployed at `834ee1c`, owner `quinndzq` bootstrapped, contains labelled `ACCEPT-*` acceptance records; secrets `CLERK_SECRET_KEY`/Lalamove **never set**. Full hosted acceptance of the workflow passed (receipt → stock → offer → verified quote → approval/hold → partial/full dispatch → revise/close → confirmed PO → linked receipt; stale/duplicate/retry/oversell/sandbox checks).
- Vercel `quinn-dzq/wareorb` (Hobby plan — not for commercial use) at https://wareorb.vercel.app; Clerk app "WareOrb" (development instance). CLI logins exist in `~/.convex` and the Vercel CLI. Delete or keep at the user's choice.
