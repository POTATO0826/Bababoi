# Handoff: WareOrb — Warehouse Overview (first screen)

## Overview
WareOrb is a two-floor 3D furniture-stock warehouse for small retailers. This screen is the main console: a searchable inventory list on the left, an isometric digital twin of the selected floor in the centre, a contextual summary/detail panel on the right, and a Jarvis voice-agent orb that opens a chat panel. Product context is in `reference/WareOrb_Concept.md`.

## About the design files
The files here are **design references built in HTML**: prototypes that show the intended look and behaviour. They are not production code to ship. Recreate them in the target codebase (the team's WareTwin repo uses **React 18 + TypeScript + Vite + React Three Fiber + zustand**; that's the recommended target). Use shadcn/ui for the chrome.

- `WareOrb Overview.dc.html`: the full prototype. Open it in a browser (it needs `support.js` beside it). The `<script data-dc-script>` block at the bottom holds all logic and data in one class; the markup above it is the template.
- `jarvis-orb.js`: the voice orb as a dependency-free web component. It is a port of **Orbkit SHDR-11 "Hydrogen"** (MIT, github.com/zzzzshawn/orbkit). In React, install the real thing instead: `npx shadcn@latest add zzzzshawn/orbkit/shdr-11`, then `import { Shdr11 } from "@/components/ui/shdr-11"`.
- `support.js`: prototype runtime only. Do not port.

## Fidelity
**High-fidelity.** Colours, type, spacing and interactions are final. The 3D scene is drawn as SVG isometric polygons in the prototype; in production, rebuild it in React Three Fiber with real meshes (instanced per furniture type), keeping the same layout, colours, camera behaviour and interaction model.

## Layout
- App shell: CSS grid, rows `52px | 1fr`, full viewport height, background `#09090b`.
- Body grid: `padding 12px; gap 12px`, columns:
  - ≥1180px wide: `316px | 1fr` (+ `320px` right column while the Jarvis session is open)
  - 980–1179px: `280px | 1fr` (+ `272px` while Jarvis is open)
  - <980px: `256px | 1fr`; Jarvis opens as a fixed drawer (`top 64px; right 12px; bottom 12px; width min(340px, 100vw − 24px)`). Left and centre become fixed `min(560px, 100vh − 76px)` tall.
- All panels: `border 1px #27272a`, `radius 8px`, `bg #0c0c0f`. Inventory cards use `radius 12px`, `bg #111114`.

## Components

### 1. Header (52px)
`bg #0c0c0f`, bottom border `1px #27272a`, `padding 0 16px`.
- Brand: Lucide `warehouse` icon 18px `#4F8BEA` + "WareOrb" (15px/600, letter-spacing −0.01em), margin-right 18px.
- No nav links (single-screen for now).
- Right side, gap 10px: "Live" pill (28px, `border 1px #27272a`, radius 999px, 12px `#a1a1aa`, 7px green dot `#22c55e` blinking 2s), bell icon button 32px with a 7px `#E3BD78` unread dot, avatar 28px circle `border #3f3f46` `bg #18181b` initials "JL" 11px/600.

### 2. Inventory (left column)
- Heading "Inventory" 17px/600 + right-aligned total units (Geist Mono 12px `#a1a1aa`).
- Search input: 38px, radius 8px, `bg #0c0c0f`, border `#27272a`, Lucide `search` 15px at left 11px, placeholder "Search model, SKU or variant", × clear button at right when non-empty.
- **Default (no query) = overview page**:
  - "Total inventory" card: header + "{n} SKUs", 2×2 stat tiles (On hand / Reserved / Available (blue) / Incoming) for the whole warehouse, then two floor cards ("Floor 1 · {units} units · categories") that switch floors; the active floor card is `bg #1c1c21`, `border #3f3f46`.
  - Category list card (below).
