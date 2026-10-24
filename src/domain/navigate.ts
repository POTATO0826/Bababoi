// "Take me there": turn a question into a place on screen (stage, floor, zone, bays to highlight).
// Shared by Jarvis's show_in_warehouse tool and the browser's offline matcher. Reads only; never changes data.
import type { CategoryId, FloorId, ZoneId } from "../data/catalog";
import { SLOT_BY_ID, SLOTS } from "../data/layout";
import { flagBatches } from "./ageing";
import { historyStart } from "./replenish";
import { freeSlotSet, planPlacement } from "./stock";
import type { AgeingRule, BatchLike, MovementLike, ReservationLike, SkuLike } from "./types";

export const NAV_STAGES = ["inventory", "receive", "ageing", "deals", "delivery", "approve", "collect", "replenish"] as const;
export type NavStage = (typeof NAV_STAGES)[number];
export type NavPurpose = "locate" | "place" | "ageing";

/** What to show. Every field is optional; the target is worked out from whatever is given. */
export interface NavRequest {
  stage?: NavStage;
  /** Exact SKU code. */
  sku?: string;
  /** Model, variant, colour or category words when no single SKU is meant ("mirrors"). */
  search?: string;
  category?: CategoryId;
  /** "A", "1A", "F2 B" or "Floor 2 Zone B". */
  zone?: string;
  floor?: FloorId;
  /** Bay ids ("1A002") or bay codes ("A-1-03"). */
  bays?: string[];
  /** locate (default): where it is. place: free bays for new stock. ageing: its ageing batches. */
  purpose?: NavPurpose;
  /** Units to place (purpose "place"). Defaults to one bay's worth. */
  qty?: number;
}

export interface NavTarget {
  stage?: NavStage;
  floor: FloorId | null;
  zone: ZoneId | null;
  /** Bay ids to highlight. */
  slots: string[];
  sku?: string;
  /** Short chip text, e.g. "Floor 1 · Zone A · 3 free bays". */
  label: string;
}

export interface NavLedger {
  skus: readonly SkuLike[];
  batches: readonly BatchLike[];
  reservations: readonly ReservationLike[];
  movements: readonly MovementLike[];
  settings: { ageing: AgeingRule; demoMode: boolean; seededAt: number };
}

const CATEGORY_NAME: Record<CategoryId, string> = { sofas: "sofa", tables: "table", chairs: "chair", wardrobes: "wardrobe", beds: "bed", general: "item" };

// ── Words ─────────────────────────────────────────────────────────────────

/** Lower-case words, singular ("chairs" → "chair"), so the query and the catalogue compare alike. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9一-鿿]+/)
    .filter((w) => w.length > 2)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Places on the map, never product words: "floor 2" is a place, but "floor lamp" is a Floor Lamp. */
const PLACES = /\b(?:floor|level|f)\s*[12]\b|\bzone\s*[a-d]\b|\bbays?\b/gi;

const skuWords = (s: Pick<SkuLike, "code" | "model" | "variant">) => new Set(words(`${s.code} ${s.model} ${s.variant}`));

/** Catalogue items the text names, best match first (ties all kept). Empty when nothing matches. */
export function matchSkus<T extends Pick<SkuLike, "code" | "model" | "variant">>(skus: readonly T[], text: string): T[] {
  const q = new Set(words(text.replace(PLACES, " ")));
  const code = text.toUpperCase().match(/\b[A-Z]{3,6}-[A-Z]{3,6}-\d{4}\b/)?.[0];
  const exact = code ? skus.find((s) => s.code === code) : undefined;
  if (exact) return [exact];
  const scored = skus.map((s) => ({ s, n: [...skuWords(s)].filter((w) => q.has(w)).length })).filter((r) => r.n > 0);
  const best = Math.max(0, ...scored.map((r) => r.n));
  return scored.filter((r) => r.n === best).map((r) => r.s);
}

const CATEGORY_WORDS: [RegExp, CategoryId][] = [
  [/sofa|couch|沙发/, "sofas"],
  [/table|desk|桌/, "tables"],
  [/chair|stool|椅/, "chairs"],
  [/wardrobe|cabinet|衣柜|柜/, "wardrobes"],
  [/\bbeds?\b|床/, "beds"],
];

/** Stage words, most specific first ("delivery note" is receiving, "delivery" alone is quotes). */
export const STAGE_WORDS: [RegExp, Exclude<NavStage, "inventory">][] = [
  [/delivery notes?|receiv|入库|收货/, "receive"],
  [/quote|lalamove|deliver|运费|报价|送货/, "delivery"],
  [/approv|审核|批准/, "approve"],
  [/collect|pick ?up|出货|发货|提货/, "collect"],
  [/\bag(e|ed|eing|ing)\b|old stock|unsold|slow.moving|旧货|清货|卖不出/, "ageing"],
  [/reorder|replenish|restock|purchase|进货|补货/, "replenish"],
  [/\bdeals?\b|buyer|\boffers?\b|买家/, "deals"],
];

