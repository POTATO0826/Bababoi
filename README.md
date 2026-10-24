<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/wareorb-logo-transparent-white-text.png">
    <img src="brand/wareorb-logo-transparent-dark-text.png" alt="WareOrb" width="360">
  </picture>
</p>

# WareOrb

> A 3D warehouse with an AI assistant that helps small furniture retailers turn ageing stock into approved sales and free up shelf space, with the owner in control.

---

## Team Information

| Field                  | Details                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Team Name**          | Bababoi                                                                       |
| **Team Domain**        | Domain 2 — Orbyte Smart SME Challenge                                         |
| **SDG Track (1–17)**   | SDG 8 — Decent Work and Economic Growth · SDG 9 — Industry, Innovation and Infrastructure |
| **Team Leader**        | Alfred Lee Khai Zher                                                          |
| **University**         | Taylor's University                                                           |
| **Number of Members**  | 3                                                                             |

## Links

| Resource          | Link                                  |
| ----------------- | ------------------------------------- |
| GitHub Repository | https://github.com/POTATO0826/Bababoi |
| Live Demo         | https://wareorb-demo.vercel.app/      |
| Slide Deck        | https://canva.link/23u3t20hv0yk7dx    |
| Demo Video        | _TODO_                                |

---

## Overview

### Problem

A small furniture retailer's warehouse can be full while the business needs different stock. Older batches occupy bays that should hold products with proven sales. Clearing them means finding a buyer, measuring the goods, getting delivery quotes and arranging collection across spreadsheets and chat messages. Until the goods leave, the space stays occupied, and stock records drift from what is on the shelves.

### Solution

WareOrb connects the stock ledger, approvals and physical space in one workflow. It flags ageing batches and hands them to sales. It checks that the cargo fits a vehicle, compares real delivery quotes and prepares the owner's decision. Approval reserves the bays; the space is freed only when warehouse staff confirm collection.

**Jarvis** is the AI assistant, built on Claude. It answers stock questions with read-only tools, shows each item in the 3D warehouse, and reads a supplier's delivery-note photo into an editable receiving draft. Tested rules calculate quantities and costs. People approve, post and collect. Jarvis cannot.

> The demo uses synthetic data, labelled **Synthetic**. Lalamove runs in sandbox for quotes only; no driver is booked and no money is charged.

### Key Features

- **Capacity reallocation** — ageing batch → sales handoff → buyer and destination → confirmed measurements → delivery quotes → owner approval → confirmed collection frees the bay.
- **Jarvis** — chat assistant with warehouse tools (inventory, movements, purchase orders, reorder analysis, show in warehouse) and delivery tools. Each tool call is shown; `/` commands open panels.
- **3D digital twin** — two-floor isometric warehouse; bays show ageing, reserved, freed and inbound stock.
- **Verified receiving** — photo reading, voice notes kept as evidence, measurements with units; staff count, confirm condition and assign bays before posting.
- **Delivery quotes** — Lalamove sandbox (Malaysia) with a vehicle-fit check; expired, incomplete, outdated or synthetic quotes cannot be approved.
- **Replenishment plan** — based on recorded sales, least stock cover first, within budget and free bays; items without a cost or sales history show the reason instead of a number.
- **Roles and history** — Owner, Sales and Warehouse roles checked on the server; Clerk sign-in and staff invites for hosted use; every movement and decision recorded.

### Tech Stack

| Layer         | Technology                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript, React Three Fiber + drei, Tailwind v4, shadcn/ui, zustand |
| Backend       | Convex (local backend for the demo, Convex cloud for hosted use)              |
| Database      | Convex — stock ledger, sales, quotes, receipts, purchase orders, history      |
| AI            | Claude (Anthropic) through the Pi agent runtime — Jarvis tools and photo reading |
| Voice         | Browser speech (Chrome / Edge); Fish Audio optional for hosted use            |
| Integrations  | Lalamove sandbox API (quotes only)                                            |
| Auth          | Clerk (hosted); local presenter sign-in (demo)                                |
| Runtime / CI  | Bun, Node.js 24, GitHub Actions on Windows, macOS and Linux, gitleaks         |
| AI / Compute  | RunPod — _TODO_                                                               |
| Hosting / Dev | Replit — _TODO_                                                               |

---

## Project Structure

```
.
├── .github/workflows/       # CI: checks on Windows, macOS, Linux + credential scan
├── brand/                   # WareOrb logos
├── convex/                  # Backend: schema, ledger, deals, quotes, receiving, replenish, access
├── docs/                    # Concept, local demo guide, deployment guide
├── replit/                  # Replit proof of use (PDF)
├── scripts/
│   ├── demo.ts              # `bun run demo`: local backend, demo data and web server
│   ├── smoke-demo.ts        # First-run startup test
│   └── build-production.ts  # Hosted release build
├── src/
│   ├── components/          # UI (shadcn/ui): Jarvis, work panels, details, delivery
│   ├── domain/              # Business rules + tests, shared by Convex and the browser
│   ├── local/               # Demo server: Jarvis agent, tools, Lalamove client
│   ├── scene/               # 3D warehouse (React Three Fiber)
│   ├── voice/               # Recording, transcripts, speech
│   └── index.ts             # Bun server entry point
├── submission/              # Required submission PDFs
├── tests/browser/           # Browser test harness
├── .env.example             # Configuration template (names only)
├── LICENSE
└── README.md
```

