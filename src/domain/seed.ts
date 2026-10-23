// Deterministic synthetic ledger for the demo. Every row is labelled synthetic; dates are relative to `now`.
import { seedRows, type CategoryId, type FloorId, type ZoneId } from "../data/catalog";
import { SLOTS } from "../data/layout";
import { packagesFor, priceFor } from "./specs";
import { DAY, type Actor, type AgeingRule, type Loc, type MovementReason, type ReplenishRule, type SkuLike } from "./types";

/** Per SKU: batches as [units, age in days], seeded reservations, open PO, weekly sales rate. */
interface Plan {
  batches: [number, number][];
  reserved?: number;
  po?: number;
  weekly?: number;
  /** Sales only older than this many days (ageing stock). */
  quietDays?: number;
}

const PLAN: Record<string, Plan> = {
  // Floor 1 · Zone A — sofas. SOFA-HAVN-2140 batch A is the §8 example: 4 units, 120 days, A-1-01 + A-1-02.
  "SOFA-HAVN-2140": { batches: [[4, 120], [4, 18]], weekly: 0.6, quietDays: 45 },
  "SOFA-HAVN-2141": { batches: [[6, 35]], reserved: 2, weekly: 1 },
  "SOFA-NORDE-3300": { batches: [[8, 25]], reserved: 2, weekly: 1.2 },
  "SOFA-NORDE-3301": { batches: [[5, 12]], reserved: 2, po: 2, weekly: 2.4 },
  "SOFA-KIRA-7700": { batches: [[6, 40]], reserved: 2, weekly: 0.8 },
  "SOFA-KIRA-7701": { batches: [[4, 60]], reserved: 1, weekly: 0.5 },
  // Floor 1 · Zone B — tables
  "TABLE-LUMA-1860": { batches: [[9, 20]], reserved: 2, weekly: 2.2 },
  "TABLE-LUMA-1880": { batches: [[6, 30]], reserved: 2, po: 4, weekly: 1 },
  "TABLE-OSTA-1200": { batches: [[6, 45]], reserved: 1, weekly: 0.7 },
  "TABLE-VELA-2000": { batches: [[5, 140]], weekly: 0.4, quietDays: 50 },
  "TABLE-BRUN-2200": { batches: [[9, 25]], reserved: 1, weekly: 0.9 },
  // Floor 2 · Zone D — tables
  "TABLE-VELA-1800": { batches: [[9, 50]], reserved: 2, weekly: 0.8 },
  "TABLE-LUMA-0900": { batches: [[9, 22]], reserved: 2, weekly: 1.4 },
  "TABLE-VELA-0450": { batches: [[6, 15]], reserved: 1, po: 6, weekly: 1.6 },
  "TABLE-OSTA-1400": { batches: [[6, 70]], weekly: 0.5 },
  "TABLE-TEKO-1400": { batches: [[6, 28]], reserved: 3, weekly: 1.1 },
  // Floor 1 · Zone C — chairs
  "CHAIR-LUMA-0410": { batches: [[24, 10]], reserved: 4, weekly: 5 },
  "CHAIR-LUMA-0411": { batches: [[18, 33]], reserved: 2, po: 16, weekly: 3 },
  "CHAIR-OSTA-0420": { batches: [[12, 55]], reserved: 2, weekly: 1.5 },
  "CHAIR-BRUN-0750": { batches: [[18, 40]], reserved: 3, weekly: 2 },
  // Floor 2 · Zone C — chairs
  "CHAIR-HAVN-0880": { batches: [[12, 48]], reserved: 2, weekly: 1.2 },
  "CHAIR-TEKO-0500": { batches: [[12, 36]], reserved: 1, weekly: 1.4 },
  "CHAIR-KIRA-0910": { batches: [[6, 26]], reserved: 2, po: 6, weekly: 0.9 },
  "CHAIR-BRUN-0620": { batches: [[12, 95]], weekly: 0.7 },
  "CHAIR-NORDE-0300": { batches: [[18, 30]], reserved: 2, weekly: 2 },
  "CHAIR-TEKO-0200": { batches: [[18, 14]], po: 12, weekly: 2.5 },
  // Floor 1 · Zone D — wardrobes
  "WARD-NORDE-1200": { batches: [[8, 40]], reserved: 2, weekly: 0.9 },
  "WARD-LUMA-1800": { batches: [[6, 27]], reserved: 2, po: 3, weekly: 0.8 },
  "WARD-VELA-2000": { batches: [[4, 160]], weekly: 0.3, quietDays: 60 },
  "WARD-TEKO-2400": { batches: [[4, 65]], reserved: 1, weekly: 0.4 },
  "WARD-BRUN-0900": { batches: [[4, 31]], reserved: 1, po: 2, weekly: 0.6 },
  // Floor 2 · Zone A — beds
  "BED-LUMA-1600": { batches: [[6, 16]], reserved: 2, weekly: 1.8 },
  "BED-HAVN-1800": { batches: [[4, 42]], reserved: 1, po: 4, weekly: 0.6 },
  "BED-BRUN-0900": { batches: [[8, 58]], reserved: 1, weekly: 0.8 },
  "BED-NORDE-0902": { batches: [[4, 75]], weekly: 0.4 },
  "BED-OSTA-0800": { batches: [[4, 200]], weekly: 0.2, quietDays: 70 },
  // Floor 2 · Zone B — general stock
  "MATT-HAVN-1600": { batches: [[10, 12]], reserved: 2, weekly: 2.5 },
  "RUG-OSTA-2030": { batches: [[10, 85]], weekly: 0.5 },
  "LAMP-VELA-1500": { batches: [[10, 38]], reserved: 1, weekly: 1 },
  "HDWR-TEKO-0001": { batches: [[5, 20]], po: 20, weekly: 1.5 },
  "CUSH-HAVN-0404": { batches: [[10, 44]], reserved: 2, weekly: 1.2 },
  "BEDD-NORDE-1600": { batches: [[10, 29]], reserved: 2, weekly: 1.6 },
  "MIRR-VELA-0900": { batches: [[10, 110]], weekly: 0.4, quietDays: 40 },
};

