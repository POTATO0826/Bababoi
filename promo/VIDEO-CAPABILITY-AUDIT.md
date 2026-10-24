# WareOrb video capability audit (25 Oct 2026)

What the current product can truthfully show in the extended promo, checked against the source.

**Sources:**

| | |
|---|---|
| **Product (source of truth)** | `backend-production` @ **`4c2cc973ffccc2691019429605982b6d2989cd3f`**: "fix: demo-blocking UI defects found in the full local app", 2026-10-25 02:01 +0800 |
| **The delivered promo's app** | `Vince` @ `781687f` (code-identical to `8f4d6df`) |
| **Video branch before this audit** | `promo/wareorb-video` @ `cc8ca5745e435e3e60e9aa7cfa22e4d9f6d9aa01` |

**Method:**
* The code was read with `git show origin/backend-production:<path>`.
* The branch was exported with `git archive` to `~/Documents/codes/Bababoi/out/wareorb-promo/app-backend-production-4c2cc97/`, where the tests and the demo were run.
* No credentials were used, no production data was touched, and no Lalamove, Anthropic or Codex request was made.

## Evidence levels used below

| Level | Meaning |
|---|---|
| **Verified here** | Run in this audit on the producer's Mac, 25 Oct 2026, at `4c2cc97` |
| **Tested (mocked)** | Covered by the branch's own automated tests with a mocked provider, which isn't live evidence |
| **Reported live** | Claimed in the branch's docs by another agent, with a date. Not re-run here. |
| **Code only** | Read in the source; not run |
| **Not built** | Absent from the code |

## 0 · Evidence collected in this audit

* **Tests.** `bun run check` at `4c2cc97` exited 0, with `ANTHROPIC_BASE_URL` unset:
  * **314 Bun tests passed across 22 files, 0 failed**;
  * **79 Vitest (Convex) tests passed across 6 files**;
  * both typechecks passed, and the production build passed.
  * Log: `out/wareorb-promo/pitch/logs/check-4c2cc97.log`. The `[lalamove] … failed` lines in it are the mocked failure cases.
* **Local demo.** `bun run demo` at `4c2cc97` ran on ports 3350 (web) and 3360/3361 (Convex). Port 3210 was taken by another checkout's backend, which wasn't touched. Results:
  * The accountless local Convex backend was created and the synthetic data loaded ("Loaded the synthetic demo data (first run)").
  * Log line: "Jarvis not connected yet". No Pi login or Anthropic key is configured on this Mac.
  * `GET /` returned 200; a foreign-origin `GET /api/demo/token` returned **403**.
* **Screenshots** in `out/wareorb-promo/pitch/qa/backend-4c2cc97-screens/` (1920×1080, local only), taken by `promo/source/capture-backend/smoke-screens.mjs`:
  * `01-home.png`: no login. The header says "Local demo · synthetic data · Live · Demo presenter · Owner"; 44 SKUs, 374 on hand, 63 reserved, 311 available, 78 incoming.
  * `02-jarvis-open.png`.
  * `03-jarvis-navigate-sofa.png`: "Where can I put my new sofa?" flies the map to Floor 1 › Sofas · Zone A, highlights four free bays, and shows the chip "Showing Floor 1 · Zone A · 4 free bays". Jarvis replies "Floor 1, Zone A has room: A-3-03, A-3-04, A-3-05, A-3-06" with **no model connected**. An orange "Jarvis isn't connected" notice follows in the chat.
  * `04-delivery.png`: `/delivery` + Enter opens Delivery.
    * The Lalamove card reads "Lalamove not connected · Connect … Quotes only: nothing is booked or charged."
    * Ready for quotes: D-1004 (Approval), D-1007 (Rejected), D-1002 (Offer).
    * Needs details: D-1003, D-1001.
* The demo was then stopped. Its data persists in the export's `.convex/local/` (git-ignored).

---

