# WareOrb pitch video: Stage B plan

> **25 Oct 2026:** this plan is for the separate 5–7 min pitch. Its build assumptions (`e935ae6`, Clerk sign-in, decision A) are outdated: `backend-production` @ `4c2cc97` runs as a no-login local demo with Lalamove sandbox quotes and the Jarvis agent. Re-plan the demo against `VIDEO-CAPABILITY-AUDIT.md` before recording.

**Approved by the user on 24 Oct 2026, with decisions A–E as recommended.** Decision A, the Clerk exception, covers a Clerk development instance used only to sign in test accounts. Nothing has been recorded or rendered for the pitch yet. The draft before approval is commit `608117a`.

| | |
|---|---|
| **Deliverable** | The 5–7 min pitch video, with the delivered 21 s promo as its cold open |
| **Provisional length** | **6:10**. The hackathon's rules aren't known yet (§11); a 5:00 variant is in §8. |
| **Format** | Same as the promo, unless the rules say otherwise:<br>• 1920×1080, 30 fps;<br>• H.264 High, BT.709;<br>• AAC 48 kHz stereo. |
| **App build to record** | **`backend-production` @ `e935ae6`**, chosen by the user on 24 Oct 2026. Its code was read for this plan with `git show`; it hasn't been run yet. |
| **Narration** | Human voices only, recorded by the team. `problem-solution.md` is **not reviewed yet**, and no narrator is named yet. |
| **Toolchain** | Verified on 24 Oct in `~/Documents/codes/Bababoi-promo-video`. Frames 401 and 615 at dpr 2 with the 180° shutter came out byte-identical to the delivered frames and to `previews-v3b/keyframe-04.png` / `-06.png`. |
| **Local leftovers** | Kept, at the user's choice. Nothing in `out/` is deleted. |

---

## 0 · What the chosen build changes

These are facts read from the code at `e935ae6`, compared with the `Vince` build the promo captured.