/** Exactly 12 sales in the last 30 days for the replenishment example (§8 step 6). */
const FIXED_RECENT_SALES: Record<string, number[]> = {
  "SOFA-NORDE-3301": [2, 4, 5, 7, 9, 11, 13, 16, 18, 21, 24, 27],
};

const SEED_ACTOR: Actor = { role: "warehouse", name: "Seed" };

export interface SeedBatch {
  code: string;
  skuCode: string;
  receivedAt: number;
  qtyReceived: number;
  locations: Loc[];
}

export interface SeedMovement {
  at: number;
  skuCode: string;
  batchCode?: string;
  kind: "receive" | "dispatch";
  reason: MovementReason;
  qty: number;
  lines: Loc[];
  ref?: string;
  actor: Actor;
}

export interface SeedData {
  skus: (SkuLike & { synthetic: true })[];
  batches: SeedBatch[];
  reservations: { skuCode: string; batchCode: string; qty: number; label: string }[];
  purchaseOrders: { code: string; skuCode: string; qty: number; createdAt: number }[];
  movements: SeedMovement[];
  receipts: {
    code: string;
    supplier: string;
    docRef: string;
    note: string;
    lines: { rawText: string; skuCode: string; qty: number; confidence: number }[];
  }[];
  settings: {
    ageing: AgeingRule;
    replenish: ReplenishRule;
    lowStockThreshold: number;
    demoMode: boolean;
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(now: number): SeedData {
  const rand = mulberry32(2026);
  const at = (daysAgo: number, hour = 9 + Math.floor(rand() * 9)) => {
    const d = new Date(now - daysAgo * DAY);
    d.setHours(hour, Math.floor(rand() * 60), 0, 0);
    return Math.min(d.getTime(), now - 60_000);
  };
  const rows = seedRows();
  const skus: SeedData["skus"] = rows.map((r) => ({
    code: r.sku,
    category: r.category as CategoryId,
    model: r.model,
    variant: r.variant,
    kind: r.kind,
    cap: r.cap,
    doors: r.doors,
    color: r.color,
    homeFloor: r.floor as FloorId,
    homeZone: r.zone as ZoneId,
    packages: packagesFor(r.kind, r.doors),
    price: priceFor(r.kind),
    synthetic: true,
  }));

  const cursor = new Map<string, number>();
  const usedCodes = new Set<string>();
  const batches: SeedBatch[] = [];
  const reservations: SeedData["reservations"] = [];
  const purchaseOrders: SeedData["purchaseOrders"] = [];
  const movements: SeedMovement[] = [];
  let bookingNo = 1100;
  let poNo = 3040;

  for (const s of skus) {
    const plan = PLAN[s.code];
    if (!plan) continue;
    const slots = SLOTS[s.homeFloor][s.homeZone];
    const key = `${s.homeFloor}${s.homeZone}`;
    const mine: SeedBatch[] = [];
    plan.batches.forEach(([units, ageDays], i) => {
      let start = cursor.get(key) ?? 0;
      let left = units;
      const locations: Loc[] = [];
      while (left > 0 && start < slots.length) {
        const qty = Math.min(s.cap, left);
        locations.push({ slot: slots[start]!.id, qty });
        left -= qty;
        start++;
      }
      cursor.set(key, start);
      const tail = s.code.split("-").pop()!;
      let code = `B-${tail}-${"ABC"[i]}`;
      if (usedCodes.has(code)) code = `B-${tail}${s.code[0]}-${"ABC"[i]}`;
      usedCodes.add(code);
      const b: SeedBatch = { code, skuCode: s.code, receivedAt: now - ageDays * DAY - 3_600_000, qtyReceived: units, locations };
      mine.push(b);
      batches.push(b);
      movements.push({
        at: b.receivedAt,
        skuCode: s.code,
        batchCode: code,
        kind: "receive",
        reason: "supplier_receipt",
        qty: units,
        lines: locations,
        ref: `DN-${2100 + batches.length}`,
        actor: SEED_ACTOR,
      });
    });

    // Bookings sit on the youngest batch, so ageing batches stay unreserved.
    const youngest = mine[mine.length - 1]!;
    if (plan.reserved) reservations.push({ skuCode: s.code, batchCode: youngest.code, qty: plan.reserved, label: `Booking B-${bookingNo++}` });
    if (plan.po) purchaseOrders.push({ code: `PO-${poNo++}`, skuCode: s.code, qty: plan.po, createdAt: at(6) });

    // Confirmed sales over the last 90 days.
    const fixed = FIXED_RECENT_SALES[s.code];
    const quiet = plan.quietDays ?? 0;
    for (let d = 1; d <= 90; d++) {
      if (d < quiet) continue;
      const isFixed = fixed && d <= 30;
      const sold = isFixed ? fixed.includes(d) : rand() < (plan.weekly ?? 0) / 7;
      if (!sold) continue;
      const qty = s.category === "chairs" && rand() < 0.4 ? 2 : 1;
      movements.push({
        at: at(d),
        skuCode: s.code,
        kind: "dispatch",
        reason: "sale",
        qty: isFixed ? 1 : qty,
        lines: [],
        ref: `O-${5000 + movements.length}`,
        actor: SEED_ACTOR,
      });
    }
  }

  movements.push({
    at: at(8),
    skuCode: "CHAIR-LUMA-0410",
    kind: "receive",
    reason: "customer_return",
    qty: 1,
    lines: [],
    ref: "RT-118",
    actor: SEED_ACTOR,
  });
  movements.sort((a, b) => b.at - a.at);

  return {
    skus,
    batches,
    reservations,
    purchaseOrders,
    movements,
    receipts: [
      {
        code: "DN-2291",
        supplier: "Luma Furniture (synthetic)",
        docRef: "DN-2291",
        note: "Handwritten delivery note · 4 dining chairs, oak",
        lines: [{ rawText: "Dining chair oak × 4", skuCode: "CHAIR-LUMA-0410", qty: 4, confidence: 0.92 }],
      },
    ],
    settings: {
      ageing: { minAgeDays: 90, windowDays: 30, maxSales: 0 },
      replenish: { windowDays: 30, coverageDays: 21, budgetSen: 2_000_000 },
      lowStockThreshold: 2,
      demoMode: true,
    },
  };
}