## 1 · Two modes of the app at `4c2cc97`

| | **Local presentation demo** (`bun run demo`) | **Hosted mode** |
|---|---|---|
| Sign-in | **None.** The page is the "Demo presenter" (**Owner**). Its token is minted from an ES256 key pair generated on this Mac (`src/local/demo-identity.ts`); the backend only gets the public JWKS. | Clerk sign-in, staff roles (`convex/access.ts`) |
| Backend | An accountless local Convex backend (`CONVEX_AGENT_MODE=anonymous`), data in `.convex/local/` | A Convex cloud deployment |
| Data | Synthetic, all labelled "(synthetic)" and `synthetic: true` (`src/domain/seed.ts`, `src/domain/seed-scenarios.ts`) | Empty business ledger; demo seed off |
| Jarvis agent and Lalamove connection | Available: `/api/agent/*`, `/api/lalamove/*`, `/internal/lalamove/quote` | **Not served** (404; `src/local/config.test.ts`) |
| Isolation | Refuses to start if any cloud selector is present (`src/local/isolation.ts`). The web server, page and Convex functions refuse demo mode off this computer. | — |

**For video, use the local demo.** It needs no Clerk and no account. The Clerk-based recording plan in `pitch/pitch-plan.md` (decision A) and `HANDOFF.md` is **outdated** for this purpose.

---

## 2 · The original promo against `backend-production`

| Promo beat (Vince UI capture) | At `4c2cc97` | Source | Reuse in a new film |
|---|---|---|---|
| DN-2291 "Dining chair oak × 4", tick "Counted and checked", **Post to stock**, history "J. Lim · 4 × CHAIR-LUMA-0410 → C-3-01" | **Changed.** DN-2291 is still seeded "To verify" ("handwritten note, no measurements"). Posting now needs, per line: SKU, counted quantity, bays, the "counted and checked" box, a condition confirmed as **Good**, and optionally measurements (L×W×H, weight with its basis). The receipt UI is different. The presenter is "Demo presenter", not J. Lim. | `src/components/detail/receipt-detail.tsx`, `convex/receiving.ts`, `docs/local-demo.md` §Using the demo | **Re-capture** |
| B-2140-A, 120 days, 0 sold / 30d, **Hand to Arif** → D-1001 "Finding buyer" | **Changed.** B-2140-A is still the 120-day sofa ("free to hand to sales"), but the owner presses **Start sale** (`batch-detail.tsx`). The seeded D-1001 is now a *Marble Top* deal, so a new sale gets the next code. | `src/components/detail/batch-detail.tsx`, `src/domain/seed-scenarios.ts` | Re-capture. The twin's violet ageing laps can still be reused. |
| Three synthetic carrier replies, Carrier A **Lowest** | **Changed.** "Demo" replies still exist, tagged *Synthetic*, but are **never ranked, submitted, approved or booked**. Lalamove **sandbox** quotes are new (§3). | `convex/quotes.ts` (`addDemoReplies`), `convex/deals.ts:52–53` | Don't reuse as a "lowest quote" beat |
| **Approve**: net recovery RM920 "before stock cost · not profit", "Approved by Mei" | **Changed.** Approval needs a **verified manual carrier reply** with reference and terms. Seeded D-1004's Approve is disabled because its reply is synthetic. Net recovery and its caveat still exist. | `convex/deals.ts` (`usableQuote`), `src/components/detail/deal-detail.tsx` | Re-capture with a labelled test reply, or show the refusal |
| **SIM-7001 simulated booking**, "Confirm 2 left the warehouse" | **Changed.** Live flow: **Record carrier reference** ("The carrier confirmed this arrangement outside WareOrb"), then per-bay counts and **Record N collected**. Seeded D-1006 still carries a labelled **Simulated booking (SIM-D-1006)** as a history fixture. | `convex/deals.ts`, `docs/local-demo.md` §What is synthetic | Re-capture. Never show a booking as real. |
| 3-Seater Sofa · Oatmeal **+4** ("9 − 3 − 2 = 4"), "Order 4" | **Changed.** There's one shared plan for the panel and Jarvis (budget and bays allocated across SKUs); different seed numbers; purchases are recorded by a person ("Record confirmed supplier purchase"). | `src/components/stages/replenish-list.tsx`, `src/domain/replenish.ts`, `src/local/warehouse-tools.ts` (`analyze_reorder`) | Re-capture |
| The 3D twin (structure, bays, furniture) | **Mostly the same.** `src/data/` (layout) is unchanged. `src/scene/bays.tsx` changed (+18; highlight for navigation), `src/store.ts` changed (+116), and the seed changed (44 SKUs / 374 units). | `git diff 8f4d6df origin/backend-production -- src/scene src/data src/store.ts` | Reusable as a look. Ledger snapshots must be re-captured from the new demo before claiming new-build data. |
| Persona switching (`?role=`) | **Removed.** The local demo is one Owner presenter, who is allowed every step (`getActor(ctx, "owner", …)` in `convex/deals.ts` and `convex/receiving.ts`). | — | Don't show role switching |

