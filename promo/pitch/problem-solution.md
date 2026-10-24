# WareOrb pitch: problem and solution section (storyboard + narration draft)

**Stage A deliverable, for review and human recording.** Not rendered. The pitch itself is assembled in Stage B.

| | |
|---|---|
| **Primary source** | `context/attachments/bc8961e2-wareorb-capacity-reallocation.md`<br>Revision `2026-10-23-complete-warehouse-workflow`, `status: draft`, `implementation_state: not-built` |
| **Product evidence** | Vince branch @ `781687f`: code read on 24 Oct 2026, plus the real-app capture run that produced the promo's UI states |
| **Narration** | Recorded by the team (human voices only). No AI or synthetic voice anywhere. |
| **Numbers** | Only the app's own seeded demo data appears on screen. No metric, gain, adoption figure or test result is claimed. |

---

## 1 · Truth labels used below

| Label | Meaning |
|---|---|
| **Real** | Runs in Vince @ `781687f` without any API key. It was executed in the capture run against a local Convex backend seeded with the app's demo data. |
| **Simulated** | Runs, but by design it is not a real-world action:<br>• the carrier booking (`SIM-7001`, "simulated booking");<br>• the "Demo" carrier replies (tagged *Synthetic* in the UI);<br>• the user roles (the client says who is acting; every write is role-checked on the server). |
| **Needs keys** | The code path exists but needs a secret, and none was configured for the captures, so it is not shown working:<br>• "Read with AI" drafts receipt lines from photos, documents and voice notes (`ANTHROPIC_API_KEY`);<br>• Lalamove sandbox quotations (`LALAMOVE_API_KEY/SECRET`; quotations only, WareOrb never places orders);<br>• Fish voice (`FISH_API_KEY`). |
| **Proposed** | In the spec but not built:<br>• one standard transport enquiry sent to 3–4 carriers;<br>• live-video capture of handwriting;<br>• an exportable sales brief for groups;<br>• the Orbyte fit (proposed, not sponsor-approved). |
| **Hypothesis** | The team's unvalidated belief about the problem (spec §1, evidence class C). It must be said as a hypothesis. |

The backend branch (`backend` @ `5708e52`) is still in development, and the Codex-based integration is not configured. **Nothing here depends on either, or on any external API.**

---

## 2 · Where this sits in the pitch (provisional skeleton, 5–7 min)

| Time | Section | Status |
|---|---|---|
| 0:00–0:21 | Cold open: the 21 s promo (music and SFX, no voice) | Stage A: promo in review |
| **0:21–0:58** | **The problem** (this document) | Stage A: draft below |
| **0:58–1:42** | **The solution: one live ledger** (this document) | Stage A: draft below |
| 1:42–4:30 | Prototype demo: real clicks, recorded on the Mac | Stage B (app not finished) |
| 4:30–5:15 | How it's built; what is real, simulated or needs keys | Stage B (provisional) |
| 5:15–5:50 | Impact: what we will measure and how (a plan, not results) | Stage B (provisional) |
| 5:50–6:10 | Team and close: Alfred Lee Khai Zher (leader), Deng Zhenqun, Loo Yi Sheng | Stage B |

The timings assume a calm 140–150 words per minute. Each section below is written to fit inside its slot with about 10 % to spare.

---

## 3 · The problem (0:21–0:58, ≈ 37 s, 94 words)

**Visual language:** the promo's own. Near-black ground, the ghosted twin, the one line, Geist type and the real UI only where it is real. The problem is shown with **typography and the real twin**. No invented app screens, chats or charts.

| Time | Visual | Asset | On screen | Narration (read this) | Label |
|---|---|---|---|---|---|
| 0:21–0:29 | Hard cut from the promo's end card to the ghosted twin at overview, very slow push. One line of type fades up. | Promo renderer, overview camera; ledger L2a (seeded) | "The record exists. Then what?" | "Small furniture merchants already keep stock records. Our hypothesis is that the trouble starts after the record is written." | Hypothesis |
| 0:29–0:38 | The camera eases to batch **B-2140-A** in A-1-01/A-1-02, which glows violet as in the app. A counter ticks up to **120 days**, then holds. | Twin + the app's ageing overlay (real); the counter is the batch's real seeded age | "120 days · 0 sold in 30 days" (demo data) | "A batch that isn't selling can sit in a good bay for months, and nobody is asked to move it. That space could hold stock that sells." | Hypothesis; the numbers are seeded demo data |
| 0:38–0:48 | Kinetic type, clearly illustrative. One cargo description ("2 × L-Shaped Sofa · Grey · PJ SS2 · unloading?") is retyped three times, slightly differently each time, then three mismatched price fragments ("RM280 incl.", "RM220 + ?", "RM300 expired"). | Type only; the fragments are the app's synthetic demo replies | "Retyped. Re-sent. Not comparable." | "When a buyer does turn up, staff retype the same cargo details into messages to drivers, and the replies don't line up." | Hypothesis (illustration, not product UI) |
| 0:48–0:58 | The line draws a question mark over the reorder bay A-2-04/05, then straightens into the start of the WareOrb mark. | Twin (real) + the line (illustrative) | "What actually sold?" | "And before reordering, someone has to piece together what actually sold. We haven't measured any of this yet. It's what WareOrb sets out to test." | Hypothesis |

**Rules for this section:**
* Say "our hypothesis" once and keep it.
* No statistics, survey numbers or "x % of merchants".
* The spec states no cost figure for idle stock, so none is implied.

---

