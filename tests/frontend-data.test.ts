import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildInventory, locationText, spokenLocations, zoneLabel, zonesText } from "@/lib/inventory";
import { postReceiving, updateReceiving } from "@/server/services/receiving";
import { placementsFor, pendingRect } from "@/scene/furniture/placements";
import { DN, SOFA, context, dnLine, snapshot, tempDb, warehouse } from "./helpers";

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

const SRC = path.join(import.meta.dir, "..", "src");

/** Every module reachable from the browser entry point. */
function browserModules(): string[] {
  const transpiler = new Bun.Transpiler({ loader: "tsx" });
  const seen = new Set<string>();
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null; // package
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const f = base + ext;
      try {
        if (readFileSync(f) && /\.(ts|tsx)$/.test(f)) return f;
      } catch {
        // try next
      }
    }
    return null;
  };
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const imp of transpiler.scanImports(readFileSync(file, "utf8"))) {
      const next = resolve(file, imp.path);
      if (next) visit(next);
    }
  };
  visit(path.join(SRC, "frontend.tsx"));
  return [...seen].map((f) => path.relative(SRC, f));
}

describe("browser bundle boundary", () => {
  test("no browser module imports the seed catalogue, server code or SQLite", () => {
    const mods = browserModules();
    expect(mods).toContain("scene/furniture/placements.ts");
    expect(mods).toContain("components/receiving/receiving-drawer.tsx");
    expect(mods.filter((m) => m === "data/catalog.ts" || m.startsWith("server/"))).toEqual([]);
    for (const m of mods) expect(readFileSync(path.join(SRC, m), "utf8")).not.toContain("bun:sqlite");
  });
});

describe("scene and label derivation from the persisted snapshot", () => {
  test("posting DN-2291 adds sofas at 1B23/1B24, removes the dock units and keeps every other placement fixed", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const ctx = context(t.db);
    const before = buildInventory(snapshot(t.db));
    const p1 = placementsFor(1, before);
    expect(p1.filter((p) => p.owner === "pending")).toHaveLength(4);
    expect(pendingRect(before.pendingUnits)).not.toBeNull();
    expect(p1.some((p) => p.owner === "1B23" || p.owner === "1B24")).toBe(false);
    expect(zoneLabel(before, 1, "B")).toBe("Tables");

    updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine()] });
    postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-scene-0001");
    const after = buildInventory(snapshot(t.db));
    expect(after.revision).toBeGreaterThan(before.revision);
    const a1 = placementsFor(1, after);

    expect(a1.filter((p) => p.owner === "pending")).toHaveLength(0);
    expect(pendingRect(after.pendingUnits)).toBeNull();
    const sofaL = a1.filter((p) => p.owner === "1B23" || p.owner === "1B24");
    expect(sofaL.map((p) => `${p.owner}:${p.tpl}`)).toEqual(["1B23:sofaL", "1B23:sofaL", "1B24:sofaL", "1B24:sofaL"]);
    // Every pre-existing unit keeps its exact transform.
    const key = (p: (typeof a1)[number]) => JSON.stringify(p);
    expect(a1.filter((p) => !["1B23", "1B24"].includes(p.owner)).map(key)).toEqual(p1.filter((p) => p.owner !== "pending").map(key));
    expect(placementsFor(2, after).map(key)).toEqual(placementsFor(2, before).map(key));

    // Labels reflect actual, multi-zone positions.
    expect(zoneLabel(after, 1, "B")).toBe("Tables + Sofas");
    const sofa = after.bySku.get(SOFA)!;
    expect(locationText(sofa)).toBe("F1 · A-1-01–A-1-06, B-3-04–B-3-05");
    expect(spokenLocations(sofa)).toBe("Floor 1, bays A-1-01 to A-1-06 and B-3-04 to B-3-05");
    expect(zonesText(sofa)).toBe("Floor 1 · Zones A, B");
    expect(after.floorTotals[1]).toMatchObject({ units: 245, occupied: 71, bays: 72 });
    expect(after.totals).toMatchObject({ onHand: 531, reserved: 140, available: 391, incoming: 95 });
  });

  test("a snapshot from a different geometry version is refused rather than drawn", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const s = snapshot(t.db);
    expect(() => buildInventory({ ...s, warehouse: { ...s.warehouse, geometryVersion: "other" } })).toThrow(/geometry/);
  });
});