- **With a query = results page**: a single "Results" card listing every matching SKU row (same row markup as below, title "Model · Variant"), or "No stock matches “…”".
- **Jarvis dock** pinned at the bottom of the column: card (`radius 12px`, `bg #111114`) with a 56px orb, "Jarvis" + hint ("Tap to talk · locate, count, analyze"), and the status pill. Pressing it opens the Jarvis session (right column / drawer) and starts listening.
- Category list (one bordered card; rows separated by `1px #27272a`). Each category row (padding 14px, gap 12px):
  - Icon tile 42×42, radius 9px, `bg #1b1b20`, `border #2a2a30`, Lucide icon 19px `#d4d4d8` (sofa, table, armchair, wardrobe, bed-double, package).
  - Title 15px/600 + optional pill (20px, radius 999px, 11.5px/500): "Viewing" (`#27272a` / `#d4d4d8`) when that zone is zoomed, otherwise "Low stock" (`rgba(227,189,120,.14)` / `#E3BD78`) if any SKU is low.
  - Meta line 13px `#a1a1aa`: "{n} SKUs · {m} models · F1 · F2".
  - Status line 12.5px with 7px dot: green `#4ade80` "All counts verified 09:42" or amber `#E3BD78` "{n} SKUs below threshold".
  - Right action: "Open"/"Hide" 13.5px `#a1a1aa` (hover `#fafafa`). Below ~1180px it shows total units instead.
  - Totals strip under the row: 4 equal cells (On hand / Reserved / **Available** / Incoming) — 2×2 when the column is under 1180px — 1px gaps on `#1f1f24`, cells `bg #0e0e11`, label 9.5px uppercase `#71717a` (Available label `#8db1f3`, value `#9dbdf5`), value Geist Mono 13px/600.
  - Active (zoomed) category row background: `#17171b`.
- Expanded SKU list (`bg #0c0c0f`): model sub-heading 11px/600 uppercase `#71717a`, then one row per SKU (padding 9px 14px, top border `#1f1f24`):
  - 28px colour swatch (radius 3px, `border rgba(255,255,255,.18)`) using the SKU's material colour.
  - Variant 13.5px/500 + optional "Low" pill (18px).
  - SKU code (Geist Mono 11.5px `#71717a`).
  - Location line: "F1 · Zone A · A-1-01 – A-1-06".
  - Right of that, nothing: the counts sit on a wrapped line under the location: "{onHand} on hand · {available} available (amber if low, else blue) · {reserved} reserved · {incoming} incoming" (Geist Mono 11px).
  - Selected row: `bg rgba(79,139,234,.12)` with `inset 2px 0 0 #4F8BEA`.

### 3. Warehouse viewport (centre)
`bg radial-gradient(ellipse at 50% 58%, #17171c 0%, #0b0b0e 68%)`, cursor `grab`.
- **Geometry (from WareTwin `docs/layout/gen_layout.py`)**: 100 × 70 m floor. Zones A `[4,10,46,32]`, B `[54,10,96,32]`, C `[4,38,46,62]`, D `[54,38,96,62]` (x0,z0,x1,z1 in metres). Central aisle x 46–54, cross aisle z 32–38, walkway z 8–10, inbound docks x 20–46 / outbound x 54–80 along z 0–8 (amber 0.4 m line at z 7.6–8), staging x 40–60 z 63–68, lifts at `[49.4,42.4,52.6,45.6]` and `[49.4,54.4,52.6,57.6]` (3 m tall, `#3a3a42`).
- **Bays**: each zone holds 3 rows × 6 bays. Bay 5.8 × 2.6 m, pitch 6.9 m in x, 7 m in z, starting at zone x0+0.9, z0+2.5. Code format `{zone}-{row}-{bay:02}` e.g. `A-2-03`. SKUs fill bays in order, `min(cap, remaining)` units per bay.
- **Bay floor pad** (bay + 0.3 m): in stock `rgba(255,255,255,.035)` stroke `#3a3a42`; low stock `rgba(227,189,120,.16)` stroke `#E3BD78`; selected `rgba(79,139,234,.3)` stroke `#8db1f3`; empty transparent with dashed `#3f3f46` stroke; hover stroke `#fafafa`.
- **Furniture models** are built from boxes in each SKU's real material colour (top face lightened 20%, side faces shaded by light direction). See `buildModel()` for exact dimensions per kind: sofa (seat + back + arms), L-sofa (with chaise), recliner, table (4 legs + top; glass top at 72% alpha), chair (seat + back), wardrobe (2.1 m tall with door seams), bed (base + mattress + headboard), mattress stack, rug rolls, floor lamp, carton (with tape line).
- **Labels**: none on the scene (no quantities, zone names or signs). All stock information lives in the left inventory list and the right panel.
- **HUD, top**: left shows Back button (when zoomed) + breadcrumb "Main Warehouse ▾ › Floor N › {Category} · Zone X" (clicking "Main Warehouse" also returns to the full floor). Right shows a **Details** toggle (opens the stock popup) and segmented toggles Floor 1 / Floor 2 and Isometric / Top-down (26px tabs, active `#27272a`/`#fafafa`). Under 760px width the labels shorten to Iso/Top and "Main Warehouse" hides while zoomed.
- **HUD, bottom-left**: legend (In stock / Low stock / Selected / Empty bay) + floor stat "Floor N · occupied/total bays · units · drag to orbit".
- **HUD, bottom-centre (zoomed only)**: white pill button "View whole warehouse" (38px, radius 999, Lucide `maximize` icon) that returns to the full floor. Esc and double-click do the same.
- **Hover tooltip** (zoomed only): swatch + "Model · Variant", "SKU · bay code", "{qty} here · {available} available".