---

## 3 · Lalamove at `4c2cc97`

| Capability | Status | Evidence | Source |
|---|---|---|---|
| Lalamove card in Delivery: masked API key and secret, "Malaysia · Sandbox", **Connect**, "Checking with Lalamove…", **Test connection**, **Replace keys**, **Disconnect** | Implemented | **Verified here** (disconnected state only); **tested (mocked)**: browser harness 49/49 reported at `00f56ae` | `src/components/delivery/lalamove-connection.tsx`, `src/local/lalamove-client.ts`, `src/local/routes.ts` |
| Connection check: signed `GET /v3/cities` on `https://rest.sandbox.lalamove.com`, `Market: MY`, 10 s timeout. Only `GET /v3/cities` and `POST /v3/quotations` are allow-listed. | Implemented | Tested (mocked, signature-checking stand-in `src/local/lalamove-mock.ts`). **No live call is evidenced anywhere.** | `src/local/lalamove.ts` (`SANDBOX_URL`, `ALLOWED_CALLS`, `TIMEOUT_MS`) |
| Credential handling: server memory only for this run; never disk, `.env.local`, Convex, browser, chat or logs; errors redacted; keys pasted into Jarvis's chat are refused | Implemented | Tested (mocked) | `src/local/lalamove.ts` (`redact`), `docs/local-demo.md` |
| Vehicle list from the live city list, cached 24 h. If it isn't loaded, illustrative sizes labelled "(sample size)": Van 210×120×120 cm / 500 kg; Lorry 10ft 300×160×160 / 1000 kg; Lorry 14ft 420×190×190 / 2000 kg | Implemented | Tested (mocked) | `src/local/lalamove.ts`, `convex/lalamove.ts` (`FIXTURE`), `src/components/delivery/shipment.tsx` |
| Cargo: package count, L×W×H and weight with their source, "Measured at receiving", "Catalogue · not measured" or "Entered by staff"; unknown stays unknown and blocks quotes; bounding-box fit per vehicle | Implemented | Tested (mocked, unit) | `src/components/delivery/shipment.tsx`, `src/domain/vehicle.ts`, `convex/quotes.ts` |
| Quotes: 1–4 fitting vehicles per request, deduplicated per deal version and vehicle, unexpired quotes reused, rate-limited. Result: returned total, currency, breakdown, request time and **returned** expiry (none invented). Changing cargo, route, quantity or schedule makes quotes stale. | Implemented | Tested (mocked). **No live sandbox quote evidenced.** | `convex/quotes.ts` (`request`, `save`), `convex/lalamove.ts` (`fetchQuote` → local bridge `/internal/lalamove/quote`, 25 s) |
| Failures (unsupported route or vehicle, 401/403/422/429, timeout) stored and shown as failed quotes, with **no substitute price in local mode** | Implemented | Tested (mocked) | `convex/lalamove.ts` (comment: "Real failures stay failures"), `src/local/lalamove.test.ts` |
| Hosted mode only: Convex env keys; a "Saved demo" fallback quote (labelled, never ranked or approved) on auth or network errors | Implemented | Code only | `convex/lalamove.ts`, `convex/quotes.ts` (`demo_fallback`) |
| Seeded quote examples on D-1002: current, unloading unknown (incomplete), expired, and a **labelled failed-sandbox example (no request sent, no price)**; one quote each on D-1004 to D-1007 | Implemented | Seed tests (`convex/seed.test.ts`) | `src/domain/seed-scenarios.ts` |
| **A sandbox quote authorising a sale** | **Never.** Only a verified manual carrier reply can (`convex/deals.ts:52–53`). | Code; seed tests | — |
| **Booking a driver or placing an order** | **Not built, and refused by design.** No `/v3/orders`; tests assert it's never called. | Tested | `src/local/lalamove.ts` header comment |
| Jarvis delivery tools: `list_delivery_deals`, `get_delivery`, `get_delivery_quotes`, `request_delivery_quotes` (sandbox prices only; refuses an incomplete shipment, unconfirmed cargo, a non-fitting vehicle or a disconnected Lalamove) | Implemented | Tested (mocked provider, mocked Lalamove) | `src/local/delivery-tools.ts` |

