import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Money in integer sen, sizes in cm, weights in kg, times in UTC ms. Seeded rows carry `synthetic: true`.

const KINDS = [
  "sofa", "sofaL", "recliner", "table", "tableRound", "coffee", "side", "console", "desk", "glass",
  "chair", "stool", "armchair", "office", "lounge", "rocking", "kids", "wardrobe", "cabinet",
  "bed", "bedSingle", "bunk", "daybed", "mattress", "rug", "lamp", "carton", "mirror",
] as const;
export const furnitureKind = v.union(...KINDS.map((k) => v.literal(k)));

export const role = v.union(v.literal("owner"), v.literal("sales"), v.literal("warehouse"));
export const actor = v.object({ role, name: v.string(), staffId: v.optional(v.string()) });
export const loc = v.object({ slot: v.string(), qty: v.number() });
export const pkg = v.object({ lCm: v.number(), wCm: v.number(), hCm: v.number(), kg: v.number() });
export const extraStatus = v.union(v.literal("included"), v.literal("excluded"), v.literal("unknown"));
export const quoteSource = v.union(v.literal("lalamove_sandbox"), v.literal("manual"), v.literal("demo_fallback"));
export const dealStatus = v.union(
  v.literal("finding_buyer"),
  v.literal("offer_ready"),
  v.literal("pending_approval"),
  v.literal("approved"),
  v.literal("collected"),
  v.literal("rejected"),
  v.literal("closed"),
);
export const movementReason = v.union(
  v.literal("supplier_receipt"),
  v.literal("sale"),
  v.literal("customer_return"),
  v.literal("transfer"),
  v.literal("count_correction"),
);
export const receiptLine = v.object({
  key: v.string(),
  rawText: v.string(),
  skuCode: v.union(v.string(), v.null()),
  candidates: v.array(v.string()),
  qty: v.union(v.number(), v.null()),
  purchaseOrderId: v.optional(v.id("purchaseOrders")),
  locations: v.optional(v.array(loc)),
  condition: v.string(),
  confidence: v.number(),
  questions: v.array(v.string()),
  verified: v.boolean(),
  source: v.union(v.literal("ai"), v.literal("staff"), v.literal("seed")),
  // Stated measurements (src/domain/measure.ts); null means unknown, never an estimate.
  unit: v.optional(v.union(v.string(), v.null())),
  packageCount: v.optional(v.union(v.number(), v.null())),
  packageDimsCm: v.optional(v.union(v.object({ lCm: v.union(v.number(), v.null()), wCm: v.union(v.number(), v.null()), hCm: v.union(v.number(), v.null()) }), v.null())),
  itemWeightKg: v.optional(v.union(v.number(), v.null())),
  packageWeightKg: v.optional(v.union(v.number(), v.null())),
  statedTotalWeightKg: v.optional(v.union(v.number(), v.null())),
});