| Area | `Vince` @ `8f4d6df` (the promo) | `backend-production` @ `e935ae6` (the pitch demo) |
|---|---|---|
| Sign-in | None; `?role=` picks a persona | **Clerk sign-in required.** Without `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` the app shows only "WareOrb needs identity setup". The role comes from a server-side staff record (`convex/access.ts`), and each mutation checks it. |
| Demo data | Seeded | Same seed (`src/domain/seed.ts` is unchanged), but loading it needs `WAREORB_ALLOW_DEMO_SEED=true` on the deployment. A reset keeps the staff accounts. |
| Ageing → sales | "Hand to Arif" | The owner presses **"Start sale"** |
| Carrier quotes | The synthetic "Demo" replies can be approved | The "Demo" replies still exist, tagged *Synthetic*, but **can't authorise a sale** ("Sandbox and demo quotes cannot authorize real stock operations").<br>Approval needs a **verified manual reply**: carrier, vehicle, total, validity, reference and terms, plus the tick "I verified this reply, price, vehicle and terms with the carrier". |
| Booking | Simulated booking `SIM-7001` | No simulated booking. After approval, the owner or salesperson records the **carrier's arrangement reference** ("The carrier confirmed this arrangement outside WareOrb"). |
| Collection | "Confirm 2 left the warehouse" | The warehouse enters the units that actually left each bay and the actual time, then presses **"Record N collected"**. |
| Reorder | "Order 4" | The suggestion and its arithmetic, then "Record confirmed supplier purchase" (supplier, reference, unit cost, a verification tick) |
| 3D scene | — | Unchanged (`src/scene/` isn't touched), so the promo's twin shows this build's warehouse too |
| Status | Prototype | Its own handoff (`docs/claude-handoff.md`) says no real logged-in walkthrough, hosted deployment or restore drill has been done, and "Do not describe the app as launched". |

---

## 1 · Decisions (approved 24 Oct 2026: A–E as recommended)

**A · Clerk sign-in is an external service, so it needs your exception.**

`e935ae6` can't open without Clerk, which conflicts with the "no dependence on any external API" rule. The proposed exception is tightly scoped:
* a Clerk **development** instance, used only to sign in three **test accounts** (owner, sales, warehouse);
* the team creates the instance and the accounts, sets the keys, and signs each account in on the recording Mac;
* Claude never sees or types keys, passwords or codes;
* no other keyed service is configured: Read with AI, Lalamove and Fish stay "wired in, needs a key".

If you'd rather not depend on Clerk, the alternative is to record `Vince` @ `8f4d6df` (keyless). The demo then goes back to the chapters in `NEXT-AGENT.md`.

**B · Test entries typed on camera.**

Approval, dispatch and purchasing now need details that a real carrier or supplier would supply. To complete the path, the driver types **test values** and ticks the verification boxes, and the video labels them.
* The values say so inside the app itself:
  * carrier "Carrier A (test)", Lorry 10ft, RM280 including unloading;
  * reference `TEST-DEMO-001`;
  * terms "Test entry for the pitch video. No carrier was contacted."
* These figures match the seeded synthetic Carrier A, so the approval shows the same net recovery (RM920) as the promo.
* The arrangement reference is `TEST-ARR-001`.
* The footer adds "test entries".

**C · Show the refusal of synthetic quotes (recommended).**

This is one beat in chapter 4: press "Demo", three replies tagged *Synthetic* appear, and the app won't let one authorise the sale.
* It's real behaviour.
* It shows the build is stricter than the prototype in the cold open.
* It answers the obvious question before a judge asks it.

It stays in the cut only if the refusal is visible on screen (a reason label, a disabled control or the server's error message).

**D · Solution-section visuals (recommended: twin and line, no UI).**

`problem-solution.md` reuses promo shots that contain `Vince` UI cards. With the demo on `e935ae6`, those cards would show a different UI (synthetic approval, `SIM-7001`) a minute before the demo.
* **Recommended:** keep narration S1–S6, but draw the section with the twin, the line and type only. The real UI first appears in the demo.
* **Alternative:** keep the promo cards, labelled "earlier prototype build".

**E · Replenishment.**

The default is to show the suggestion and its arithmetic only, as the promo did. A test supplier purchase is recorded only if the team wants one shown; it would be another test entry.

---

## 2 · Truth labels

| Label | Meaning in this pitch |
|---|---|
| **Real** | Done in the running `e935ae6` app (local Convex backend) by real clicks and typing; the outcome is visible on screen and in the ledger |
| **Seeded demo data** | The app's own synthetic seed (DN-2291, B-2140-A, the sales history behind the reorder), loaded with `seed:run` before each take |
| **Test account** | Users of the Clerk development instance with staff roles, set up by the team for the demo (only if decision A is approved) |
| **Test entry** | Values typed during the demo where the app expects a real-world confirmation: the buyer, the carrier reply, the carrier reference, any purchase. No buyer, carrier or supplier was contacted. |
| **Synthetic** | The app's "Demo" carrier replies, tagged *Synthetic* in the UI. They can't authorise a sale. |
| **Sample** | The vehicle sizes, which the delivery panel itself marks "Sizes: sample" |
| **Needs keys** | The code exists, but no key is configured, so the feature isn't shown working:<br>• Read with AI (`ANTHROPIC_API_KEY`);<br>• Lalamove sandbox quotations (`LALAMOVE_*`);<br>• Fish voice (`FISH_*`). |
| **Proposed** | In the spec but not built:<br>• one standard transport enquiry sent to 3–4 carriers;<br>• live-video capture of handwriting;<br>• a sales brief to export;<br>• the Orbyte fit (not sponsor-approved);<br>• a hosted deployment. |
| **Hypothesis** | The team's unvalidated view of the problem (the spec's evidence class C) |
| **Illustrative** | The line, the route, the press wave, kinetic type, camera moves |
| **Plan** | What the team intends to measure. Never a result. |

---

## 3 · Timeline (provisional, 6:10)

| # | Section | Time | Length | Visual source | Narration | Labels |
|---|---|---|---|---|---|---|
| 0 | Cold open | 0:00–0:21 | 21 s | `WareOrb-promo-1080p.mp4`, untouched | none (its own score) | as delivered (its footers) |
| 1 | Problem | 0:21–0:58 | 37 s | Promo renderer: twin and type | P1–P4 | Hypothesis; seeded numbers |
| 2 | Solution | 0:58–1:42 | 44 s | Promo renderer: twin, line and type (decision D) | S1–S6 | Real twin and ledger; illustrative line |
| 3 | Demo | 1:42–4:30 | 2:48 | `e935ae6` screen recording, with zooms and a pointer drawn from the event log | D0–D8 | Real; seeded; test account; test entry; synthetic; needs keys |
| 4 | How it's built | 4:30–5:15 | 45 s | Title cards; the line draws the architecture | H1, T1–T3 | Real; needs keys; proposed |
| 5 | Impact plan | 5:15–5:50 | 35 s | Title cards: what we'll measure, and how | I1–I3 | Plan |
| 6 | Team and close | 5:50–6:10 | 20 s | End card in the promo's design | C1–C2 | — |

Something carries across every boundary (the onetake rule):
* **0 → 1:** a hard cut from the promo's end card to the ghosted twin. The end card is the one place a bare cut belongs.
* **1 → 2:** the line's question mark straightens into the WareOrb mark, as `problem-solution.md` describes.
* **2 → 3:** the film's twin match-cuts to the **app's own 3D viewport** at the same isometric framing, and the camera pulls out to reveal the real app around it.
* **3 → 4:** the app shrinks into a card, and the line leaves its corner to draw the architecture.
* **4 → 5:** the line turns the last architecture node into the measurement checklist.
* **5 → 6:** the line reels back into the mark, which opens into the end card.

---

## 4 · Section by section

### 4.0 · Cold open (0:00–0:21)

The delivered promo, unchanged: 630 frames, with its own score ending in silence at 21.0 s. Its footers already label the synthetic quotes and the simulated booking of that earlier build. Nothing is re-rendered.

### 4.1 · Problem (0:21–0:58)

As in `problem-solution.md` §3: the storyboard and lines P1–P4 (94 words), **pending the team's review**.
* The ghosted twin.
* B-2140-A's violet ageing overlay with "120 days · 0 sold in 30 days" (seeded).
* Kinetic type for the retyped cargo details (illustrative).
* The line's question mark over A-2-04/05.

There's no app UI in this section. A quiet code-synthesised bed enters under P1.

### 4.2 · Solution (0:58–1:42)

Narration S1–S6 as drafted (106 words), pending review. All six lines still hold for `e935ae6`. With decision D as recommended, every shot is the twin and the line, with no UI:

| Time | Visual | On screen | Narration | Label |
|---|---|---|---|---|
| 0:58–1:06 | The mark opens into the warehouse (promo f0–110 reused) | "WareOrb" | S1 | Real twin; illustrative line |
| 1:06–1:11 | The line closes on the dock, then on C-3-01; the chairs land | "Checked by a person. Posted to a bay." | S2 | Real twin, seeded snapshots |
| 1:11–1:20 | Violet laps around B-2140-A | "Flagged with reasons: 120 days · 0 sold in 30" | S3 | Seeded |
| 1:20–1:29 | The route out of the door and back; a teal lap on A-1-01 | "Verified quote · the owner approves" | S4 | Illustrative route |
| 1:29–1:38 | Teal, then the units ride out, then a green lap | "Reserved ≠ gone. Collected = gone." | S5 | Real twin states |
| 1:38–1:42 | The line outlines A-2-04/05 | "Reorder: 9 − 3 − 2 = 4" | S6 | Seeded arithmetic |

The twin's states come from the promo's captured ledger (`source/captured/ledger`, the `Vince` run). The seed and the 3D scene are identical in `e935ae6`, so the states should match. If the new build's ledger snapshots differ, they replace the old ones.

### 4.3 · Demo (1:42–4:30)

Recorded on `e935ae6` with real clicks and typing (see §5).
* Every chapter ends on a visible outcome. Nothing is faked or patched on screen.
* Long form-filling may be sped up, always marked "×N" on screen. Outcomes are never cut out.
* The labels in quotes below are what the code at `e935ae6` should show; only the recording confirms them.

The demo's footer is *Real WareOrb UI · seeded demo data · test accounts*. "· test entries" or "· synthetic replies" is appended while those are on screen.

| Ch | Time | Account | Real actions | Visible outcome | Narration | Labels |
|---|---|---|---|---|---|---|
| 0 | 1:42–1:52 | Owner | The header shows the signed-in name and role. Open **Staff**. | Three staff listed: owner, sales, warehouse | D0, ~20 words: everyone signs in; the server checks the role on every action; these are test accounts | Test account; real |
| 1 | 1:52–2:22 | Warehouse | Receive → DN-2291 "To verify" → arrival details → count line Dining Chair · Oak · 4 → bay C-3-01 → tick "Counted goods and bay locations checked" → Save receipt → **Post to stock** | "Posted to stock". The chairs appear in C-3-01 in the app's own twin. | D1, ~50 words | Real; seeded. "Read with AI" (shown only when evidence is attached) is never pressed; if it's on screen, the caption says "needs a key · not used". |
| 2 | 2:22–2:36 | Owner | Ageing → B-2140-A | "120 days · 0 sold / 30d · A-1-01 · A-1-02"; violet bays | D2, ~25 words | Real rule; seeded |
| 3 | 2:36–2:44 | Owner | **Start sale** | "Sale started"; the deal shows "Finding buyer" | D3, ~14 words | Real |
| 4 | 2:44–3:26 | Sales | Buyer form (test buyer, 2 units, RM1,200, PJ SS2, floor, a collection time in the future) → Save → **Confirm location with buyer** → delivery: vehicle fit → (decision C) **Demo**: three *Synthetic* replies, refused for approval → **Record verified quote** with the test values → tick "I checked the actual cargo and vehicle fit" → **Send for approval** | "Sent for owner approval" | D4, ~75 words | Test entry; synthetic; sample sizes |
| 5 | 3:26–3:44 | Owner | Approvals → the deal → **Approve** | Sale RM1,200, delivery − RM280, net recovery RM920 "before stock cost · not profit", "Frees A-1-01". Then "Approved · stock reserved"; A-1-01 turns teal. | D5, ~35 words | Real; the quote is a test entry |
| 6 | 3:44–4:12 | Sales, then Warehouse | Sales: **Record carrier reference** (`TEST-ARR-001`, tick). Warehouse: Collection, A-1-01 = 2, actual time → **Record 2 collected** | "Carrier arrangement recorded". Stock falls by two and A-1-01 is freed (green). | D6, ~55 words | Real; the reference is a test entry |
| 7 | 4:12–4:20 | Owner | The deal's and the receipt's **History** | Who did what, and when | D7, ~15 words | Real |
| 8 | 4:20–4:30 | Owner | Replenish → 3-Seater Sofa · Oatmeal → expand | "+4" with its arithmetic lines. No purchase is recorded (decision E). | D8, ~22 words | Real; seeded |

Budget: 168 s and about 310 words (≈110 wpm), so the picture can breathe between lines.

### 4.4 · How it's built (4:30–5:15)

| Time | Visual | On screen | Narration | Label |
|---|---|---|---|---|
| 4:30–4:42 | A table builds: real / seeded / test / needs keys | The §2 labels | H1, rewritten for `e935ae6` (~30 words) | — |
| 4:42–5:15 | The line draws four nodes:<br>• the browser (React 19 and the R3F twin);<br>• the Convex ledger (transactions, version checks, safe retries);<br>• identity and roles (Clerk sign-in, server-side role checks);<br>• the optional providers, greyed out, "needs a key" | Node labels only | T1–T3 (~75 words) | Real; needs keys; proposed |

Rules for this section:
* The real / test / needs-keys table is taken from the code at `e935ae6`.
* A test count is stated only if we run the branch's suite (`bun run check`) at `e935ae6` ourselves, and it's given with the date. The count in the branch's own handoff isn't quoted.
* Never say "launched" or "live": there is no hosted deployment.

### 4.5 · Impact plan (5:15–5:50)

What the team will measure, taken from its own documents (`docs/concept.md` §10 and the spec's §10). **There are no results; nothing has been measured.**

| Measure | How | Source |
|---|---|---|
| Minutes and manual actions to record a supplier receipt | The same delivery notes, current method against WareOrb, timed with merchant staff | concept §10.2 |
| Wrong or duplicate documents caught before posting | Seeded duplicates, plus real notes from a pilot | concept §10.3 |
| Re-entry and follow-up work per sale | How often cargo details are retyped or chased | spec §10 |
| Time from an ageing flag to the owner's decision | Ledger timestamps | `production-plan.md` B4 |
| First-time users finishing the workflow without training | Observed sessions | concept §10.5 |

* On screen: "What we'll measure" and "No results yet".
* Narration: I1–I3 (~75 words).
* SDG 8.2 and 8.3 may be named as the aim, never as an outcome.

### 4.6 · Team and close (5:50–6:10)

The promo's end-card design:
* the mark, **WareOrb** and *Every move, one live ledger.*;
* then **Alfred Lee Khai Zher** (team leader), **Deng Zhenqun** and **Loo Yi Sheng**;
* then **WareOrb — by Team Bababoi**;
* footer: *Hackathon prototype · real WareOrb UI · seeded demo data*.

Narration C1–C2 (~35 words), read by whoever the team chooses; the team leader is a natural choice. The bed resolves and fades to silence at 6:10.

---

## 5 · Recording the demo (B1)

**Environment:**
* **App:** `git archive e935ae6`, exported to `out/wareorb-promo/app-e935ae6/` (the way `vince/` was made), then `bun install --frozen-lockfile` and `bun dev`. The product source isn't modified.
* **Backend:** an **isolated local Convex deployment** on the Mac. Convex CLI 1.48 can create a local development deployment, which downloads Convex's open-source local backend once; this is still to be tested.
  * Never the shared `dev:admired-swordfish-390`: another workstream and the `Vince` preview use it.
  * Never the production deployment `descriptive-lemur-152`.
* **Deployment variables:**
  * `WAREORB_ALLOW_DEMO_SEED=true`;
  * the Clerk issuer and secret, set by the team;
  * no Anthropic, Lalamove or Fish keys.

**One-time setup:**

| Step | Who |
|---|---|
| Create the Clerk development instance and three test users. Put the publishable key in the export's `.env.local`, and the Clerk issuer and secret on the local deployment. | Team |
| Sign in as the owner. Claude reads that account's identity key, then runs the internal `access:bootstrapOwner` on the local deployment only. | Team, then Claude |
| The owner invites the sales and warehouse test emails in **Staff**; each signs in and activates. | Team |
| Sign each account into its own browser profile on the recording Mac | Team |
| Load the seed with `bunx convex run seed:run`. Staff accounts survive resets. | Claude |

**Each take:**
1. **Reset.** Reset the seed off camera, and check the starting state in the ledger: DN-2291 to verify, B-2140-A flagged, no open deal.
2. **Drive.** A new driver in `source/capture-pitch/` switches between the three signed-in profiles; the promo's `source/capture/` stays as it was.
   * On camera there are only visible clicks and typing, at a human pace.
   * No `__ware.setState` navigation.
3. **Capture** 1920×1080 at 30 fps.
   * First choice: CDP screencast frames with timestamps, resampled to a constant 30 fps.
   * If a test take drops frames with the 3D view, fall back to a lossless ffmpeg avfoundation screen capture. That needs the team to give the terminal Screen Recording permission; Claude can't change that setting.
4. **Log** every action: time, action, target, bounding box and typed value. The log drives the zooms, the captions and the drawn pointer, so the cause of every change stays visible.
5. **Snapshot** the ledger after each chapter.

**Done when:**
* every chapter is recorded with its outcome visible;
* the ledger snapshots agree with what's on screen;
* a contact sheet of every chapter has been looked at.

If a step fails in the app, it's reported to you, not patched on screen.

---

## 6 · Narration still to write (B2 and B3)

* **Lines to write:** D0–D8 (demo), a rewritten H1, T1–T3, I1–I3 and C1–C2. They follow the format of `problem-solution.md`: per-line timings at 140–150 wpm, a clean script, pronunciation notes and recording notes.
* **H1 must be rewritten.** The draft says the carrier replies are synthetic and the booking is simulated, which is **wrong for `e935ae6`**. The new H1 says:
  * the data is seeded;
  * the accounts are test accounts;
  * we typed the test entries and contacted no carrier;
  * the keyed features are wired in but not shown.
* **S1–S6** still hold for `e935ae6`. Nothing there changes unless the team edits it.
* **Delivery:** 48 kHz / 24-bit mono WAV, one file per line, named by line ID, into `out/wareorb-promo/pitch/voice/`, plus 10 s of room tone.
* **Until the team records,** drafts are silent or caption-only. Never an AI or synthetic voice, even as a placeholder.

---

## 7 · Assembly and QA (B5)

* **Code-driven.**
  * One timeline file (sections, shot sources, voice cues), rendered frame by frame like the promo.
  * Title cards and the twin come from the promo renderer through a new `src4` timeline, so `src3` stays frozen.
  * The recording is placed by the event log. Zoom-to-click is capped so that text stays sharp.
* **Methods from onetake and brag:**
  * one sound room;
  * a carry at every boundary;
  * rests between bursts;
  * the shutter on fast moves;
  * about 0.3 s of reading time per word, and nothing on screen shorter than its reading time;
  * no cross-dissolve between busy layouts: state changes cut on the click or use the press wave.
* **Text:** captions from the approved script, timed to each WAV, plus an SRT file.
* **Mix:**
  * the promo plays as mastered;
  * a code-synthesised bed in the promo's key (D major), ducked under the voice;
  * the whole pitch at about −14 LUFS integrated, true peak ≤ −1 dBTP;
  * short-term loudness measured to show the voice clearly leads.
* **Review gate:**
  * keyframes (one per section and one per chapter outcome), a contact sheet and a draft MP4;
  * the first draft may be caption-only if the voice isn't recorded yet;
  * the final render happens only after your approval.
* **QA on the encoded file:**
  * `qa_frames.py`, `qa_av.py` and `qa_encode.py`;
  * contact sheets every 0.5 s and at every transition, looked at;
  * render notes with hashes;
  * every earlier version kept in its own folder.

**Where things go:**
* Large outputs: `out/wareorb-promo/pitch/` (`app-e935ae6/`, `recordings/`, `voice/`, `frames/`, `drafts/`, `qa/`).
* Docs and code: branch `promo/wareorb-video`, under `promo/pitch/` and `promo/source/`.

---

## 8 · A 5:00 variant, if the rules cap the length

| Section | 6:10 cut | 5:00 cut | What changes |
|---|---|---|---|
| Cold open | 0:21 | 0:21 | — |
| Problem | 0:37 | 0:32 | P2 shortened |
| Solution | 0:44 | 0:35 | S6 folded into S5 |
| Demo | 2:48 | 2:12 | Ch 0 goes into Ch 1's narration; Ch 2 and 3 merge; Ch 7 is dropped; forms are sped up more |
| How it's built | 0:45 | 0:35 | T3 dropped |
| Impact plan | 0:35 | 0:28 | Three measures instead of five |
| Team and close | 0:20 | 0:17 | — |

---

## 9 · Risks and checks

| Risk | Handling |
|---|---|
| `e935ae6` has never had a real logged-in walkthrough | The first take is a rehearsal. Failures are reported with screenshots and the team decides. The product source is never patched. |
| The branch moves on (another session is developing it) | The recording pins `e935ae6`. Any newer commit is confirmed with you first. |
| Clerk sessions expire or hit rate limits mid-take | Sign in shortly before the takes. Chapters can be retaken from a reset. |
| `seed:run` doesn't clear the `collections` table | Check that a second take isn't affected, and report it if it is |
| The send button stays disabled unless the collection time is in the future | The driver types a time ahead of the take's clock |
| Screen capture drops frames with the 3D view | Test take first; fall back to the lossless avfoundation capture |
| The cold open (`Vince`) and the demo (`e935ae6`) differ | The promo's footers already label it. Chapter 4's refusal of synthetic replies, with its narration, says the build is stricter now. |

---

## 10 · What must not be said

Everything in `problem-solution.md` §6 still applies:
* no measured savings;
* no "AI reads your notes" shown as working;
* no booking or payment;
* net recovery is not profit;
* no Orbyte endorsement.

Added for `e935ae6`:
* Not "launched", "live" or "in production": it isn't hosted.
* Not that a buyer, carrier or supplier confirmed anything: those were test entries.
* Not that the test accounts are real staff.
* No test count unless we ran the suite ourselves, and then with the date.
* Not that Clerk, Convex or any provider endorses WareOrb.

---

## 11 · Open items for the next agent

* **Ask the user again** about the hackathon's rules: maximum length, required sections, aspect ratio and deadline. The user doesn't know them yet.
* **Ask the team** for:
  * their review of `problem-solution.md`, together with decisions D and E;
  * who narrates;
  * when the WAVs will arrive.
* **Decisions A–E** were approved as recommended on 24 Oct 2026. The team's Clerk setup is next (§5).
