# WareOrb — Recommended Pitch Edits (copy-ready)

These edits apply to `deliverables/WareOrb - Complete Journey Pitch.pptx` (8 slides) and `deliverables/WareOrb - Pitch Script and Recording Guide.md`, both at commit `46fd1be`. They keep the team's narrative order, tone and careful claim limits. Evidence and reasoning are in `PITCH_COVERAGE_AUDIT.md`; feature rows are in `FEATURE_COVERAGE_MATRIX.csv`.

Word counts assume **130 wpm**. With every spoken change below, narration drops from **507 to about 485 words**. The total runs to about **6:34** (demo unchanged at 2:50), compared with about 6:44 today, which leaves roughly 26 s before the 7:00 penalty line.

---

## 0. Decide first (P0): which build is recorded

Every demo line depends on this choice.

| | `Vince` @ `8f4d6df` | `backend-production` @ `ea79cae` (local demo) |
|---|---|---|
| Matches current demo script | **Yes, as written** | No: steps 0:48–2:25 must change (Demo-B below) |
| Roles | Header dropdown (simulated; allowed by the brief) | One Owner presenter; server checks roles |
| Synthetic carrier replies | Can be approved; booking `SIM-7001` | **Refused** for approval; a typed, labelled "verified" test quote and a carrier reference are needed |
| Keys needed | None (offline keyword Jarvis) | None for the workflow; Claude key for free-text Jarvis and photo reading |
| Matches 21 s promo footage | Yes (RM920, SIM-7001) | No |
| Test evidence | About 20 domain tests (per its handoff) | **302 tests** (run in this audit) |

**Recommendation for tonight's deadline: record `Vince` with the current script.** Then use the S4/S7 lines below to state, truthfully, that the hardened build adds server-checked roles and verified-quote enforcement. Make the GitHub link judges receive point at a branch that contains the demoed code. `backend-production` includes all of `Vince`'s history, so it is a good submission branch.

If the team can rehearse it tonight, recording `backend-production` is the stronger rubric story: it visibly refuses a fake quote, can show AI reading a delivery note, and is the build the tests cover. In that case use **Demo-B**.

---

## 1. Slide-by-slide edits

### Slide 1 — WareOrb (no change)
Optional: if the 21 s promo is **not** used, nothing changes. If it **is** used, cut S1 narration entirely and let the promo serve as the opener; that saves about 19 s.

### Slide 2 — What's the problem? (P1, visual only)
- **Before:** text stack "One model / 120 days in storage / 0 sales in the last 30 days / 2 bays still occupied".
- **After:** keep the three numbers on the left. On the right, place the real UI capture `promo/source/captured/ui/c05-ageing-batch.png` (branch `promo/wareorb-video`). It shows "120 days · 0 sold / 30d · A-1-01 · A-1-02" and the caveat "Newer batch B-2140-B of this model is 18 days old".
- Caption: `Real WareOrb screen · synthetic data` (add `· earlier build` if recording `backend-production`, whose button reads "Start sale" rather than "Hand to Arif").
- Spoken: no change (76 words).
- **Why:** this proves on the first content slide that the problem's numbers come from the product, not a slide. It also shows explainable flags (good-to-have "explainable decisions").