### Architecture

```
Staff (Owner · Sales · Warehouse)
        │  clicks · / commands · chat · photos · voice notes
        ▼
Browser — React + 3D warehouse + Jarvis
        │                                  │
        │ live queries / mutations         │ agent + connection routes
        ▼                                  ▼
Convex                              WareOrb server (Bun)
  stock ledger, sales, quotes,  ◄──►  Jarvis agent (Pi), keys in memory only
  receipts, replenishment,             ├──► Claude    (answers, photo reading)
  history                              └──► Lalamove  (sandbox quotes)
```

Jarvis calls the same authorised Convex functions as the screens, so it follows the same rules.

---

## How to Run

### Run Locally (Windows, macOS or Linux)

Install **Bun 1.4.3+** ([bun.sh](https://bun.sh/docs/installation)) and **Node.js 24 LTS** ([nodejs.org](https://nodejs.org/en/download)), then reopen the terminal. On macOS: `brew install bun node@24`.

```sh
git clone https://github.com/POTATO0826/Bababoi.git
cd Bababoi
bun install --frozen-lockfile
bun run demo                    # http://127.0.0.1:3000
```

The first run downloads the local backend and loads synthetic data, so it needs internet. `Ctrl+C` stops the app, and `bun run demo` restarts it with the same data. `bun run demo:reset` replaces the data with a fresh demo set.

No account or `.env` editing is needed. Connect services in the page:

- **Claude:** Jarvis → **Log in** (or `/login`). `/logout` disconnects.
- **Lalamove sandbox:** Delivery → **Connect** with your sandbox key and secret.

Keys stay in the server's memory for that run only. Don't copy `.env.local` from another computer; startup creates its own, and refuses to start with a cloud `.env.local`.

**Quick tour:** open sale **D-1002** → add a quote → send for approval → approve (bays reserved) → record carrier reference → confirm collection (bay freed).

More: [local demo guide, demo data and troubleshooting](docs/local-demo.md) · [hosted deployment](docs/deployment.md) · [configuration template](.env.example). Voice transcripts need Chrome or Edge; photo reading needs Claude connected.

### Run Tests

```sh
bun run check          # unit + Convex tests, both typechecks, production build
bun run test:startup   # clean first run and restart, then cleanup
bun run test:browser   # Chromium harness for Jarvis, measurements, Lalamove (needs Playwright)
```

GitHub Actions runs `check` and `test:startup` on Windows, macOS and Linux, plus a full-history credential scan.

---

## How We Use Replit *(Required)*

_TODO: describe how the team used Replit (development, hosting, secrets)._

📄 Proof of use: [`replit/SDC2026_TeamName_Replit_POU.pdf`](replit/SDC2026_TeamName_Replit_POU.pdf)

## How We Use RunPod *(Required)*

_TODO: describe the RunPod workload, setup and integration._

📄 Proof of use: [`submission/SDC2026_TeamName_Runpod_POU.pdf`](submission/SDC2026_TeamName_Runpod_POU.pdf)

---

## Challenges & Learnings

- **One source of truth.** The 3D map, panels, badges and Jarvis all read one Convex ledger, so they never disagree.
- **AI that does not invent numbers.** Jarvis's tools are read-only. Unknown measurements or costs stay unknown, never zero, and quantities come from tested rules.
- **Approval is not empty space.** Approving a sale only reserves stock; stock falls and the bay frees only when collection is confirmed.
- **Quotes you can trust.** A quote shows Lalamove's own expiry and goes stale when the cargo or route changes. Synthetic replies can never be approved.
- **Keys never touch disk.** Credentials entered in the page live only in server memory, and the demo refuses to run against a cloud database.
- **One command on any laptop.** `bun run demo` sets up the backend, data and server, and CI tests it on Windows, macOS and Linux.

## Future Improvements

- [ ] Pilot with furniture retailers to measure decision time, avoidable costs and stock accuracy
- [ ] Hosted launch with production sign-in and a domain
- [ ] Real carrier booking after approval (currently simulated)
- [ ] End-of-day stock report to WhatsApp
- [ ] Orbyte platform connector
- [ ] Mobile layout

## Team

| Name                 | Role                                      | GitHub                                         |
| -------------------- | ----------------------------------------- | ---------------------------------------------- |
| Alfred Lee Khai Zher | Team lead, pitch and business case        | [@AlfredLeeKZ](https://github.com/AlfredLeeKZ) |
| Vince Loo Yi Sheng   | Frontend, 3D warehouse and Convex backend | [@POTATO0826](https://github.com/POTATO0826)   |
| Deng Zhen Quan       | Production backend, auth and promo video  | [@quinnDzq](https://github.com/quinnDzq)       |

---

## Submission Checklist

- [x] Team name, domain (Domain 1 / Domain 2) and SDG track filled in
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
