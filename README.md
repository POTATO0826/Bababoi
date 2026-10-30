<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/wareorb-logo-transparent-white-text.png">
    <img src="brand/wareorb-logo-transparent-dark-text.png" alt="WareOrb" width="360">
  </picture>
</p>

# WareOrb

> An open-source 3D warehouse with an AI assistant. It helps small retailers turn ageing stock into approved sales and free up shelf space, with the owner in control.

[Live demo](https://wareorb-demo.vercel.app/) · [Apache 2.0](LICENSE)

---

## What it does

A warehouse can be full while the business needs different stock. Old batches sit in bays that should hold products that sell. Clearing them means finding a buyer, measuring the goods, getting delivery quotes and arranging collection, usually across spreadsheets and chat messages. Until the goods leave, the space stays taken and the stock records drift from what is on the shelves.

WareOrb puts the stock ledger, approvals and physical space in one place:

1. It flags ageing batches and hands them to sales.
2. Sales finds a buyer, confirms the measurements and gets delivery quotes.
3. It checks the cargo fits the vehicle and sends the deal to the owner.
4. Approval reserves the bays. The bay is freed only when warehouse staff confirm collection.

**Jarvis** is the built-in AI assistant (Claude). It answers stock questions, shows items in the 3D warehouse and reads a supplier's delivery-note photo into an editable receiving draft. Jarvis can only read. People approve, post and collect.

## Features

- **3D warehouse** with two floors. Bays show ageing, reserved, freed and inbound stock.
- **Ageing stock to sale**: ageing batch → buyer → measurements → delivery quote → owner approval → collection frees the bay.
- **Jarvis assistant** with read-only warehouse and delivery tools. Every tool call is shown.
- **Receiving**: read a delivery note from a photo, keep voice notes as evidence, record measurements. Staff count and confirm before stock is posted.
- **Delivery quotes** from the Lalamove sandbox (Malaysia) with a vehicle-fit check. Expired or incomplete quotes can't be approved.
- **Replenishment plan** from recorded sales, within budget and free bays.
- **Roles and history**: Owner, Sales and Warehouse roles are checked on the server, and every movement and decision is recorded.

---

## Quick start

You need **[Bun](https://bun.sh/docs/installation) 1.4.3+** and **[Node.js](https://nodejs.org/en/download) 20, 22 or 24** (24 recommended). Works on Windows, macOS and Linux.

```sh
git clone https://github.com/POTATO0826/Bababoi.git
cd Bababoi
bun install --frozen-lockfile
bun run demo
```

Open **http://127.0.0.1:3000**. There is no login page: you are signed in as the owner and the warehouse is filled with synthetic sample data.

| Command | What it does |
| --- | --- |
| `bun run demo` | Start the app. The first run downloads the local database and needs internet. |
| `Ctrl+C` | Stop. Your data is kept for the next start. |
| `bun run demo:reset` | Start with a fresh copy of the sample data. |

> Don't copy `.env.local` or `.convex/` from another computer. The first run creates its own.

## How to use it

### Moving around

- **Drag** to rotate the 3D warehouse and **scroll** to zoom. Click a zone to zoom in, then a bay to see its stock. **Double-click** resets the view.
- Type **`/`** in Jarvis to open a panel:

| Command | Panel |
| --- | --- |
| `/ageing` | Ageing stock ready to hand to sales |
| `/deals` | Sales in progress |
| `/delivery` | Delivery quotes for a sale |
| `/approve` | Sales waiting for the owner's approval |
| `/collect` | Approved sales to collect |
| `/receive` | Incoming deliveries to check and post |
| `/replenish` | What to reorder, within budget |

### Try the full flow

1. Open sale **D-1002** (`/deals`).
2. **Add quote**, record the carrier's reply, then **Send for approval**.
3. In `/approve`, **Approve** it. The bay is now reserved.
4. **Record carrier reference**, then record the collected units in `/collect`. The bay turns green (freed) and stock updates.

### Connect Jarvis (optional)

Everything works without AI. To chat with Jarvis or read delivery-note photos:

1. In Jarvis, click **Log in** (or type `/login`).
2. Paste a [Claude API key](https://console.anthropic.com/) and press **Log in**.

Type `/logout` to disconnect. The key is kept in memory only, never written to disk, so you log in again after restarting.

### Connect Lalamove (optional)

For real delivery prices, open `/delivery` → **Connect** and enter a Lalamove **sandbox** key and secret (Malaysia). WareOrb only asks for quotes. It never books a driver or charges money.

More detail, the sample data and troubleshooting: **[docs/local-demo.md](docs/local-demo.md)**.

---

## Hosting it for a team

`bun run demo` runs everything on one computer. To host WareOrb for real staff, it uses Convex cloud for the database and Clerk for staff sign-in, with owner invites. See **[docs/deployment.md](docs/deployment.md)** and the settings in **[.env.example](.env.example)**.

## Tests

```sh
bun run check          # unit + backend tests, typechecks and production build
bun run test:startup   # clean first start and restart
bun run test:browser   # browser tests (needs Playwright)
```

GitHub Actions runs these on Windows, macOS and Linux, plus a secret scan.

## Project structure

```
.
├── brand/          # Logos
├── convex/         # Backend: schema, stock ledger, deals, quotes, receiving, access
├── docs/           # Guides: local demo, deployment, concept
├── scripts/        # `bun run demo`, startup test, production build
├── src/
│   ├── components/ # UI (shadcn/ui): Jarvis, panels, delivery
│   ├── domain/     # Business rules + tests, shared by backend and browser
│   ├── local/      # Local server: Jarvis agent, tools, Lalamove client
│   ├── scene/      # 3D warehouse (React Three Fiber)
│   ├── voice/      # Recording, transcripts, speech
│   └── index.ts    # Bun server entry
└── tests/browser/  # Browser test harness
```

### How it fits together

```
Browser — React + 3D warehouse + Jarvis
        │                                  │
        │ live queries / mutations         │ agent + connection routes
        ▼                                  ▼
Convex                              WareOrb server (Bun)
  stock ledger, sales, quotes,  ◄──►  Jarvis agent, keys in memory only
  receipts, replenishment,             ├──► Claude    (answers, photo reading)
  history                              └──► Lalamove  (sandbox quotes)
```

Jarvis calls the same server functions as the screens, so it follows the same rules.

### Built with

React 19 · TypeScript · React Three Fiber · Tailwind v4 · shadcn/ui · zustand · Convex · Bun · Claude (Anthropic) · Lalamove sandbox API · Clerk (hosted sign-in)

---

## Contributing

Issues and pull requests are welcome.

1. Fork the repo and create a branch.
2. Run `bun run demo` to try your change.
3. Run `bun run check` before opening a pull request.

Never commit API keys or `.env.local`.

## Authors

Built by team **Bababoi** at Taylor's University.

| Name | GitHub |
| --- | --- |
| Alfred Lee Khai Zher | [@AlfredLeeKZ](https://github.com/AlfredLeeKZ) |
| Vince Loo Yi Sheng | [@POTATO0826](https://github.com/POTATO0826) |
| Deng Zhen Quan | [@quinnDzq](https://github.com/quinnDzq) |

## License

[Apache License 2.0](LICENSE)