### Slide 3 — Capacity reallocation (P1)
- **Before:** `01 Spot ageing stock · 02 Hand the batch to sales · 03 Compare the delivery options · 04 Owner approves the plan · 05 Staff confirm collection`
- **After (keep the 5 rows; add the brief's words as small labels on the left):**

  | Label | Row |
  |---|---|
  | TRIGGER | 01 Old, unsold batch is flagged |
  | CONNECTED DATA | 02 Sales adds the buyer's offer and delivery needs |
  | DECISION | 03 Complete quotes compared; net recovery calculated |
  | HUMAN APPROVAL | 04 Owner approves → goods reserved, not moved |
  | VISIBLE OUTCOME | 05 Collection confirmed → bay freed → logged |

  Footer: `Then: replenishment advice from the updated records.`
- **Spoken (replace, 89 words, about 41 s, fits 45 s):**
  > Capacity reallocation is our main feature, and it is one complete journey. The trigger: WareOrb flags a batch that is old and not selling, and briefs a salesperson. Connected data: the salesperson records the buyer's offer and delivery needs, and WareOrb adds the cargo details. The decision: it compares complete transport quotes and shows what the merchant actually recovers. Human approval: the owner approves, which reserves the goods. The visible outcome: staff confirm collection, the bay is freed, and every step is logged. Those records then drive replenishment advice.
- **Why:** Brief §3 defines the MVP as exactly these five steps, and judges score Feasibility against "trigger → data → decision → approval → outcome".
- **Evidence:** `src/domain/ageing.ts:28–71`, `convex/deals.ts:61–359`, `src/domain/costs.ts:34–87`, `convex/lib.ts:10`. Confidence: high.

### Slide 4 — Jarvis and 3D (P1; the largest content gain)
- **Before:** "Jarvis — Ask about stock. Open the next task." / "3D warehouse — See occupied, reserved and released space." / footnote "Receiving records supply the data. People verify changes."
- **After:**
  - Left column **Jarvis**:
    - `Each role sees only its own tasks`
    - `English or 中文 · type "/" or just ask`
    - `Can look things up — can never approve, post or dispatch`
  - Right column **3D warehouse**: `Occupied · reserved · released — from the stock record`
  - Bottom strip (replaces footnote): **`AI reads messy delivery notes into a draft · fixed rules do the maths · people confirm`**
  - Optional image: a delivery-note photo next to the extracted draft lines. Capture it only from the real app with a working key. [VERIFY on the recording machine; the build team tested only a printed synthetic note.]
- **Spoken (replace, 67 words, about 31 s; slot 30 s, take 1 s from S6):**
  > Jarvis is the entry point. Each role sees only its own tasks, by slash command or plain words, in English or Chinese. Jarvis can look things up, but it can never approve, post or dispatch. Only the right person can. The 3D view shows occupied, reserved and released space. AI reads messy delivery notes into a draft. Fixed rules calculate quantities and costs. Let's follow one batch.
- Conditions:
  - Remove "or plain words" if no AI key is connected in the recorded build. `Vince` without a key matches keywords; `backend-production` without a key answers "not connected".
  - Remove "AI reads messy delivery notes" if you will not show it working anywhere.
- **Why:** it answers must-have #4 (who may act) and the Innovation criterion's "AI only where it adds value / not a re-skinned chatbot" in 30 seconds. Bilingual use is a Malaysian ease-of-learning point no other line makes.
- **Evidence:** `src/commands.ts:51–61, 89`; `src/roles.ts:20–24`; `src/local/warehouse-tools.ts:146–166`; `src/voice/voice.ts:22`; `convex/ai.ts` (`extractReceipt`); `docs/local-demo.md:211–218`. Confidence: high for roles and guardrails; medium for photo reading (key- and machine-dependent).

### Slide 5 — Demo title (P0 wording)
- **Before:** `Synthetic records. Simulated booking.`
- **After (Vince):** unchanged.
- **After (backend-production):** `Synthetic records · test carrier entries · no carrier contacted`

### Slide 6 — Cash recovered and space released (P1)
- **Before:** `RM900 — Cash recovered after delivery and packing` | `1 bay — Physically released after collection` | `Adoption test: additional benefit exceeds total cost`
- **After:**
  - Keep `RM900` and `1 bay` tiles. Rename the first label to **`Net recovery after delivery and packing`**, the app's own term.
  - Replace the adoption-test line with:
    **`Expected benefit — to measure in a pilot:`**
    `Cargo details typed once, not re-sent to each carrier · Bad quotes caught before approval · Faster flag-to-decision time`
  - Footnote unchanged: `Synthetic scenario. RM900 is recovery before original stock cost, not profit.`
  - Optional: replace the tiles with the real approval capture `c08-approval.png`. **Only if the promo is used and the numbers match (that capture shows RM920).**
- **Spoken (replace, 85 words, about 39 s; slot 40 s):**
  > In the demo, the buyer pays twelve hundred ringgit for two sofas. After two hundred and eighty for delivery and twenty for packing, the merchant recovers nine hundred ringgit. That is cash back before the original stock cost, not profit. And one bay is physically free. The benefit we expect is in daily work: cargo details typed once instead of re-sent to every carrier, bad quotes caught before approval, and space handed to stock that sells. Our pilot will measure those against spreadsheets and WhatsApp.
- Moved to Q&A or speaker notes: the RM200/month adoption-cost illustration. It was hypothetical and took about 15 s.
- **Why:** the Clarity criterion (20%) requires the expected outcome to name a measurable benefit. The current slide names a test, not a benefit. No numbers are invented: each item is countable in a pilot.
- **RM figure rule (P0):** if the 21 s promo (RM920) opens the video, change every RM900 to **RM920** and drop "twenty for packing". Otherwise keep RM900 and leave the promo out.

### Slide 7 — Furniture SMEs first (P0 + P1)
- **Before:** `Existing records can remain` / `Shared roles, approvals and activity history` / `A repeatable workflow for other merchants` / `Proposed Orbyte fit · SDG 8.2`
- **After:**
  - `Fits Orbyte's hub: reuses roles, approvals and activity log; adds stock, sales and transport` *(proposed)*
  - `Hardest risk: bad input → people confirm every count; works with no AI at all`
  - `Privacy (PDPA): role-restricted records · minimum shipment details to carriers · set retention period` *(design proposal)*
  - `Proof: 302 automated tests pass` *[VERIFY: re-run `bun run check` on the submitted commit and date it; say "our hardened build" if the demo is recorded on `Vince`]*
  - Footer: `Spreadsheets stay; import on roadmap · SDG 8.2 & 8.3`
- **Spoken (replace, 81 words, about 37 s; slot 40 s, taking time from S6):**
  > WareOrb fits Orbyte's shared hub. It uses roles, approvals and an activity log, and adds stock, sales and transport work on top. Our Orbyte connection is proposed. The hardest risk is unreliable input, so people confirm every count, and the workflow still runs with no AI at all. In a real deployment we'd follow PDPA principles: role-restricted records, only necessary shipment details shared with carriers, and a set retention period. Today the demo build passes three hundred and two automated tests.
  - If recording `Vince`, change the last sentence to: "Our hardened build passes three hundred and two automated tests."
- **Removed:** "Existing spreadsheets or point-of-sale records can remain inputs". No import exists, so the slide says "import on roadmap" instead.
- **Why:**
  - The PDPA sentence is **required** by Brief §6 and is currently unspoken.
  - The hardest risk plus a fallback is explicitly scored under Feasibility (25%).
  - Proof of build backs the GitHub requirement.
- **Evidence:**
  - Tests: run in this audit on `ea79cae` (241 Bun + 61 Convex, exit 0).
  - Manual fallback: `docs/production-plan.md`, `docs/local-demo.md:71`.
  - Roles: `convex/access.ts:23–43`.
  - No import code found.

### Slide 8 — Close (P2)
- **Before:** `Make room for the next hot seller`
- **After:** `Make room for the next proven seller`. It matches the script heading and avoids implying a demand forecast.
- **Spoken (46 words, about 21 s):**
  > Our promise is simple: turn ageing stock into an approved sale, a confirmed collection and space you can actually use. Jarvis guides the work, the owner stays in control, and the 3D warehouse shows the result. More productive small businesses, for SDG eight. That is WareOrb.

### Revised running order

Assumes no promo and demo unchanged.

| Video time | Segment | Spoken words |
|---|---|---:|
| 0:00–0:20 | S1 | 41 |
| 0:20–0:55 | S2 | 76 |
| 0:55–1:38 | S3 | 89 |
| 1:38–2:10 | S4 | 67 |
| 2:10–5:00 | Demo | 265 |
| 5:00–5:40 | S6 | 85 |
| 5:40–6:20 | S7 | 81 |
| 6:20–6:42 | S8 | 46 |

**Total: about 6:34 of speech at 130 wpm, or about 6:42 with transitions.** That leaves roughly 18 s of buffer at slower delivery. A human read-through is still required.

---

## 2. Demo script edits

### Demo-A — recording on `Vince` @ `8f4d6df` (current script, small fixes)

| Time | Change | New line(s) |
|---|---|---|
| 0:00–0:10 | Keep. | — |
| 0:10–0:28 | Optional P1, only if a key works on the recording machine: replace "Open the prepared receiving draft" with a pre-photographed delivery note and **Read with AI**. Cut the waiting time and keep the result. | "Jarvis read this delivery-note photo into a draft. Staff still check the item, quantity and location before anything is posted." |
| 0:48–1:08 | Add a 3 s permission beat right after switching to Sales: type `/` and show that **Approvals is not in Sales' list**. | "Sales can't approve. Only the owner sees approvals." |
| 1:40–2:02 | Keep. Add 2 s holding on the teal bay. | — |
| 2:02–2:25 | Hold 2 s on the activity history list (already scripted). | — |

### Demo-B — recording on `backend-production` @ `ea79cae` (replaces 0:48–2:25)

Uses the team's approved video-plan decisions B and C (`promo/pitch/pitch-plan.md` §1). The presenter is the single Owner account in local demo mode.

| Time | On screen | Say |
|---|---|---|
| 0:48–1:05 | Owner opens B-2140-A → **Start sale**, assignee "Arif". Then the buyer form: 2 units, RM1,200 total, packing RM20, merchant pays freight, destination preset, future collection time, access → **Confirm location**. | "The owner starts a sale and hands it to Arif. The buyer offers twelve hundred ringgit for two sofas. In the full version, Arif signs in as Sales; here I'm acting for each role, and the server checks every action." |
| 1:05–1:22 | Press **Demo**. Three replies tagged *Synthetic* appear. Show that none can be sent for approval (disabled control or error). | "These synthetic replies can't authorise a sale. WareOrb only accepts a carrier reply someone has actually verified." |
| 1:22–1:40 | **Record verified quote**: "Carrier A (test)", Lorry 10ft, RM280 incl. unloading, ref `TEST-DEMO-001`, terms "Test entry for the pitch video. No carrier was contacted." Tick verified → confirm vehicle fit → **Send for approval**. | "For this video we enter a labelled test reply: two hundred and eighty ringgit, unloading included. The lorry fits the cargo." |
| 1:40–2:02 | **Approvals** → net recovery RM900 "before stock cost · not profit" → **Approve**. A-1-01 turns teal; stock unchanged. | "The owner approves. Two sofas are reserved, but all four are still physically here." |
| 2:02–2:25 | **Record carrier reference** `TEST-ARR-001` → **Collection**: A-1-01 = 2, time now → **Record 2 collected** → bay turns green → History. | "Once the carrier arrangement is recorded, the warehouse confirms what actually left. Only now does stock fall and the bay free up. Every step is in the history." |

Also change demo 0:00–0:10 to: "This demonstration uses synthetic stock and labelled test carrier entries. No carrier was contacted." Delete "The booking is simulated."

### Optional 15–30 s showcase sequences (use at most one; take the time from demo 2:25–2:50 by stopping at the replenishment arithmetic)

**A. "AI with guardrails" (20 s; `backend-production` with a Claude key)**
1. Type in Jarvis: `What should I reorder and how much?`
2. Show the **analyze_reorder** tool card (arguments → result) as the answer streams.
3. Cut to the Replenish panel showing the same "+4" with "9 − 3 available − 2 incoming = 4".
- Say: "Jarvis answers from the live stock record and shows its working. The numbers match the replenishment panel exactly. It can advise, but buying is still the owner's decision."
- Evidence: `src/local/warehouse-tools.ts:164–166`; `docs/local-demo.md:207–211`. [VERIFY live on the recording machine.]

**B. "Errors it catches" (15 s; either build)**
1. On the quote list, point at the badges **Expired** and **Incomplete · Unloading?** next to **Lowest**.
2. *(backend-production)* Try to post a receipt for a delivery note number already posted, and show the refusal "Supplier document was already posted" (`convex/receiving.ts:216`).
- Say: "WareOrb won't let a missing charge count as zero, an expired price slip through, or the same delivery be posted twice."

**C. "Bilingual" (5 s; Vince offline, or any build via `/` palette keywords)**
1. Type `有什么旧货` → the Ageing stock panel opens.
- Say: "Staff can work in Chinese or English."
- [VERIFY which input path works on the recorded build: `src/commands.ts:53` keywords include 旧货.]

---

## 3. Before → after summary

| Location | Before | After | Priority |
|---|---|---|---|
| Demo build and script | Script = Vince behaviour; plan = backend-production | One build chosen; script aligned (Demo-A or Demo-B) | **P0** |
| GitHub link | Default `main` = UI only; repo private | Demoed branch as default or submitted link; public or committee access | **P0** |
| S7 spoken | No privacy mention | PDPA sentence | **P0** |
| RM figure | RM900 (deck) vs RM920 (promo) | One figure across video | **P0** |
| S3 | 5 generic steps | Same steps labelled Trigger → Data → Decision → Approval → Outcome | P1 |
| S4 | "Ask about stock / Open the next task" | Role-scoped tasks · EN/中文 · can't approve/post/dispatch · AI reads notes, rules do maths | P1 |
| S6 | "Adoption test" | Three measurable expected benefits; RM200 illustration to Q&A | P1 |
| S7 | "Existing records can remain" | Orbyte reuse · hardest risk + no-AI fallback · PDPA · 302 tests · import on roadmap | P1 |
| S2/S6 visuals | Text only | Real UI captures, labelled | P1 |
| S8 | "next hot seller" | "next proven seller" + SDG 8 | P2 |

## 4. Keep out of the pitch (for Q&A only)

- 3D rendering techniques.
- Local demo isolation and key handling, the Pi framework, Clerk/Vercel/Convex setup, rate limits.
- Version numbers and idempotency mechanics. Say only the benefit.
- Measurement maths.
- Lalamove live quotes: never tested with keys.
- Anything not built: WhatsApp nightly report, Excel/POS import, Orbyte connector, real booking or payment, Poisson forecasting, live-video capture.
