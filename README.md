# WareOrb

Two-floor 3D furniture-stock warehouse console: searchable inventory, an isometric digital twin, a stock details popup and the Jarvis voice agent. Built from the design handoff in `docs/design-handoff.md` (product brief: `docs/concept.md`).

**Stack:** Bun (runtime, dev server, bundler) · TypeScript · React 19 · React Three Fiber + drei · zustand · Tailwind v4 + shadcn/ui · Orbkit SHDR-11 orb.

```bash
bun install
bun dev          # http://localhost:3000 with hot reload
bun run build    # static build into dist/
bun run typecheck
```

URL flags override the prototype's tweakable props: `?autoSpin=1`, `?voiceReplies=0`, `?lowStockThreshold=3`, `?showEmptyBays=0`.

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
- Jarvis matches commands with keyword rules (swap in an LLM/tooling later). It never changes stock; transfer requests are declined pending authorised confirmation.
- In dev, `__ware.getState()` in the browser console shows the app state.
