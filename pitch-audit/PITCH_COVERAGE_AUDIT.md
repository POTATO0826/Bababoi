# WareOrb — Product-to-Pitch Coverage Audit

Audit date: 24 October 2026 (MYT evening). Auditor: independent reviewer (Claude Code), following the team's `HANDOFF.md` (supplied as an upload; it is not committed to this repository).
Scope: audit and recommendations only. No source code, deck, script or video was changed. The only files written are the three in `pitch-audit/`.

> **Time-critical:** the Participant Handbook lists the Phase 1 deadline as **25 Oct 2026, 7:59:59 AM MYT** for six items, including the 5–7 minute pitch video and the GitHub link (`sdc2026-lab/Reference/SDC_Hackathon/3. Official Handbooks/…/markdown.md:388`). The P0 items below are ordered so they can be finished before that deadline.

---

## 1. Executive verdict

WareOrb's built product is **substantially stronger than the pitch shows**. The deck is accurate and careful, but it under-sells the evidence that matters most to the judges. The full operating journey (receive → ageing flag → sale → quote comparison → owner approval → collection → replenishment → activity history) exists in code. It is covered by **302 passing automated tests**, which this audit ran itself on `backend-production`. Its "people stay in control" safeguards are unusually concrete.

The single biggest risk is **not an overclaim in the slides**. It is a **build mismatch**. The demo script describes the `Vince` build, where synthetic carrier replies can be approved, a "simulated booking" is shown and roles are switched from a dropdown. The team's own video plan chose `backend-production`. On that build, synthetic quotes are **refused** for approval, there is no simulated booking, and the local demo signs in as a single Owner. Recording the script on the wrong build will fail on camera or force unlabelled edits.

The second risk is administrative but rubric-critical. The repository's default branch (`main`) contains **only the 3D UI**, while the brief says the GitHub repo must "reflect what you demo".

The biggest opportunities are cheap, one-line additions:

- make the human-control and error-catching safeguards explicit (must-haves #3 and #4, 25% Problem-Solution Fit);
- show the AI reading a delivery note, which proves "AI only where it adds value" for the 30% Innovation criterion;
- add one proof-of-build line ("302 automated tests pass") for the 25% Feasibility criterion;
- add the **PDPA/privacy sentence the brief requires**, which is currently absent from the spoken pitch.

Timing is tight: the narration runs at about 6:44 at 130 wpm against a hard 7:00 limit, and the 21-second promo would push it over.

## 2. Inputs and audit scope

| Input | Found at | Version reviewed | Notes |
|---|---|---|---|
| Pitch deck (latest) | `deliverables/WareOrb - Complete Journey Pitch.pptx` | commit `46fd1be` (24 Oct 23:30 MYT), 8 slides | Rendered to images and inspected visually, plus text and speaker notes. Text-only design; no screenshots. |
| Older decks | `deliverables/WareOrb Pitch - Business Value Revision.pptx`, `… - Mentor Revision.pptx` | same commit, 10 slides each | Slide text is identical; they differ in one notes paragraph. **Superseded** by the Complete Journey deck (the script says so). They are used only for comparison: their RM400/RM200 economics and "Capacity reallocation: in development" labels are out of date. |
| Pitch script and recording guide | `deliverables/WareOrb - Pitch Script and Recording Guide.md` | same commit, status `recording-draft` | Speaking script (slides 1–8) plus a 2:50 demo script. |
| Competition brief and rubric | `quinnDzq/SDC2026-Lab` → `Reference/SDC_Hackathon/2. Domain 2/Copy of Domain 2 (1)/markdown.md` | clone `67111f4` | Preliminary rubric: Innovation 30 / Problem-Solution Fit 25 / Feasibility 25 / Clarity 20. Six must-have features. |
| Video rules | `…/3. SDC Hackathon Official Participant Handbook/markdown.md:264–266, 388` | same | **5–7 min** video; deductions for every 30 s over. Phase 1 is due 25 Oct 07:59 MYT. |
| Product code (primary) | branch `backend-production` @ **`ea79cae`** (24 Oct 15:38 UTC) | full source read; `bun run check` executed | Newest build. It contains everything in `Vince` plus server-side roles, verified quotes, a local demo mode and AI receipt reading. |
| Product code (script-matching) | branch `Vince` @ **`8f4d6df`** | key files diffed against `backend-production` | The build the demo script and the 21 s promo describe. |
| Product code (default branch) | `main` @ `614ef5e`; this branch (`codex/wareorb-pitch-deliverables`) @ `46fd1be` | read | **UI prototype only.** No workflow, no backend. |
| Other branches | `backend` @ `5708e52` (SQLite receiving reference); `promo/wareorb-video` @ `cc8ca57` | skimmed | `backend` is a separate receiving reference that is not in the demo path, so it was not audited in depth. The promo branch holds the 21 s promo, real UI captures and an approved video plan (`promo/pitch/pitch-plan.md`). |
| Demo video | Not provided | — | Not yet recorded, per the promo handoff. Demo coverage is judged against the demo **script** and the promo's real UI captures. |

**Could not inspect or verify:** the hosted app (`wareorb.vercel.app`, reported in `docs/local-demo-handoff.md:213–214`), the original mentor audio, the PRD and Tools Declaration, and any live provider (Claude, Lalamove, Fish) or microphone/handwriting path. No credentials were used.

**Executed:** `bun install --frozen-lockfile && bun run check` on an export of `backend-production@ea79cae`. Result: **241 Bun tests passed, 0 failed; 61 Convex tests passed; both typechecks and the production build passed (exit 0).** Logged "401 invalid api key" lines are deliberate error-path tests using mocked providers.

## 3. Verified product overview

The full inventory is in `FEATURE_COVERAGE_MATRIX.csv` (34 rows). Grouped by value:

**High value: the core journey (implemented, test-covered, captured in real UI)**
- **Receiving with human verification.** Draft → count check → condition → bay → post. Posting is blocked until a person ticks "counted and checked". Duplicate supplier notes and double posting are refused (`convex/receiving.ts:199–290`).
- **Ageing-stock flags with reasons.** "120 days · 0 sold in 30 days · bays A-1-01, A-1-02", plus caveats such as "newer batch is 18 days old" (`src/domain/ageing.ts:28–71`).
- **Sale handoff and buyer offer.** Confirmed destination (Malaysian coordinates), collection time, access and vehicle-fit check (`convex/deals.ts:61–176`, `src/domain/vehicle.ts`).
- **Quote comparison that never treats an unknown cost as zero.** Expired, stale and incomplete quotes are set aside with a reason (`src/domain/costs.ts:34–87`).
- **Owner approval.** Shows net recovery "before stock cost · not profit", reserves the stock without moving it, requires a reason to reject, and binds to the proposal version (`convex/deals.ts:202–266`).
- **Warehouse collection.** Stock falls and the bay is freed only now. Supports partial collection, and retries are safe (`convex/deals.ts:308–359`).
- **Explainable replenishment.** Coverage rule with visible arithmetic ("9 − 3 available − 2 incoming = 4"), with one shared budget and bay allocation across all items (`src/domain/replenish.ts`).
- **Activity history** for deals and receipts (`convex/lib.ts:10`, `convex/ledger.ts:51–78`).
- **3D digital twin** whose bays change colour by state: ageing violet, reserved teal, freed green (`src/workflow.ts:101–119`).

**High value: controls and proof (implemented, under-pitched)**
- **Server-enforced roles** (Owner / Sales / Warehouse) on every action (`convex/access.ts:23–43`, with role lists in each mutation). On `backend-production`, sign-in uses Clerk with staff invitations and deactivation. On `Vince`, roles are simulated from the header (the brief allows simulated RBAC).
- **Jarvis cannot approve, post or collect.** Slash commands "only navigate" (`src/commands.ts:89`). The local AI analyst has exactly four read-only tools (`src/local/warehouse-tools.ts:146–166`).
- **On `backend-production` only:** synthetic or sandbox quotes **cannot authorise a sale** ("Sandbox and demo quotes cannot authorize real stock operations", `convex/deals.ts:53–54`).
- **302 automated tests passing**, plus a reported 32-check browser harness and a reported hosted acceptance run.

**Medium value: AI and convenience (implemented, key-dependent)**
- **AI reading of delivery-note photos** into an editable draft. Unknowns stay blank and unreadable parts become questions. This was live-tested by the build team on a synthetic printed note (`docs/local-demo.md:211–218`); handwriting has not been verified.
- **Voice notes** kept as receiving evidence (`convex/receiving.ts:113–120`).
- **Jarvis AI analyst.** Answers from live ledger data with visible tool calls, and was live-tested with a Claude key (`docs/local-demo.md:207–211, 297–306`). It needs a key; without one, Jarvis says "not connected".
- **Bilingual English/中文 voice and commands** (`src/voice/voice.ts:22`, `src/commands.ts:52–58`, `src/roles.ts:21`).
- **Lalamove quotation connector** with signed requests, a rate limiter and a labelled fallback (`convex/lalamove.ts`, `src/domain/lalamove.ts`, `convex/limits.ts`). It is sandbox only and was **not tested with live keys**.
- **Package measurements and weights** with honest totals ("at least … (incomplete)").

**Planned or not built (do not imply as delivered):** WhatsApp end-of-day report, Excel/POS import, Orbyte connector, real carrier booking or payment, statistical (Poisson) forecasting, live-video capture, and sending one enquiry to several carriers.

## 4. Top missing or underrepresented features (ranked by pitch impact)

| # | Feature | Code evidence | Current pitch coverage | Why it matters to judges |
|---|---|---|---|---|
| 1 | **Human-control safeguards made visible:** server-checked roles; Jarvis cannot approve/post/collect; approval binds to the reviewed version; rejection needs a reason; a history entry for every action | `convex/access.ts:23–43`; `src/commands.ts:89`; `convex/deals.ts:202–266`; `convex/lib.ts:10` | Deck S7: one generic line ("Shared roles, approvals and activity history"). Script S3/S4 and demo cover approval and history; **no line says who may act on what**. | Must-have #4 ("show who may view or act on the data") and the Problem-Solution Fit criterion (25%) ask for exactly this. It is the product's strongest differentiator against "a chatbot on a spreadsheet". |
| 2 | **Error-catching rules ("accuracy and consistency")**: an unknown cost is never zero; expired/incomplete quotes are set aside; a duplicate delivery note is blocked; stock can't be posted twice; stale edits are rejected | `src/domain/costs.ts:34–87`; `convex/receiving.ts:211–216`; `convex/deals.ts:46–58, 313–320` | Demo shows the quote case (well scripted). Deck: none. Script: "makes missing costs visible" only (S7). | Must-have #3 asks the team to show *how* the workflow improves accuracy. Today the judges see one example and have to infer the rest. |
| 3 | **AI reads the messy input; rules handle the money.** Photo/document reading into an editable draft, plus voice-note evidence | `convex/ai.ts` (`extractReceipt`); `src/local/agent.ts` (`readDeliveryEvidence`); `docs/local-demo.md:211–218` | Deck S4 footnote: "Receiving records supply the data". Script S4: "AI can help interpret inputs". The demo **deliberately skips** extraction. | Innovation (30%) rewards "AI used only where it adds value". This is the clearest place where it does. It is currently invisible. |
| 4 | **Proof of build:** 302 passing automated tests and an end-to-end journey across three roles | `bun run check` output in this audit; `docs/local-demo.md:188–206`; `convex/business.test.ts` | None in deck or script. | Feasibility (25%) asks for the journey "backed by the GitHub repo". One line of evidence costs about 5 seconds. |
| 5 | **Jarvis gives grounded, explainable answers, not chat.** It shows the tool it used and the numbers come from the ledger. | `src/local/warehouse-tools.ts:146–166`; `src/components/jarvis/jarvis-chat.tsx` | Deck S4 "Ask about stock"; script S4. Demo uses Jarvis only as a launcher. | The rubric explicitly penalises "a re-skinned chatbot". Showing a tool card answering "What should I reorder?" makes the difference concrete. It needs a live key. |
| 6 | **Bilingual English/中文 voice and commands** | `src/voice/voice.ts:22`; `src/commands.ts:52–58`; `src/roles.ts:21` | None. | "Easy to learn without costly training" for Malaysian SMEs, and staff use the language they already work in. It is cheap to mention and to show (one spoken or typed "有什么旧货？"). |
| 7 | **Manual fallback: works without any AI or carrier key** | `docs/production-plan.md` ("Manual receiving, verified manual quotes…must support real operations when optional AI…unavailable"); `docs/local-demo.md:71` | None. | Feasibility asks for the "hardest risk and a plan or fallback". |
| 8 | **Reusable building blocks:** shared business rules used by server, browser and AI; configurable thresholds; a carrier connector | `src/domain/*` (header comment in `HANDOFF.md`); `convex/seed.ts:124–125` (settings); `convex/lalamove.ts` | Deck S7 "A repeatable workflow for other merchants" (vague). | Must-have #5 (Orbyte fit and reuse) and the good-to-have "reusable building block". |

## 5. Unsupported, exaggerated or contradicted pitch claims

| Severity | Existing wording and location | Evidence | Safe correction |
|---|---|---|---|
| **P0 – contradiction with the planned build** | Demo script 1:08–1:40: "Load synthetic replies… Select the current, complete RM280 quote and send to owner". Demo 0:00–0:10: "The booking is simulated." Demo 1:40–2:02: "Show simulated booking label." | On `backend-production`: `convex/deals.ts:53–54` refuses synthetic or sandbox quotes; `:259` sets no booking; `:268–286` requires a real carrier reference; `:322` blocks collection until one exists. The promo plan chose `backend-production` (`promo/pitch/pitch-plan.md` §0). On `Vince` the script works: `costs.ts:69–76` ranks synthetic "manual" quotes, and `deals.ts:229–233` creates `SIM-7001`. | Pick one build (see §8 P0-1) and align every demo step with it. |
| **P0 – contradiction** | Demo 0:48–1:08 "Hand the batch to Arif. Switch to Sales"; "Warehouse role"/"Owner role" switches throughout | `backend-production` local demo: always signed in as one Owner presenter, with no role switch (`src/components/header.tsx:23–53`; `docs/local-demo.md:3–4`). The button is "Start sale" (`src/components/detail/batch-detail.tsx:49`). `Vince` has the header role selector (`Vince:src/components/header.tsx:40`). | Same decision as above. On `backend-production`, narrate "the presenter acts as Owner; in the hosted version each person signs in with their own role, and the server checks it on every action." |
| **P0 – repository does not reflect the demo** | Brief §9: "A GitHub repository link is required… reflects what you demo." | `main` @ `614ef5e` has only UI (`src/actions.ts` keyword voice; no `convex/`). The workflow exists only on `Vince` and `backend-production`. The repository is private (`list_repos` shows `visibility: private`); Handbook §10.3 requires it to be public. | Before submission, make the demoed branch the default branch (or submit a link to that branch) and set the repository public or add the committee as collaborators. [VERIFY: the team's chosen submission link] |
| Medium – implied capability not built | Deck S7 "Existing records can remain"; script S7 "Existing spreadsheets or point-of-sale records can remain inputs." | No import or export code (search for csv/xlsx/spreadsheet/POS import found nothing). Speaker notes already call it "proposed". | "Merchants can keep their spreadsheets. Importing them is on our roadmap." On the slide: "Keeps existing records (import: roadmap)". |
| Medium – depends on a live key | Deck S4 "Ask about stock"; script S4 "staff can ask about stock … in ordinary language". | Local demo free text goes **only** to the AI analyst; without a key it replies "Jarvis not connected" (`src/actions.ts:327–331`). `Vince` without a key falls back to keyword rules (`Vince:src/actions.ts:322, 357`). | Either show one live AI answer in the demo (preferred), or say "ask about stock — by command offline, or in plain language with AI connected". |
| Medium – number inconsistency | Deck S6 "RM900"; script S6 and demo use RM900 (packing RM20). | The 21 s promo shows **RM920** (no packing) from the real UI (`promo/storyboard.md:86, 140`). The app's default packing is 0 (`convex/deals.ts:92`). | If the promo opens the video, make the demo match (RM920, packing 0) and update S6. Otherwise drop the promo. Never show both numbers. |
| Low – wording overstates demand insight | Deck S8 "Make room for the next **hot** seller"; deck S1 "stock that sells". | Replenishment uses past net sales and a coverage rule, not a forecast (`src/domain/replenish.ts:42–60`). The script's own S8 heading says "next **proven** seller". | Use "next proven seller" on the slide too. |
| Low – unspoken required content | Brief §6 requires a brief PDPA/privacy explanation. | The spoken script never mentions privacy. Only the S7 speaker-note "SOURCE / CLAIM LIMITS" covers it. | Add one spoken sentence (see §8 P0-3). |

Other material claims were checked and are **supported**: 120 days / 0 sales / 2 bays (`src/domain/seed.ts:18–19`, ageing rule 90 d / 30 d / 0 sales at `:255`); approval reserves without moving stock; collection frees A-1-01 while A-1-02 stays occupied; the replenishment arithmetic 12 sold → target 9 → 9 − 3 − 2 = 4 (`replenish.ts:46–57`, matching the real UI capture); RM1,200 − RM280 − RM20 = RM900 when packing is entered; "AI interprets, rules calculate"; and "Synthetic records".

## 6. Rubric and narrative assessment (Domain 2 preliminary rubric)

| Rubric element | Current pitch | Assessment |
|---|---|---|
| **Innovation & Creativity (30%)**: specific pain; original product; AI only where it adds value; not a re-skinned chatbot | Specific pain is strong (S2: one batch, 120 days, two bays). Capacity reallocation as a journey is distinctive. | **Weakest on the AI story.** The only AI shown is Jarvis as a launcher, which invites the "chatbot" reading. Show AI reading a delivery note, or a grounded tool answer. Add bilingual use. |
| **Problem-Solution Fit (25%)**: removes one burden; accuracy and consistency; easy to learn; permissions + approval + activity record; Orbyte fit; within boundaries | Approval and history are shown in the demo. Orbyte fit is "proposed". | Permissions and accuracy are **implicit**, so state them. PDPA is missing (P0). "Easy to learn" is never argued: role-specific suggestions, `/` commands and bilingual input are the evidence. |
| **Feasibility of Build (25%)**: journey running live, backed by repo; synthetic data; hardest risk named with a fallback | The demo covers the full journey (good). The risk ("unreliable input data") is spoken in S7. | Missing **proof** (tests) and a **fallback** (manual operation without AI or keys). A repo/branch mismatch would undercut this criterion directly. |
| **Clarity of Proposal (20%)**: problem → approach → expected outcome with a **measurable benefit**; explainable cold; format and length | The flow is clear and the slides are uncluttered. | The expected outcome is framed as an "adoption test" plus RM900 recovery, which the deck itself says is not a benefit. **No measurable benefit is named on a slide.** Name the metric (e.g. "cargo details typed once instead of re-typed per carrier"; "decision time from flag to approval") as an *expected* outcome to be measured. Do not invent numbers. |
| Trigger → data → decision → approval → outcome (§3 of brief) | S3 lists five steps, but not in the brief's words. | Label S3's steps with the brief's own terms. Judges score against that language. |
| SDG | S7 "SDG 8.2". | Fine. 8.3 (SME growth) is also named in the brief and can be added at no cost. |
| Business model (optional) | RM200/month "adoption cost" assumption in the S6 narration. | Acceptable as labelled. One optional line naming a proposed model (per-warehouse subscription via Orbyte) is a P2. Do not state a price. |

## 7. Timing and clarity check

**Assumption: 130 words per minute**, the script's own target. The spoken narration is 507 words (538 including the slide-5 stage direction), and the demo narration is 265 words.

| Segment | Words | Allocation | Needed at 130 wpm | Status |
|---|---:|---:|---:|---|
| S1 | 41 | 20 s | 18.9 s | OK |
| S2 | 76 | 35 s | 35.1 s | Tight |
| S3 | 86 | 45 s | 39.7 s | OK |
| S4 | 72 | 30 s | **33.2 s** | **Over by 3 s** |
| Demo (S5) | 265 | 170 s | 122 s of speech | OK; room for app pauses |
| S6 | 109 | 50 s | 50.3 s | Tight; the most disclaimer-heavy |
| S7 | 84 | 35 s | **38.8 s** | **Over by 4 s** |
| S8 | 39 | 20 s | 18.0 s | OK |
| **Total** | | **6:45** | **about 6:44 + transitions** | **No real margin before 7:00** |

- The handbook deducts points for every 30 s over the limit (`…Handbook/markdown.md:266`). A natural slowdown to 120 wpm adds about 20 s, which would cross 7:00.
- **The 21 s promo cold open is not in this running order.** Adding it gives about 7:06, which is over the limit. Either leave it out, or cut about 45 words elsewhere.
- **Overload:** S6 spends 4 of its 6 sentences on what RM900 is *not*. Keep one caveat on screen and one spoken. The careful framing is right, but it should not take 50 seconds.
- **Jargon to avoid saying aloud:** "capacity reallocation" is used as a product name, but the app never shows it (the UI says Ageing stock / Deals / Approvals / Collection / Replenish). Say once: "In the app, that's five screens: Ageing, Deals, Approvals, Collection, Replenish."
- **Terminology drift:** "hot seller" vs "proven seller"; "Hand to Arif" vs "Start sale"; "cash recovered" (slide) vs "net recovery" (app). Align these to the app's words.
- **Transitions:** S4 → demo ("Let's follow one batch") and demo → S6 are good.

## 8. Prioritised action plan

**P0 — fix before pitching (all must be done before the 25 Oct 07:59 MYT deadline)**
1. **Decide the recording build and align the demo script to it.**
   - *Recommendation for tonight: record on `Vince` @ `8f4d6df`.* The script was written for it (role switch, synthetic replies approvable, `SIM-7001`), it needs no keys, and it matches the promo footage.
   - Then add one spoken line plus the S4/S7 changes in `RECOMMENDED_PITCH_EDITS.md` stating that the hardened `backend-production` build adds server-checked sign-in and refuses unverified quotes, backed by 302 tests.
   - *If you record `backend-production` instead:* rewrite demo steps 0:48–2:25 per the alternate script in `RECOMMENDED_PITCH_EDITS.md` §Demo-B (verified test quote, carrier reference, single Owner presenter) and drop every "simulated booking" mention.
2. **Make the GitHub submission match the demo.** Set the default branch (or the submitted link) to the branch that contains the demoed code, and make the repo public or add the committee accounts (Handbook §6.1.3, §10.3). `main` currently shows only the UI.
3. **Add the required PDPA/privacy sentence** to the spoken S7 (copy in the edits file).
4. **Fix the RM figure consistency.** Use RM900 everywhere with no promo, or RM920 everywhere with the promo.

**P1 — strong improvements**
5. Make the control safeguards explicit on S4 or S7 (who can do what; Jarvis can't approve/post/collect; every action logged).
6. Add an "errors it catches" line (unknown ≠ zero, expired/incomplete quote set aside, duplicate note blocked, no double posting).
7. Show AI reading a delivery note: a 6–8 s demo beat or one screenshot on S4. [VERIFY it works on the recording machine with a key; the build team tested it only on a printed synthetic note.]
8. Add proof of build ("302 automated tests pass on the demo build", dated) to S7. [VERIFY by re-running `bun run check` on the exact submitted commit.]
9. Name one measurable expected benefit on S6, labelled "to be measured in pilot".
10. Relabel S3's steps with the brief's words: Trigger / Connected data / Decision / Human approval / Visible outcome.
11. Trim the narration from 507 to about 485 words (about 6:34 total at 130 wpm) to recover margin before 7:00 (cuts are in the edits file).
12. Replace text-only S2 and S6 with real UI captures (the promo branch already has clean ones: `c05-ageing-batch.png`, `c08-approval.png`, `c11-replenish.png`). Label them "earlier build" if they don't match the recorded build.
13. Say "Keeps existing records — import on roadmap" instead of implying import exists.

**P2 — optional**
14. A bilingual beat: type or say "有什么旧货？" to open ageing stock.
15. One line on the Lalamove connector as a reusable building block, labelled "sandbox connector, not live-tested".
16. Add SDG 8.3 alongside 8.2.
17. A one-line proposed business model (per-warehouse subscription through Orbyte), with no price.
18. Change "hot seller" to "proven seller" on S8.

**Leave out intentionally**

| Implemented item | Why leave it out |
|---|---|
| 3D rendering internals (instanced meshes, shadows, wall cut-aways, ~30 furniture templates) | Visual polish speaks for itself; there's no judging value in naming it. |
| Local demo isolation, loopback checks, in-memory key handling, Pi agent framework, Clerk/Vercel/Convex operations, rate limiter | Too technical for a 7-minute pitch. Keep for Q&A or the PRD. |
| Idempotency, version numbers, request IDs | Mention only as the benefit ("can't post the same delivery twice"), never the mechanism. |
| Package measurement maths | Supports vehicle fit. Low airtime value. |
| Lalamove live quotes | Never tested with keys. Showing them risks a live failure and an unverifiable claim. |
| Poisson or seasonal forecasting, WhatsApp nightly report, Orbyte connector, Excel/POS import, payments, real booking | **Not built.** Roadmap wording only, if mentioned at all. |
| The `backend` SQLite receiving branch | Separate reference implementation, not in the demo path. |

## 9. Unknowns and validation requests

1. **Which build and commit will be recorded and submitted?** (`Vince@8f4d6df`, `backend-production@e935ae6` with Clerk test accounts, or `backend-production@ea79cae` local demo.) Every demo line depends on this.
2. **Which GitHub link will judges receive, and is it public?** The default branch is `main` (UI only).
3. **Is the 21 s promo part of the 5–7 min video?** This affects timing and the RM920/RM900 figure.
4. **Will an AI key be connected during recording?** If not, cut "ask in plain language" and the AI-reading beat, or describe them as "with AI connected".
5. **Does photo reading work on the recording machine with the team's own key,** and on a handwritten note? Reported as untested (`docs/local-demo.md:225–227, 264–266`).
6. **Hosted prototype link.** The Phase 1 submission needs a "Live/Functional Prototype link". `wareorb.vercel.app` is reported to exist with a Clerk *development* instance and a Hobby plan (`docs/local-demo-handoff.md:213–214`). Check that judges can sign in and see data, or document how to run `bun run demo`.
7. **Re-run `bun run check` on the exact submitted commit** before quoting a test count. This audit's 241 + 61 applies to `ea79cae`; `Vince` has fewer tests (about 20 domain tests per its handoff).
8. **Commit history rule (Handbook §6.3.5.5).** `main` has two large "Feat: UI added" commits. `backend-production` shows 25 commits over 22–24 Oct, so prefer submitting that history.
