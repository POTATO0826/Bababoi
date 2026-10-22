# WareOrb — Illustrated Product Concept & MVP Plan

> **Domain 2 · Orbyte Smart SME Challenge**
>
> **Concept:** A voice-powered, two-floor 3D furniture-stock warehouse with human-verified stock automation and end-of-day WhatsApp reporting.

![Illustrated WareOrb warehouse overview](illustrations/wareorb-warehouse-overview.svg)

*Illustration 1 — First screen: a stock-filled warehouse digital twin. This is a concept diagram, not a working product screenshot.*

## 1. The pitch

**WareOrb helps small furniture retailers locate, verify and reconcile physical inventory through a realistic 3D warehouse, a Jarvis-style voice analyst, AI-assisted document capture and nightly reports.**

**The recurring SME problem:** Inventory is spread across warehouse floors, storage slots, customer reservations and paper documents. Staff spend time locating products, checking what is still available, reconciling discrepancies and preparing daily reports.

The central problem is maintaining a trustworthy, easy-to-understand answer to **what stock is physically present, where it is stored and how much remains available to sell**.

## 2. Visual direction — a real stock warehouse, NOT a showroom

Combine the team's two visual references:

1. **Dark isometric digital twin** — industrial warehouse racks, pathways, loading docks, cinematic lighting, operational overlays and camera controls.
2. **Organized top-down furniture arrangement** — repeatable storage rows and grouped sections, but with warehouse stock rather than showroom layouts.

### Mandatory appearance

- Two fully navigable 3D warehouse floors with a Floor 1 / Floor 2 selector.
- All furniture categories visibly populated in the overview: **sofas, dining tables, chairs, wardrobes, beds and general stock**.
- Realistic **mixed stock**: recognizable furniture alongside wrapped, palletized, packaged or stacked units.
- Storage racks, location codes, painted aisles, receiving/dispatch zones and physical boundaries.
- Some identical units may be rendered as groups with accurate quantity indicators.
- No decorative living-room settings, empty category placeholders or generic cube-only warehouse.
- The 3D layout is based on inventory records, not manually invented numbers.

### Dashboard placement

| Area | What appears |
|---|---|
| **Left sidebar** | Furniture category → model → SKU, stock count and warnings |
| **Centre (main canvas)** | Full isometric 3D stock warehouse, floor switch, camera navigation |
| **Beside 3D map** | Animated Jarvis voice orb, not a chatbot panel |
| **Product drawer** | Model, locations, on-hand, reserved, available, incoming and history |
| **Top controls** | Warehouse selection, floor switch, isometric/top-down view |

## 3. Three-level warehouse navigation

1. **Overview:** users see every furniture section on the selected floor, with category labels and aggregate counts.
2. **Section zoom:** clicking **SOFAS** animates the camera toward realistic rows/racks of different sofa models. The warehouse remains one coherent 3D environment.
3. **Model detail:** hover displays model, SKU, storage position and availability. Click highlights all matching stock locations and opens the detail panel.

A breadcrumb or Back control returns to the section or full overview. On touch devices, tap replaces hover.

![Illustrated Sofa Section drill-down](illustrations/wareorb-sofa-drilldown.svg)

*Illustration 2 — The selected Sofa Section, with realistic stored furniture, a highlighted model and a live quantity panel.*

### Essential stock quantities

| Field | Meaning | Example |
|---|---|---:|
| On hand | Physically received but not dispatched | 12 |
| Reserved | Committed to customer bookings | 5 |
| **Available** | On hand − reserved | **7** |
| Incoming | Ordered but not yet physically received | 4 |

Bookings reduce **available** stock without changing physical on-hand stock. New supplier orders count as **incoming** until verified receipt.

## 4. Jarvis — voice navigation AND stock analysis

The orb sits beside the 3D scene. It listens, speaks, animates and controls valid warehouse functions.

| Staff voice command | Agent behavior |
|---|---|
| “Take me to the grey L-shaped sofa.” | Find SKU, switch floor if needed, camera zoom, highlight item |
| “How many are left?” | Read verified on-hand, reserved and available quantities |
| “Show low-stock sofas.” | Filter and highlight affected storage positions |
| “Analyze today's changes.” | Summarize receipts, dispatches, bookings and exceptions |
| “Move five chairs to Floor 2.” | Preview transfer, then request authorized confirmation |

The system asks for clarification when several SKUs match. **AI never invents counts or changes stock silently.**

## 5. Core automated journey (Domain 2 requirement)

Demonstrate one complete supplier-receiving event:

~~~mermaid
flowchart TD
    A["Trigger: scan supplier delivery note"] --> B["AI extracts model, SKU, quantity"]
    B --> C["Connect catalogue, stock, booking and location data"]
    C --> D{"SKU valid and not duplicate?"}
    D -- No --> E["Staff resolves exception"]
    D -- Yes --> F["Human confirms physical count"]
    E --> F
    F --> G["Authorized approval"]
    G --> H["Post movement, update 3D and audit log"]
    H --> I["Include in end-of-day report"]
~~~

- **Incoming:** physical units increase only after approved receiving.
- **Outgoing:** dispatched/collected goods decrease physical stock. A payment receipt or booking alone is not a dispatch.
- **Corrections:** staff adjustments require a reason, permission and activity record.
- **Safeguards:** duplicate-document detection, SKU checks, quantity limits, uncertain-OCR handoff and logged approvals.

## 6. Daily report to WhatsApp

Stock changes are posted immediately **after verification**. At the configured end-of-day time, Jarvis analyzes the verified movement ledger and prepares an owner-friendly summary.

> **WareOrb Daily Stock Report — Example**
>
> Received today: **+24 units**  
> Dispatched today: **−16 units**  
> New reservations: **8 units**  
> Low-stock SKUs: **3**  
> Awaiting verification: **1 document**
>
> **Jarvis insight:** “Grey L-shaped sofas are near their reorder threshold. One supplier note is still pending, and those units have not been added to physical inventory.”

The hackathon MVP may show a simulated WhatsApp delivery. Real proactive sending requires an approved, configured business messaging integration.

## 7. Orbyte ecosystem compatibility

WareOrb should be a configurable warehouse module for **many SMEs**, not a custom tool tied to one shop. Separate the furniture catalogue, warehouse geometry, locations, reservations, stock ledger, staff roles and document connector interfaces.

For Domain 2, synthetic data, mock APIs and simulated login/roles are acceptable. Production Orbyte platform access is not required.

## 8. Domain 2 mandatory criteria

| Requirement | WareOrb response |
|---|---|
| One meaningful SME problem | Manual physical stock visibility, location and reconciliation |
| Automated journey | Delivery note → data check → decision → staff approval → recorded update |
| Accuracy & learning | 3D positions, Jarvis guidance, reservation logic and validation |
| People in control | Permissions, explicit approvals and movement audit trail |
| Orbyte fit & reuse | Configurable stock module and connectors for multiple retailers |
| Business impact & SDG | Less search/entry/reporting time and fewer stock-record errors |

### SDG connection

**Primary — SDG 8: Decent Work and Economic Growth**

- **8.2:** Improve productivity through technological upgrading and innovation. Measure time saved locating SKUs, processing receipts and preparing reports.
- **8.3:** Support micro/small businesses by offering reusable, easier-to-learn operations technology that does not require a bespoke enterprise warehouse system.

**Optional — SDG 12:** Only claim waste reduction if later features actually measure avoided overstocking, damage, disposal or unnecessary purchases.

## 9. MVP priorities

| Priority | Build | Live demonstration |
|---|---|---|
| P0 | Two-floor 3D warehouse with mixed stock | Floor toggle, category zones and camera navigation |
| P0 | Category → section → model | Click Sofas, zoom in, hover, open details |
| P0 | Inventory ledger with bookings | Consistent on-hand, reserved and available numbers |
| P0 | Document extraction + approval | Scan synthetic note, verify count, approve, update map and log |
| P1 | Jarvis voice orb | Locate a product, analyze a stock issue, speak result |
| P1 | Nightly summary | Calculate report and show WhatsApp preview |
| Future | Suppliers + spatial optimization | Reorder recommendations, capacity-aware placement |

**Synthetic demo set:** two floors; four or more zones per floor; 20–30 furniture models/variants; several bookings, stock movements and receiving notes. Include one duplicate or ambiguous document to demonstrate human control.

## 10. Proof of benefit

Compare manual workflows against WareOrb using:

1. Seconds to locate a named model and floor/slot.
2. Minutes and manual actions to record a supplier receipt.
3. Wrong/duplicate documents detected before stock posting.
4. Time needed to prepare an accurate daily report.
5. First-time users completing the workflow without formal training.

**Do not present untested percentages as facts.** Interview furniture shop staff and record results before making improvement claims.

---

## A short pitch for judges

“Furniture SMEs need to know exactly what is in stock, where it is stored and what is already booked. WareOrb turns this into a realistic two-floor 3D warehouse that workers can navigate by voice. AI extracts stock movements from physical documents, employees verify important changes, and the approved updates appear immediately in the warehouse and activity log. An end-of-day WhatsApp report keeps managers informed. By reducing repetitive inventory work and making digital operations easier to learn, WareOrb supports **SDG 8.2** and **8.3**.”

**Design principle:** 3D visualizes real inventory; the stock ledger is the source of truth; AI assists; humans authorize consequential changes.