const PLACE = /\b(put|place|store|stock|fit|space|room|park|slot)\b|where (can|should|do|would) (i|we)|放|存放|空位/;
/** Questions the browser answers itself with numbers; navigating there would only move the camera away. */
const NOT_NAVIGATION = /low stock|running out|today|report|summary|analy|缺货|今天|\b(move|transfer|relocate)\b/;

/**
 * Offline intent matcher: what a question asks to see, or null when it doesn't point anywhere.
 * Needs no AI model. `skus` is the live catalogue.
 */
export function matchNavigation(text: string, skus: readonly Pick<SkuLike, "code" | "model" | "variant" | "category">[]): NavRequest | null {
  const q = text.toLowerCase().trim();
  if (!q || q.startsWith("/") || NOT_NAVIGATION.test(q)) return null;
  const req: NavRequest = {};
  const stage = STAGE_WORDS.find(([re]) => re.test(q))?.[1];
  const place = PLACE.test(q);
  if (stage && !(place && stage === "receive")) req.stage = stage;

  const zone = q.match(/\bzone\s*([a-d])\b/)?.[1];
  const floor = q.match(/\b(?:floor|level|f)\s*([12])\b/)?.[1];
  if (zone) req.zone = zone.toUpperCase();
  if (floor) req.floor = Number(floor) as FloorId;
  const bay = q.match(/\b([a-d]-[1-3]-0?[1-6])\b/)?.[1];
  if (bay) req.bays = [bay.toUpperCase()];

  const hits = matchSkus(skus, q);
  const category = CATEGORY_WORDS.find(([re]) => re.test(q))?.[1];
  if (hits.length === 1 && (!category || hits[0]!.category === category)) req.sku = hits[0]!.code;
  else if (category) req.category = category;
  else if (hits.length) req.search = q;

  if (place && (req.sku || req.category)) req.purpose = "place";
  else if (req.stage === "ageing" && (req.sku || req.category || req.search)) req.purpose = "ageing";
  // A count, once floor numbers, SKU codes and bay codes are taken out ("4 oatmeal sofas").
  const qty = q.replace(/\b(?:floor|level|f)\s*[12]\b|\b[a-z]{3,6}-[a-z]{3,6}-\d{4}\b|\b[a-d]-\d-\d+\b/g, " ").match(/\b(\d{1,3})\b/)?.[1];
  if (req.purpose === "place" && qty) req.qty = Number(qty);

  return req.stage || req.sku || req.category || req.search || req.zone || req.floor || req.bays ? req : null;
}

// ── Target ────────────────────────────────────────────────────────────────

function parseZone(z: string | undefined, floor: FloorId | undefined): { floor: FloorId; zone: ZoneId } | null {
  const m = z?.toUpperCase().match(/^(?:F(?:LOOR)?\s*)?([12])?\s*(?:·|-|,)?\s*(?:ZONE\s*)?([A-D])$/);
  if (!m) return null;
  return { floor: (m[1] ? Number(m[1]) : (floor ?? 1)) as FloorId, zone: m[2] as ZoneId };
}

