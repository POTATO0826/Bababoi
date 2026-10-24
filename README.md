<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/wareorb-logo-transparent-white-text.png">
    <img src="brand/wareorb-logo-transparent-dark-text.png" alt="WareOrb" width="360">
  </picture>
</p>

# WareOrb

> A voice-guided 3D warehouse that helps small furniture retailers turn ageing stock into approved sales and free up shelf space, with the owner in control.

---

## Team Information

| Field                  | Details                                                   |
| ---------------------- | --------------------------------------------------------- |
| **Team Name**          | _TODO_                                                    |
| **Team Domain**        | Domain 2 — Orbyte Smart SME Challenge                     |
| **SDG Track (1–17)**   | SDG 8 — Decent Work and Economic Growth (targets 8.2, 8.3) |
| **Team Leader**        | _TODO_                                                    |
| **University**         | Taylor's University                                       |
| **Number of Members**  | 3                                                         |

## Links

| Resource          | Link                                    |
| ----------------- | --------------------------------------- |
| GitHub Repository | https://github.com/POTATO0826/Bababoi   |
| Live Demo         | _TODO_                                  |
| RunPod Endpoint   | _TODO_                                  |
| Slide Deck        | _TODO_                                  |
| Demo Video        | _TODO_                                  |

---

## Overview

### Problem

A small furniture retailer's warehouse can be full while the business needs different stock. Older batches occupy bays that new stock with proven sales should have. Clearing them means finding a buyer, checking delivery costs and arranging collection across spreadsheets and chat messages, and until the goods leave, the space stays occupied. Stock records also drift from what is physically on the shelves.

### Solution

WareOrb links the stock ledger, approvals and physical space in one workflow. It flags ageing batches, hands them to sales with a buyer brief, compares complete delivery quotes and prepares the owner's decision. A bay is freed only when warehouse staff confirm collection.

AI makes this workflow usable. **Jarvis**, a voice and chat agent built on Claude, answers stock questions in English or Chinese and opens the next task. Claude also drafts receiving lines from a photo of a supplier delivery note. Explicit rules calculate quantities and costs, and people approve every stock change.

> Demo uses synthetic stock data. Carrier booking is simulated; Lalamove runs in sandbox.

### Key Features

- **Capacity reallocation** — ageing batch → sales handoff → buyer offer → delivery quotes → owner approval → confirmed collection frees the bay.
- **Jarvis** — voice and chat agent (Claude tools, Fish Audio voice, EN / 中文) that finds stock and opens panels. It never approves, posts or collects.
- **3D digital twin** — two-floor isometric warehouse; bays show ageing, reserved, freed and inbound states.
- **Verified receiving** — AI drafts lines from a delivery note; staff count and post.
- **Delivery quotes** — Lalamove sandbox and manual quotes; unresolved charges and expired quotes are flagged.
- **Replenishment advice** — a coverage rule based on recorded sales, within space and budget limits; the owner creates the PO.
- **Roles and audit** — Owner, Sales and Warehouse roles; versioned approvals; every movement logged.

### Tech Stack

| Layer         | Technology                                                       |
| ------------- | ---------------------------------------------------------------- |
| Frontend      | React 19, TypeScript, React Three Fiber + drei, Tailwind v4, shadcn/ui, zustand |
| Backend       | Convex (queries, mutations, actions, HTTP actions)               |
| Database      | Convex document database (stock ledger)                          |
| AI            | Claude (Anthropic) — Jarvis tools, delivery-note reading; Fish Audio — speech in/out |
| Integrations  | Lalamove sandbox quotation API                                   |
| Runtime       | Bun (dev server, bundler, tests)                                 |
| AI / Compute  | RunPod — _TODO_                                                  |
| Hosting / Dev | Replit — _TODO_                                                  |

---

## Project Structure

```
.
├── brand/                   # WareOrb logos
├── convex/                  # Backend: schema, ledger, deals, quotes, receiving, replenish, Lalamove
├── docs/                    # Product concept and design handoff
├── src/
│   ├── components/          # UI (shadcn/ui), inventory, Jarvis, viewport
│   ├── data/                # Catalogue and floor layout
│   ├── domain/              # Pure business rules + unit tests (shared by Convex and browser)
│   ├── scene/               # 3D warehouse (React Three Fiber)
│   └── index.ts             # Bun server entry point
├── replit/                  # Replit proof of use (PDF)
├── submission/              # Required submission PDFs (see submission/README.md)
├── LICENSE
├── package.json
└── README.md
```