**What a live Lalamove demo needs:**
* the team's **Lalamove sandbox key and secret for Malaysia** (`pk_test_…` / `sk_test_…`), entered by a person in the page;
* internet access;
* a deal with buyer, destination coordinates, collection time and confirmed cargo. D-1002 is ready.

The branch's own Mac acceptance steps are in `docs/local-demo.md` §"Lalamove sandbox quotes: evidence and Mac acceptance", steps 1–10. **None of them is recorded as done.**

---

## 4 · Jarvis (local agent) at `4c2cc97`

| Capability | Status | Evidence | Source |
|---|---|---|---|
| **Chat panel** in the app:<br>• `Ask, or type / for commands`;<br>• streamed answers with tool cards (Arguments, Result, duration);<br>• **Stop**, "New conversation";<br>• the status "Jarvis not connected · Log in · Check again", or "Connected · Claude" with the model;<br>• the footer "Jarvis · Claude · <model>" | Implemented | Verified here (disconnected state); tested (mocked), browser harness 32/32 at `ab4491d`, 49/49 at `00f56ae` | `src/components/jarvis/jarvis-chat.tsx`, `agent-login-dialog.tsx`, `src/local/agent-client.ts`, `src/local/routes.ts` |
| **Offline navigation (no key):**<br>• "Where can I put my new sofa?", "show me the sofas", "any mirrors ageing?", "open the delivery quotes";<br>• opens the stage, flies the map to the floor and zone, highlights bays, shows a dismissible "Showing …" chip | Implemented | **Verified here** (screenshot 03). Applied in the browser before any model call. | `src/domain/navigate.ts`, `src/navigate.ts`, tool `show_in_warehouse` |
| **Slash commands:** `/delivery`, `/replenish`, `/login`, `/logout`, `/commands`. An exact command ID wins. | Implemented | `/delivery` **verified here**; tested | `src/local/commands.test.ts`, `ui-regressions.test.ts` |
| **Model-backed answers.** Five warehouse tools: `get_inventory`, `get_movements`, `get_purchase_orders`, `analyze_reorder`, `show_in_warehouse`. Plus the four delivery tools in §3. | Implemented | Tested (mocked). **Reported live:** Cloud, 24 Oct, with a real Claude API key; an `analyze_reorder` answer matching the plan ("12 units, RM5,100, 6 bays…"); `WAREORB_E2E_LIVE=1` browser test 32/32. | `src/local/agent.ts` (`ANALYST_PROMPT`), `src/local/warehouse-tools.ts` |
| **What Jarvis cannot do** | The prompt says "You cannot post stock, record purchases or dispatch goods". The tool allowlist has no write tool except `request_delivery_quotes`, which creates quote records and a sandbox price request. **Approval, posting, purchases, carrier reference and collection stay human actions in the UI.** | Tested (allowlist) | `src/local/agent.ts`, `agent.test.ts` |
| **"Read with Jarvis":** a receipt photo, document or note becomes an editable draft (SKU, qty, unit, condition, packages, L×W×H, weights). Unknowns are blank; unreadable parts become questions; a blurred photo gives an error and no lines. | Implemented (needs a model that reads images) | **Reported live** with a Claude key (Cloud, 24 Oct, on a synthetic printed note). Real handwriting **not verified**. | `src/local/agent.ts` (§Reading delivery evidence), `src/domain/receipt-reading.ts` |
| **Voice input** ("Talk") and voice notes on receipts | Implemented. Uses Chrome's built-in speech recognition, which needs the network. The original recording is always kept. | **Not verified** (needs a microphone) | `jarvis-chat.tsx`, `docs/local-demo.md` §Using the demo |