### 4. Details popup (replaces the old right column)
Opened by the **Details** button in the viewport HUD, or automatically when a SKU is selected (unless the Jarvis session is open). Positioned absolute inside the viewport: `top 52px; right 12px; width min(320px, 100% − 24px); max-height calc(100% − 156px)`, `radius 8px`, shadow `0 16px 40px rgba(0,0,0,.55)`. Scrolls internally; pointer/wheel events don't reach the map.
Shows **Floor N summary** by default: 2×2 stat tiles (On hand, Reserved, Available highlighted blue, Incoming), Low-stock list (clickable rows: swatch, name, SKU, "{n} left" amber), an "Awaiting verification" card for delivery note DN-2291 (amber border), and a × close.
When a SKU is selected it switches to **Selected model**: 34px swatch, kicker "Category · Model", title "Model · Variant" (16px/600), chips (SKU mono, "Floor N · Zone X", optional Low stock), 2×2 stat tiles, location chips "A-2-03 ×2", a 3-row History table (time · text · ±delta coloured green/amber), and a "View stock movements" button. × clears the selection and closes.

### 5. Jarvis voice agent (listening, not a chatbot)
- **Entry point**: the Jarvis dock at the bottom of the left column (56px Shdr11 orb, `wrapper="ring"`, `wrapperColor="currentColor"` on `#a1a1aa`, name + hint + status pill).
- **Pressed → session bar**: a right-hand column (320px / 272px; a fixed right drawer under 980px) with `slideIn` animation. Header: "Jarvis" + ×. Body, centred: status pill, 180px orb, caption of what was heard (13px italic `#71717a`; live interim text while the user speaks) and the spoken reply (15px `#fafafa`), then **On the map** (current floor/zone line + the selected SKU card with Hand/Rsvd/Avail/In mini-stats and bay chips) and **Try saying** (three full-width example commands with a mic glyph; tapping one acts as if spoken). Footer: round 44px mic mute toggle (muted = red tint `rgba(239,68,68,.15)` / `#f87171`) + white pill **End session**. **There is no text input or chat log.**
- **Voice I/O**: the prototype uses the browser Web Speech API. `SpeechRecognition` (en-US, interim results) runs while state is `listening` and restarts after each reply; the final transcript runs the command. `speechSynthesis` speaks replies (prop `voiceReplies`, default on). In production, swap in your STT/TTS or a realtime voice provider.
- **States → orb props**: `listening`, `thinking`, `speaking` (status pill colours: listening `#8db1f3`, thinking `#E3BD78`, speaking `#4ade80`, idle `#a1a1aa`). Shdr11 props used: `params={{speed:1.1}}`, `statePresets={{idle:{speed:.9},thinking:{speed:1.1},speaking:{speed:1.3}}}`, `stateVolumes={{idle:{input:0,output:.2},thinking:{input:.1,output:.45},speaking:{input:.2,output:.8}}}`, `volumes={{input:0,output:.6}}`, `pauseOffscreen`, `maxDpr={1.5}`. Map the prototype's `listening` to Shdr11 `idle` (Shdr11 only has idle/thinking/speaking).
- **Command handling** (prototype uses keyword rules; replace with your LLM/tooling). Sequence: listening 600 ms → thinking 900 ms → speaking ~3.2 s → listening.
  - "take me to / find …": match a SKU, switch floor if needed, zoom to its zone, select it, then answer with bays and counts.
  - "how many / left": read the selected SKU's on hand, reserved, available and incoming.
  - "low stock": list low SKUs on the current floor.
  - "analyze today / report": summarise receipts, dispatches, reservations and pending notes.
  - Per the concept doc, the agent **never invents counts or changes stock silently**. Transfers need an explicit confirmation step.

## Interactions & behaviour
- **Click a zone** (overview) → camera eases to fit that zone (0.9 s, `cubic-bezier(.2,.8,.2,1)`), filling ~84% of the frame. **Click a bay** while zoomed → select its SKU (opens Details unless Jarvis is open). **Back**, **View whole warehouse**, **Main Warehouse** crumb, **Esc** or **double-click** → overview.
- **Click a category** in the list → expand it and zoom to its first SKU's zone (switching floor if needed). **Click a SKU row** → select it, zoom, and Jarvis reads the counts.
- **Floor switch**: fade the scene out (260 ms), swap the floor, fade in. Clears zone and selection.
- **Camera**: iso scale 7.2 px/m (top-down 9.2). Drag horizontally to orbit 360° (0.008 rad/px), wheel to zoom (×1.12 per step, clamped 0.6–3.5), double-click to reset. Auto-spin is **off** by default (prop `autoSpin`). A drag suppresses the click that ends it.
- **Low-stock rule**: `available = onHand − reserved`; low when `available ≤ lowStockThreshold` (default 4).
- Animations: panels and expanded lists `fadeUp` (opacity 0→1, translateY 6px→0, 250–350 ms ease).