## 4 · The solution: one live ledger (0:58–1:42, ≈ 44 s, 106 words)

Every frame here can come from material that already exists: promo renderer holds, plus the real 2× captures in `source/captured/ui/` (c01–c12). Stage B can swap in the screen recording.

| Time | Visual | Asset | On screen | Narration (read this) | Label |
|---|---|---|---|---|---|
| 0:58–1:06 | The mark draws and opens into the warehouse, as in the promo opening (reuse), then settles to overview. | Promo f0–110 (reuse) | "WareOrb" | "WareOrb keeps one live ledger for every move, and puts the next step in front of the right person." | Real (the twin and ledger); the line is illustrative |
| 1:06–1:11 | Receipt card: "Counted and checked" is ticked, then **Post to stock** is pressed. The history row "J. Lim · 4 × CHAIR-LUMA-0410 → C-3-01" appears. | Promo f150–200 (press wave) | "Checked by a person. Posted to a bay." | "A delivery is checked by a person and posted to a bay." | Real. AI line-drafting needs keys and is **not** claimed. |
| 1:11–1:20 | Violet laps around B-2140-A; the ageing card shows its reasons; **Hand to Arif** gives "Finding buyer". | Promo f236–310 | "Flagged with reasons" · footer "seeded demo data" | "Batches that sit unsold are flagged with their reasons — here, a hundred and twenty days and no sales in thirty — and handed to sales." | Real; seeded demo data |
| 1:20–1:29 | The route to "Petaling Jaya · SS2", the three quotes with **Lowest** circled, then the approval card and the **Approve** press, ending on "Approved by Mei". | Promo f314–404 | Footer: "synthetic carrier quotes · simulated booking" | "The salesperson brings back a buyer. Carrier quotes are compared side by side, and the owner approves before anything is booked." | Real comparison and approval; the quotes are **simulated** (synthetic) and the booking is **simulated** |
| 1:29–1:38 | A-1-01 laps teal (reserved). **Confirm 2 left the warehouse** is pressed, the units ride out, and the bay laps green (freed). | Promo f426–501 | "Reserved ≠ gone. Collected = gone." | "Stock is reserved, but it only leaves the books when the warehouse confirms the collection. Then the bay is free." | Real |
| 1:38–1:42 | The replenishment card "3-Seater Sofa · Oatmeal +4", with the arithmetic underlined. | Promo f514–540, or capture c11 | "9 − 3 − 2 = 4" | "Those confirmed sales feed the next reorder, with the arithmetic shown." | Real (the suggestion and its arithmetic). "Order 4" was not pressed in the captures. |

**Optional honesty line.** Use it if the demo section won't say it. Place it at about 1:29, or at the start of "How it's built".
> "In this prototype the carrier replies are synthetic and the booking is simulated. Reading handwritten notes with AI and live carrier quotes are wired in, but they need API keys, so we don't show them working today."

---

## 5 · Clean script for recording

Read at a calm pace. Record one file per numbered line so the edit can breathe between them.

```
P1  Small furniture merchants already keep stock records.
    Our hypothesis is that the trouble starts after the record is written.
P2  A batch that isn't selling can sit in a good bay for months, and nobody is asked to move it.
    That space could hold stock that sells.
P3  When a buyer does turn up, staff retype the same cargo details into messages to drivers,
    and the replies don't line up.
P4  And before reordering, someone has to piece together what actually sold.
    We haven't measured any of this yet. It's what WareOrb sets out to test.

S1  WareOrb keeps one live ledger for every move, and puts the next step in front of the right person.
S2  A delivery is checked by a person and posted to a bay.
S3  Batches that sit unsold are flagged with their reasons — here, a hundred and twenty days
    and no sales in thirty — and handed to sales.
S4  The salesperson brings back a buyer. Carrier quotes are compared side by side,
    and the owner approves before anything is booked.
S5  Stock is reserved, but it only leaves the books when the warehouse confirms the collection.
    Then the bay is free.
S6  Those confirmed sales feed the next reorder, with the arithmetic shown.

(optional) H1  In this prototype the carrier replies are synthetic and the booking is simulated.
    Reading handwritten notes with AI and live carrier quotes are wired in,
    but they need API keys, so we don't show them working today.
```

**Pronunciation:**
* **WareOrb** is "WAIR-orb" (two words run together, stress on "WAIR").
* **Bababoi** is "BAH-bah-boy".
* **SS2** is "S S Two".
* **RM** is "ringgit" if it is ever read aloud. None of the lines above read prices aloud.

**Recording notes for the team:**
* 48 kHz / 24-bit WAV, mono, one take per line, plus 10 s of room tone.
* Quiet room, about 15 cm from the mic, with a pop filter or a sock over the mic.
* Keep peaks around −6 dBFS. Leave levelling, ducking and loudness to the edit: −14 LUFS for the finished pitch, music ducked under the voice.
* Who reads: one consistent narrator for P and S works best. The team leader is a natural choice for the close.

---

## 6 · What must not be said (anywhere in the pitch)

* Any measured saving, revenue, time saved, accuracy or adoption figure. None exists.
* "AI reads your handwritten notes" as something shown working (it needs keys and isn't shown). "Wired in, needs a key" is fine.
* "Books the lorry" or "pays the driver": booking is simulated, and there are no payments.
* Net recovery as "profit". The app itself says "before stock cost · not profit".
* That Orbyte uses or endorses WareOrb: the fit is proposed, not sponsor-approved.
* That the roles are real user accounts: they're simulated in the prototype.