**Providers and authentication** (`src/local/agent.ts`):
* **Web login.** Only a **Claude API key**, entered in a masked form. It's checked against Anthropic (a model-metadata request, 15 s limit) and kept in server memory only. The default model is `anthropic/claude-sonnet-5-5`. `/logout` disconnects.
* **Developer fallback, before any web login:**
  * Pi's own login on this Mac (`pi` → `/login`, stored in `~/.pi/agent/auth.json`), or `ANTHROPIC_API_KEY` in the shell that runs the demo;
  * the default order is `openai-codex/gpt-6.1-sol` (**Codex / ChatGPT subscription via Pi OAuth**), then `anthropic/claude-sonnet-5-5`;
  * `WAREORB_AGENT_MODEL` overrides the order.
* **Codex subscription:**
  * **supported in code only through Pi's login**, not through the web form;
  * **not tested live** (the docs say "Pi subscription login not tested");
  * on this Mac on 25 Oct, no fallback provider was configured (the demo said "Jarvis not connected yet").
* **Pi is not reused from Codex:** Pi doesn't read `~/.codex/auth.json` (`docs/local-demo-handoff.md`).
* **Branding:** the UI never shows "Pi" or the SDK (`src/local/branding.test.ts`).

---

## 5 · Credentials by feature

| Feature | Needs | Who provides it | Showable without it? |
|---|---|---|---|
| Warehouse, twin, receiving (manual), ageing, sales, verified manual reply, approval, carrier reference, collection, history, replenishment | Nothing (local demo) | — | **Yes** |
| Jarvis offline navigation and slash commands | Nothing | — | **Yes** |
| Jarvis answers with tool cards; Read with Jarvis | A Claude API key (web login), **or** Pi's Codex-subscription login | Team or user, entered by a person. Claude never handles it. | No: shows "Jarvis not connected" |
| Lalamove connection and sandbox quotes; Jarvis `request_delivery_quotes` | Lalamove **sandbox** key and secret (Malaysia) | Team or user, entered by a person | No: shows "Lalamove not connected" |
| Voice transcripts | Chrome speech recognition (network) and a microphone | — | The recording only, with "No transcript" |
| Hosted app | Clerk, a Convex cloud deployment, Vercel | Team | Not needed for video |

---

## 6 · Simulated versus verified