## State
`floor (1|2)`, `view ('iso'|'top')`, `theta` (camera yaw), `zoomMul`, `zone (A–D|null)`, `selected (SKU|null)`, `openCat`, `hover`/`tip`, `query`, `panelOpen` (Details popup), `agentOpen` (Jarvis session), `muted`, `interim`, `orb ('idle'|'listening'|'thinking'|'speaking')`, `transcript[]`. Tweakable props: `autoSpin`, `voiceReplies`, `lowStockThreshold`, `showEmptyBays`, `alwaysLabels`.

## Data model
The concept doc says the stock ledger is the source of truth and the 3D scene only visualises it. The prototype's `CATS` array is synthetic seed data with 38 SKUs. Each SKU has:
```ts
{ sku: string;        // CATEGORY-MANUFACTURER-MODEL, e.g. "SOFA-HAVN-2140"
  variant: string;    // "Grey"
  color: string;      // material hex, drives the 3D model + swatch
  floor: 1 | 2; zone: 'A'|'B'|'C'|'D';
  onHand: number; reserved: number; incoming: number;
  // derived: available = onHand - reserved; bay codes from layout fill
}
```
Category prefixes: SOFA, TABLE, CHAIR, WARD, BED, MATT, RUG, LAMP, HDWR, CUSH, BEDD, MIRR. Manufacturers (fictional): HAVN, NORDE, KIRA, LUMA, OSTA, VELA, BRUN, TEKO. Floor 1 holds Sofas (A), Tables (B), Chairs (C) and Wardrobes (D). Floor 2 holds Beds (A), General stock (B), Chairs (C) and Tables (D).

## Design tokens
- Background `#09090b`, panel `#0c0c0f`, card `#111114`, inset `#0e0e11` / `#121216`, raised `#18181b` / `#1b1b20` / `#1c1c21`.
- Borders `#27272a` (default), `#1f1f24` (inner), `#3f3f46` (strong).
- Text `#fafafa`, `#d4d4d8`, muted `#a1a1aa`, faint `#71717a`, disabled `#52525b`.
- Accent blue `#4F8BEA` (light `#8db1f3`, value `#9dbdf5`, tint `rgba(79,139,234,.12)`).
- Warning/low `#E3BD78` (tint `rgba(227,189,120,.14)`). Success `#22c55e` / `#4ade80`.
- Fonts: **Geist** 400/500/600/700 (UI), **Geist Mono** 400/500 (numbers, SKUs, codes).
- Type: 17 (section title) · 15 (row title) · 13.5 (body/nav) · 13 · 12.5 · 12 · 11.5 · 11 · 10/9.5 (uppercase labels, letter-spacing .05–.06em).
- Radius: 4 (chips/tabs), 6 (buttons/tiles), 8 (panels/inputs), 9 (icon tiles), 10 (agent panel), 12 (list card), 999 (pills).
- Shadows: tooltip `0 8px 24px rgba(0,0,0,.5)`, agent panel `0 16px 40px rgba(0,0,0,.5)`.
- Icons: Lucide, 1.7–2px stroke.

## Assets
No raster images. Icons are Lucide. The orb comes from Orbkit SHDR-11 (MIT). Warehouse geometry comes from the team's WareTwin repo (`docs/layout/gen_layout.py`, `frontend/src/components/scene/*`), which already has an R3F scene, cameras and instanced racks to build on.

## Files
- `WareOrb Overview.dc.html`: prototype (template + logic + seed data)
- `jarvis-orb.js`: orb web component (reference only; use `@orbkit/shdr-11` in React)
- `support.js`: prototype runtime (do not port)
- `reference/WareOrb_Concept.md`: product brief (receiving flow, WhatsApp report and MVP priorities for the next screens)

## Suggested prompt for Claude Code
> Read `design_handoff_wareorb_overview/README.md` and open the HTML prototype. In the WareTwin repo, build the WareOrb Overview screen in React + TypeScript with shadcn/ui and React Three Fiber, matching the README exactly. Start with the data model and zustand store, then the shell/header, the inventory overview + search results list with the Jarvis dock, the R3F warehouse (zones, bays, per-type furniture meshes, orbit camera, zone zoom, Details popup), and finally the Jarvis voice session bar (`npx shadcn@latest add zzzzshawn/orbkit/shdr-11`, Web Speech API or your voice provider).