export default defineSchema({
  staff: defineTable({
    email: v.string(),
    name: v.string(),
    role,
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("inactive")),
    tokenIdentifier: v.optional(v.string()),
    invitedAt: v.number(),
    activatedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_role_and_status", ["role", "status"]),
  skus: defineTable({
    code: v.string(),
    category: v.union(
      v.literal("sofas"),
      v.literal("tables"),
      v.literal("chairs"),
      v.literal("wardrobes"),
      v.literal("beds"),
      v.literal("general"),
    ),
    model: v.string(),
    variant: v.string(),
    kind: furnitureKind,
    cap: v.number(),
    doors: v.number(),
    color: v.string(),
    homeFloor: v.union(v.literal(1), v.literal(2)),
    homeZone: v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
    packages: v.array(pkg),
    price: v.object({ listSen: v.number(), clearanceSen: v.number(), unitCostSen: v.number() }),
    addedAt: v.optional(v.number()),
    icon: v.optional(v.string()),
    iconStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"), v.literal("unavailable"))),
    synthetic: v.boolean(),
  }).index("by_code", ["code"]),

  batches: defineTable({
    code: v.string(),
    skuCode: v.string(),
    receivedAt: v.number(),
    qtyReceived: v.number(),
    locations: v.array(loc),
    status: v.union(v.literal("active"), v.literal("depleted")),
    receiptId: v.optional(v.id("receipts")),
    synthetic: v.boolean(),
  })
    .index("by_status", ["status"])
    .index("by_skuCode", ["skuCode"]),

  reservations: defineTable({
    skuCode: v.string(),
    batchId: v.id("batches"),
    qty: v.number(),
    pick: v.array(loc),
    status: v.union(v.literal("active"), v.literal("consumed"), v.literal("released")),
    dealId: v.optional(v.id("deals")),
    label: v.string(),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_batchId_and_status", ["batchId", "status"])
    .index("by_dealId", ["dealId"]),

  purchaseOrders: defineTable({
    code: v.string(),
    skuCode: v.string(),
    qty: v.number(),
    qtyReceived: v.number(),
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")),
    rationale: v.optional(v.string()),
    supplier: v.optional(v.string()),
    orderRef: v.optional(v.string()),
    orderKey: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    unitCostSen: v.optional(v.number()),
    createdBy: actor,
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_orderKey", ["orderKey"])
    .index("by_skuCode_and_status", ["skuCode", "status"]),

  movements: defineTable({
    at: v.number(),
    skuCode: v.string(),
    batchId: v.optional(v.id("batches")),
    kind: v.union(v.literal("receive"), v.literal("dispatch")),
    reason: movementReason,
    qty: v.number(),
    lines: v.array(loc),
    ref: v.optional(v.string()),
    actor,
    synthetic: v.boolean(),
  }).index("by_at", ["at"]),

  audit: defineTable({
    at: v.number(),
    actor,
    action: v.string(),
    entity: v.string(),
    summary: v.string(),
    reason: v.optional(v.string()),
  }).index("by_entity_and_at", ["entity", "at"]),

  receipts: defineTable({
    code: v.string(),
    version: v.optional(v.number()),
    postedVersion: v.optional(v.number()),
    status: v.union(v.literal("needs_review"), v.literal("posted"), v.literal("rejected")),
    supplier: v.optional(v.string()),
    docRef: v.optional(v.string()),
    docKey: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
    evidence: v.array(
      v.object({
        kind: v.union(v.literal("photo"), v.literal("document"), v.literal("voice"), v.literal("note")),
        storageId: v.optional(v.id("_storage")),
        text: v.optional(v.string()),
        mime: v.optional(v.string()),
        at: v.number(),
      }),
    ),
    lines: v.array(receiptLine),
    extraction: v.object({
      status: v.union(v.literal("idle"), v.literal("running"), v.literal("done"), v.literal("error")),
      error: v.optional(v.string()),
      at: v.optional(v.number()),
      jobVersion: v.optional(v.number()),
      requestedBy: v.optional(actor),
    }),
    createdBy: actor,
    createdAt: v.number(),
    postedBy: v.optional(actor),
    postedAt: v.optional(v.number()),
    rejectReason: v.optional(v.string()),
    synthetic: v.boolean(),
  }).index("by_status", ["status"]).index("by_docKey", ["docKey"]),

  deals: defineTable({
    code: v.string(),
    batchId: v.id("batches"),
    skuCode: v.string(),
    assignee: v.string(),
    status: dealStatus,
    brief: v.object({ ageDays: v.number(), qty: v.number(), bays: v.array(v.string()), guideSen: v.number() }),
    buyer: v.optional(v.object({ name: v.string(), phone: v.optional(v.string()) })),
    qty: v.number(),
    priceSen: v.number(),
    destination: v.optional(
      v.object({
        label: v.string(),
        address: v.string(),
        lat: v.number(),
        lng: v.number(),
        confirmedBy: v.optional(v.string()),
      }),
    ),
    access: v.object({ floor: v.number(), lift: v.boolean() }),
    collectAt: v.optional(v.number()),
    unloading: v.union(v.literal("requested"), v.literal("not_needed")),
    freightPayer: v.union(v.literal("merchant"), v.literal("buyer")),
    packingSen: v.number(),
    fitConfirmedBy: v.optional(v.string()),
    version: v.number(),
    stateVersion: v.optional(v.number()),
    proposal: v.optional(
      v.object({
        version: v.number(),
        quoteId: v.id("quotes"),
        submittedBy: actor,
        submittedAt: v.number(),
      }),
    ),
    decision: v.optional(
      v.object({
        approved: v.boolean(),
        quoteId: v.optional(v.id("quotes")),
        netSen: v.optional(v.union(v.number(), v.null())),
        by: actor,
        at: v.number(),
        reason: v.optional(v.string()),
        deliverySen: v.optional(v.number()),
        quoteReference: v.optional(v.string()),
        terms: v.optional(v.string()),
      }),
    ),
    booking: v.optional(v.object({ ref: v.string(), carrier: v.string(), simulated: v.boolean(), recordedBy: v.optional(actor), recordedAt: v.optional(v.number()) })),
    reservationId: v.optional(v.id("reservations")),
    collectedAt: v.optional(v.number()),
    collectedQty: v.optional(v.number()),
    createdBy: actor,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_batchId_and_status", ["batchId", "status"])
    .index("by_batchId", ["batchId"]),

  collections: defineTable({
    dealId: v.id("deals"),
    requestId: v.string(),
    payload: v.string(),
    qty: v.number(),
    at: v.number(),
    lines: v.array(loc),
    actor,
  }).index("by_dealId_and_requestId", ["dealId", "requestId"]),

  quotes: defineTable({
    dealId: v.id("deals"),
    dealVersion: v.number(),
    source: quoteSource,
    carrier: v.string(),
    service: v.string(),
    status: v.union(v.literal("pending"), v.literal("ok"), v.literal("error")),
    dedupeKey: v.string(),
    requestedAt: v.number(),
    quotationId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    currency: v.optional(v.string()),
    totalSen: v.optional(v.number()),
    breakdownRaw: v.optional(v.string()),
    unloading: extraStatus,
    unloadingSen: v.optional(v.number()),
    note: v.optional(v.string()),
    error: v.optional(v.object({ kind: v.string(), message: v.string(), retryAfterMs: v.optional(v.number()) })),
    enteredBy: v.optional(actor),
    reference: v.optional(v.string()),
    terms: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    requestedBy: v.optional(actor),
  })
    .index("by_dealId", ["dealId"])
    .index("by_dedupeKey", ["dedupeKey"]),

  settings: defineTable({
    key: v.string(),
    ageing: v.object({ minAgeDays: v.number(), windowDays: v.number(), maxSales: v.number() }),
    replenish: v.object({ windowDays: v.number(), coverageDays: v.number(), budgetSen: v.number() }),
    lowStockThreshold: v.number(),
    demoMode: v.boolean(),
    seededAt: v.number(),
  }).index("by_key", ["key"]),

  kv: defineTable({ key: v.string(), value: v.string(), updatedAt: v.number() }).index("by_key", ["key"]),
});