| Item | What it is |
|---|---|
| All seeded data: items, batches, receipts, deals D-1001 to D-1008, buyers, phone numbers `+60 3-0000 …`, staff and carrier names "(synthetic)" | **Synthetic.** The header shows "Local demo · synthetic data". |
| Seeded carrier replies; the **Demo** button's replies | **Synthetic.** They can't authorise anything. |
| The seeded "failed sandbox quote" on D-1002 | **Labelled example.** No request was sent. |
| D-1004 to D-1007 history (submission, approval, collection, rejection) and D-1006's **Simulated booking SIM-D-1006** | **Demo history fixtures**, labelled |
| Lalamove sandbox quotes (once connected) | **Real sandbox API responses**: prices only, not bookings. Not evidenced live yet. |
| Jarvis answers (once connected) | **Real model output** over the real ledger tools. Reported live (Cloud); not verified here. |
| Vehicle sizes "(sample size)" | **Illustrative**, until the live city list loads |
| Vehicle fit | **A bounding-box estimate.** Loading and stacking still need a person. |

---

## 7 · What suits the extended promo (strongest first)

1. **Jarvis "take me there" (no key, verified).** A question in Jarvis makes the map fly to the zone and light the free bays, with the "Showing …" chip. It's natural with the film's camera language: the camera move *is* the answer.
   * Caveat: without a connection, an orange "Jarvis isn't connected" notice appears next in the chat. Either connect a provider for the take, or frame and time the shot so the notice isn't the subject. Never fake a connected badge.
2. **Measured receiving with human confirmation.** Measurements, condition confirmed **Good**, bays, "counted and checked", then **Post**: stock rises once (no credentials).
3. **The approval guard.** A synthetic reply can't be approved. A person records the carrier's actual reply (a labelled test entry), the owner approves, the bays are reserved, then **Record N collected** frees the bay (no credentials).
4. **Lalamove sandbox quotes (credentials needed).** Connect → `MY · n vehicle types` → cargo with its measurement source → **Fits** → **Get sandbox quotes**, with total, breakdown and returned expiry. Then change the weight and the quote goes **stale**. Show only if a live sandbox quote actually succeeds on camera; label it "Lalamove **sandbox** · quote only · nothing booked".
5. **Jarvis with tools (credentials needed).** "What should we reorder?" → `analyze_reorder` tool card → streamed answer that matches the Replenish panel. "What did Lalamove quote for D-1002?" → `get_delivery_quotes` card with the same total as the screen. Jarvis refusing to quote a non-fitting vehicle is a strong honesty beat.
6. **Read with Jarvis (credentials needed):** a photo becomes editable draft lines, with questions where it can't read. Use a synthetic printed note; handwriting isn't verified.

---

## 8 · Must not be claimed

* That WareOrb **books a Lalamove driver**, places orders, tracks deliveries or takes payments. It requests **sandbox quotations only**.
* That a sandbox quote is a real market price, or that it authorises a sale.
* That Jarvis **approves, posts, buys or dispatches** anything. Jarvis reads, navigates and requests sandbox quotes; people decide.
* That "AI reads your handwriting" is proven. Only a synthetic printed note was read live (Cloud).
* That Codex-subscription Jarvis was tested live (it wasn't), or that any model or Lalamove call in the film was live unless it happened on camera.
* That the app is launched, hosted for customers or used by real merchants; any measured saving, accuracy or adoption figure; any Orbyte endorsement.
* Seeded names, buyers, quotes or history as real records.

---

## 9 · Doc and code inconsistencies found

* `docs/local-demo.md` §What runs says the analyst has "only four read-only warehouse tools". The code at `4c2cc97` has **five warehouse tools** (including `show_in_warehouse`) **plus four delivery tools**.
* `convex/lalamove.ts` line 1 says "booking is simulated". In the live flow there is no simulated booking; the only simulated booking is the seeded D-1006 fixture.
* The earlier video docs (`pitch/pitch-plan.md`, `HANDOFF.md`) assumed `e935ae6`, Clerk sign-in, no Lalamove UI and no Jarvis agent. All four assumptions are **outdated**; see `VIDEO-EXTENSION-HANDOFF.md` §6.