### Architecture

```
Staff (Owner · Sales · Warehouse)
        │  voice / chat / clicks
        ▼
Browser — React + 3D warehouse + Jarvis
        │  live queries and mutations
        ▼
Convex — stock ledger, deals, quotes, receiving, replenish, audit log
        ├──► Claude      (Jarvis tools, delivery-note extraction)
        ├──► Fish Audio  (speech to text, text to speech)
        └──► Lalamove    (sandbox delivery quotes)
```

---

## How to Run

### Option 1 — Run on Replit

_TODO: add the Replit project link and steps._

### Option 2 — Run Locally

Requires [Bun](https://bun.sh) and a free [Convex](https://convex.dev) account.

```bash
# 1. Clone the repository
git clone https://github.com/POTATO0826/Bababoi.git
cd Bababoi

# 2. Install dependencies
bun install

# 3. Start the Convex backend (terminal 1). Log in when asked; this writes .env.local
bunx convex dev

# 4. In .env.local, add the browser URL (same value as CONVEX_URL)
#    BUN_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud

# 5. Load synthetic demo data
bunx convex run seed:run

# 6. Start the app (terminal 2)
bun dev                         # http://localhost:3000
```

Optional API keys go in the Convex dashboard (**Settings → Environment Variables**). Each feature falls back without its key.

| Variable | Enables |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude for Jarvis and delivery-note reading |
| `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET` | Live Lalamove sandbox quotes |
| `FISH_API_KEY`, `FISH_VOICE_ID` | Fish Audio voice (otherwise browser speech) |

### Run Tests

```bash
bun test src/domain             # business rules
bunx tsc --noEmit               # frontend types
bunx tsc -p convex --noEmit     # backend types
```

---

## How We Use Replit *(Required)*

_TODO: describe how the team used Replit (development, hosting, secrets)._

📄 Proof of use: [`replit/SDC2026_TeamName_Replit_POU.pdf`](replit/SDC2026_TeamName_Replit_POU.pdf)

## How We Use RunPod *(Required)*

_TODO: describe the RunPod workload, setup and integration._

📄 Proof of use: [`submission/SDC2026_TeamName_Runpod_POU.pdf`](submission/SDC2026_TeamName_Runpod_POU.pdf)

---

## Challenges & Learnings

- **One source of truth.** The 3D map, inventory list, badges and Jarvis all read one Convex ledger snapshot, so they never disagree.
- **AI that does not invent numbers.** Claude reads documents and guides staff, but quantities and costs come from tested rules in `src/domain`, and only people approve, post or collect.
- **Approval is not empty space.** Approving a sale only reserves stock; physical stock falls and the bay frees only when collection is confirmed.
- **Fair quote comparison.** The cheapest headline quote can hide an unloading charge or be expired, so incomplete quotes are flagged.
- **Works without keys.** Every external service has a labelled fallback, so the demo runs offline.

## Future Improvements

- [ ] Pilot with furniture retailers to measure decision time, avoidable costs and stock accuracy
- [ ] Production sign-in and hosted deployment
- [ ] Real carrier booking (currently simulated)
- [ ] End-of-day stock report to WhatsApp
- [ ] Orbyte platform connector
- [ ] Mobile layout

## Team

| Name                 | Role                                      | GitHub                                         |
| -------------------- | ----------------------------------------- | ---------------------------------------------- |
| Alfred Lee Khai Zher | Pitch and business case                   | [@AlfredLeeKZ](https://github.com/AlfredLeeKZ) |
| Vince Loo Yi Sheng   | Frontend, 3D warehouse and Convex backend | [@POTATO0826](https://github.com/POTATO0826)   |
| Deng Zhen Quan       | Production backend, auth and promo video  | [@quinnDzq](https://github.com/quinnDzq)       |

---

## Submission Checklist

- [ ] Team name, domain (Domain 1 / Domain 2) and SDG track filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [ ] Replit used, with proof of use in `replit/`
- [ ] RunPod used, with proof of use in `submission/`
- [ ] Preliminary submission completed (`SDC2026_TeamName_Preliminary.pdf`)
- [ ] Technology declaration completed (`SDC2026_TeamName_TechDeclaration.pdf`)
- [ ] Submission files renamed with your team name (replace `TeamName`)
- [ ] "How to Run" steps verified
- [ ] No API keys or secrets committed to the repository

## License

This project is licensed under the [Apache License 2.0](LICENSE).