function resolveBay(id: string, floor: FloorId | undefined): string | null {
  if (SLOT_BY_ID.has(id)) return id;
  const code = id.toUpperCase().replace(/^([A-D])-(\d)-(\d)$/, "$1-$2-0$3");
  for (const f of floor ? [floor] : ([1, 2] as FloorId[])) {
    const zone = code[0] as ZoneId;
    const hit = SLOTS[f]?.[zone]?.find((s) => s.code === code);
    if (hit) return hit.id;
  }
  return null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const where = (floor: FloorId | null, zone: ZoneId | null) => [floor && `Floor ${floor}`, zone && `Zone ${zone}`].filter(Boolean).join(" · ");
const label = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** Bays held by active stock of these SKUs, in bay order. */
function baysOf(ledger: NavLedger, codes: ReadonlySet<string>): string[] {
  const ids = ledger.batches.filter((b) => b.status === "active" && codes.has(b.skuCode)).flatMap((b) => b.locations.filter((l) => l.qty > 0).map((l) => l.slot));
  return [...new Set(ids)].sort();
}

/** Where on screen a request points. Pure: the same ledger and request always give the same target. */
export function navigationTarget(ledger: NavLedger, req: NavRequest, now: number): NavTarget | { error: string } {
  const stage = req.stage && (NAV_STAGES as readonly string[]).includes(req.stage) ? req.stage : undefined;
  const sku = req.sku ? ledger.skus.find((s) => s.code.toUpperCase() === req.sku!.trim().toUpperCase()) : undefined;
  if (req.sku && !sku) return { error: `No item ${req.sku} in the catalogue.` };
  const named = sku ? [sku] : req.search ? matchSkus(ledger.skus, req.search) : [];
  const category = req.category ?? sku?.category;
  const inCategory = category ? ledger.skus.filter((s) => s.category === category) : [];
  const items = named.length ? named : inCategory;
  const what = sku ? `${sku.model} · ${sku.variant}` : named.length === 1 ? `${named[0]!.model} · ${named[0]!.variant}` : category ? `${CATEGORY_NAME[category]}s` : "items";
  const purpose: NavPurpose = req.purpose ?? (stage === "ageing" && items.length ? "ageing" : "locate");

  // New stock: the same placement rule receiving uses (its zones, then home zone, then anywhere).
  if (purpose === "place") {
    const template = sku ?? inCategory[0] ?? named[0];
    if (!template) return { error: "Say which item or category needs space." };
    const units = Math.max(1, Math.round(req.qty ?? template.cap));
    const probe: SkuLike = sku ? template : { ...template, code: "__new__" };
    const plan = planPlacement(probe, units, ledger.batches);
    if (!plan) return { error: `No room for ${units} ${units === 1 ? "unit" : "units"} of ${what}: not enough free bays.` };
    const first = SLOT_BY_ID.get(plan[0]!.slot)!;
    const free = freeSlotSet(ledger.batches);
    // A set quantity shows exactly the planned bays; otherwise every free bay in the chosen zone.
    const slots = req.qty ? plan.map((p) => p.slot) : SLOTS[first.floor][first.zone].filter((s) => free.has(s.id)).map((s) => s.id);
    return {
      ...(stage ? { stage } : {}),
      floor: first.floor,
      zone: first.zone,
      slots,
      ...(sku ? { sku: sku.code } : {}),
      label: label(where(first.floor, first.zone), plural(slots.length, "free bay"), !!req.qty && `fits ${units}`),
    };
  }

  if (purpose === "ageing") {
    const codes = new Set(items.map((s) => s.code));
    const flags = flagBatches({
      batches: ledger.batches,
      reservations: ledger.reservations,
      movements: ledger.movements,
      rule: ledger.settings.ageing,
      now,
      historyFrom: historyStart(ledger),
    }).filter((f) => f.flagged && (!codes.size || codes.has(f.batch.skuCode)));
    const slots = [...new Set(flags.flatMap((f) => f.batch.locations.map((l) => l.slot)))];
    const at = SLOT_BY_ID.get(slots[0] ?? "");
    const floorOf = (f: (typeof flags)[number]) => SLOT_BY_ID.get(f.batch.locations[0]?.slot ?? "")?.floor;
    const here = flags.filter((f) => floorOf(f) === at?.floor).length;
    const elsewhere = flags.length - here;
    return {
      stage: stage ?? "ageing",
      floor: at?.floor ?? null,
      zone: at?.zone ?? null,
      slots,
      ...(sku ? { sku: sku.code } : {}),
      label: flags.length
        ? label(where(at?.floor ?? null, at?.zone ?? null), plural(here, "ageing batch", "ageing batches"), elsewhere > 0 && `${elsewhere} more on Floor ${at?.floor === 1 ? 2 : 1}`)
        : `No ageing ${what}`,
    };
  }

  // Locate: explicit bays, then the named items' bays, then a zone or floor.
  const explicitZone = parseZone(req.zone, req.floor);
  const bays = (req.bays ?? []).map((b) => resolveBay(b, explicitZone?.floor ?? req.floor)).filter((b): b is string => !!b);
  if (req.bays?.length && !bays.length) return { error: `No bay ${req.bays.join(", ")}.` };
  const slots = bays.length ? bays : items.length ? baysOf(ledger, new Set(items.map((s) => s.code))) : [];
  const at = SLOT_BY_ID.get(slots[0] ?? "");
  const home = items[0];
  const floor = explicitZone?.floor ?? at?.floor ?? req.floor ?? (items.length ? home!.homeFloor : null);
  const zone = explicitZone?.zone ?? at?.zone ?? (items.length ? home!.homeZone : null);
  // Bays on another floor can't be seen from here; keep the ones on the floor we fly to.
  const visible = floor ? slots.filter((s) => SLOT_BY_ID.get(s)?.floor === floor) : slots;
  if (!stage && !floor && !zone) return { error: "Nothing to show for that." };
  return {
    ...(stage ? { stage } : {}),
    floor,
    zone,
    slots: visible,
    ...(sku ? { sku: sku.code } : {}),
    label: label(
      where(floor, zone),
      bays.length ? plural(visible.length, "bay") : items.length ? (visible.length ? `${what} · ${plural(visible.length, "bay")}` : `no ${what} in stock`) : null,
    ) || (stage ? stage[0]!.toUpperCase() + stage.slice(1) : ""),
  };
}
