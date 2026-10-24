# WareOrb

Local furniture warehouse demo: receiving, inventory, sales, replenishment, a two-floor 3D digital twin and the Jarvis assistant. Warehouse data is stored on the presentation computer and survives restarts. No warehouse account or public hosting is required.

**Stack:** Bun (runtime, dev server, bundler) · TypeScript · React 19 · React Three Fiber + drei · zustand · Tailwind v4 + shadcn/ui · Orbkit SHDR-11 orb.

## Run on Windows, macOS or Linux

Install **Bun 1.4.3 or newer** from [bun.sh](https://bun.sh/docs/installation) and **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/en/download). Reopen the terminal after installation. On macOS, Homebrew users can run `brew install bun node@24`.

Run these commands in a fresh checkout (PowerShell, Terminal or a Linux shell):

```sh
git clone https://github.com/POTATO0826/Bababoi.git
cd Bababoi
bun install --frozen-lockfile
bun run demo
```

Open **http://127.0.0.1:3000**. The first run downloads the local backend and loads synthetic inventory. Internet access is needed for that download and for AI or Lalamove requests. `Ctrl+C` stops the app; `bun run demo` starts it again with the same data. `bun run demo:reset` deliberately replaces local warehouse data with fresh demo data.

Connect Claude in **Jarvis → Log in** (or `/login`); disconnect with **Log out** or `/logout`. Connect Lalamove sandbox keys in **Delivery → Connect** for real sandbox quotes. Both connections keep credentials only in server memory for that run. A warehouse account, terminal AI login and `.env` editing are unnecessary.

**Do not copy credentials or `.env.local` from another computer.** Startup generates this computer's private local settings and database in ignored files. An existing cloud `.env.local` is refused: use a separate checkout. Keep keys out of Git, screenshots and chat. The demo requires network access for live Claude/Lalamove, and Lalamove supports sandbox quotes only.

See [local setup, optional ports and troubleshooting](docs/local-demo.md), [demo scenarios](docs/demo-data.md) and [configuration template](.env.example). Chrome or Edge supports live voice transcription; microphone permissions and browser recognition availability apply. Photo reading needs a connected Claude provider.

## Checks

```sh
bun run check          # domain/backend tests, both typechecks and production build
bun run test:startup   # isolated first run + restart, inventory access and process cleanup
```

GitHub Actions runs these checks on Windows, macOS and Linux with Node 24 and Bun 1.4.3, plus a full-history credential scan. The startup test uses a disposable database and never copies your `.env.local` or provider credentials. `bun dev` alone is for frontend development and does not prepare a local demo backend.

URL flags include `?autoSpin=1`, `?voiceReplies=0`, `?showEmptyBays=0`. The low-stock threshold is the business setting (default 2), used alike by the inventory, map, badges and Jarvis.

## Layout

| Path | What |
| --- | --- |
| `src/data/catalog.ts` | Seed SKUs, categories, totals, low-stock rule (`available = onHand − reserved ≤ threshold`) |
| `src/data/layout.ts` | Floor geometry from WareTwin `gen_layout.py`: zones, bays, bay fill, racks, lifts |
| `src/store.ts` / `src/actions.ts` | zustand state; floor switch, selection, camera actions; Jarvis voice agent (Web Speech API) |
| `src/components/` | Header, inventory column, viewport HUD + Details popup, Jarvis dock + session |
| `src/scene/` | R3F scene: camera rig, building, bays, instanced furniture |

## 3D scene

The prototype drew the warehouse as SVG polygons. The R3F rebuild keeps its layout, colours, camera and interactions, and adds:

- Orthographic true-isometric camera that eases between overview and zone framing, orbits on drag, and tilts smoothly between Isometric and Top-down. Framing keeps clear of the Details popup and the Jarvis drawer.
- About 30 furniture templates (sofas with cushions, L-sofa chaise, recliners, round/coffee/side/console tables, desks, glass tables, dining/bar/office/lounge/rocking/kids chairs, wardrobes with door seams and handles, beds with linen and pillows, bunk and day beds, mattress stacks, rug rolls, floor lamps, cartons on pallets, mirror crates). Each is merged once and drawn with `InstancedMesh`.
- Selection and hover: per-instance glow plus a screen-constant outline hull on every unit of the selected SKU.
- Pallet racking, concrete floor, painted aisles with safety lines and wayfinding chevrons, dock doors, and detailed lifts.
- Walls cut away on the side facing the camera and rise again as you orbit.
- Soft directional shadows and contact-shadow blobs; drops resolution if the frame rate falls.
- The pending supplier note DN-2291 shows as shrink-wrapped units in the inbound dock (hover for details). These units are not counted as on hand.

## Notes

- Voice input needs a browser with `SpeechRecognition` (Chrome, Edge). Elsewhere, tap the suggestions. Replies use `speechSynthesis`.
- Jarvis uses the connected AI provider and warehouse tools to read inventory, explain replenishment and request validated sandbox delivery quotes. Stock changes use the warehouse forms and their confirmation steps.
- In dev, `__ware.getState()` in the browser console shows the app state.
