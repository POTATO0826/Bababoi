// Regressions found while preparing the live demo (full browser app on a local database).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VIEWPORT_PANEL, wheelZoomsMap } from "../interaction";
import { buildSeed } from "../domain/seed";
import { DEFAULT_LOW_STOCK_THRESHOLD, readSettings } from "../store";

const source = (file: string) => readFileSync(join(import.meta.dir, "..", file), "utf8");

describe("wheel over the 3D view", () => {
  // The map's native wheel listener used to preventDefault every wheel event, so detail popups could not scroll.
  const inside = (selector: string | null) => ({ closest: (s: string) => (selector && s === selector ? {} : null) });
  test("zooms the map, but leaves popups on the map to scroll", () => {
    expect(wheelZoomsMap(inside(null) as unknown as EventTarget)).toBe(true);
    expect(wheelZoomsMap(inside(`[${VIEWPORT_PANEL}]`) as unknown as EventTarget)).toBe(false);
    expect(wheelZoomsMap(null)).toBe(true);
  });
  test("both popups on the map are marked as scrollable panels", () => {
    expect(source("components/detail/detail-host.tsx")).toContain(`${VIEWPORT_PANEL}=""`);
    expect(source("components/viewport/details-panel.tsx")).toContain(`${VIEWPORT_PANEL}=""`);
  });
});

describe("Delivery: Start sale from stock", () => {
  // The form was rendered twice in Delivery, and a form opened in Deals carried over into Delivery.
  test("renders the new-sale form in one place, with fresh state per view", () => {
    expect(source("components/stages/deals-list.tsx").match(/<NewSale\b/g)).toHaveLength(1);
    expect(source("components/stages/stage-column.tsx")).toMatch(/<DealsList key=\{stage\}/);
  });
});

describe("low-stock threshold", () => {
  test("has one source: the business setting, not a page flag", () => {
    expect(readSettings(new URLSearchParams("lowStockThreshold=6")).lowStockThreshold).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(buildSeed(Date.now()).settings.lowStockThreshold);
    expect(source("components/ledger-sync.tsx")).toContain("lowStockThreshold: snap.settings.lowStockThreshold");
  });
});

describe("connection badges", () => {
  // The Lalamove card fetched its status once, so a connection made in another tab (or lost on a server
  // restart) showed the wrong state while the deal panel already used the server's connection.
  test("re-check Jarvis and Lalamove status on focus, visibility and a short interval", () => {
    const app = source("App.tsx");
    expect(app).toContain("useLiveConnectionStatus();");
    expect(app).toMatch(/addEventListener\("focus", refresh\)/);
    expect(app).toMatch(/addEventListener\("visibilitychange", refresh\)/);
    expect(app).toMatch(/void refreshLocalAgent\(\);\s*void refreshLalamove\(\);/);
  });
});
