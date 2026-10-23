import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { createApp, type App } from "@/server/app";
import { readConfig } from "@/server/config";
import type { WarehouseSnapshot } from "@/shared/contracts";
import { DN, FIXED_NOW, SOFA, dnLine, sku, tempDb, totals } from "./helpers";

interface Running {
  app: App;
  server: Server<unknown>;
  base: string;
}

let stops: (() => void)[] = [];
afterEach(() => {
  stops.reverse().forEach((s) => s());
  stops = [];
});

function start(file: string, demoAuth = true): Running {
  const app = createApp({ ...readConfig({}), databasePath: file, demoAuth }, { clock: () => FIXED_NOW });
  const server = Bun.serve({ port: 0, routes: app.routes, fetch: () => new Response("not an API route", { status: 404 }) });
  const r = { app, server, base: `http://localhost:${server.port}` };
  stops.push(() => {
    server.stop(true);
    try {
      app.db.close();
    } catch {
      // closed by the test
    }
  });
  return r;
}

function seeded() {
  const t = tempDb();
  t.db.close();
  stops.push(t.cleanup);
  return t;
}

/** Minimal cookie-keeping client, like one browser. */
function client(base: string) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const json = (await res.json()) as any;
    return { status: res.status, json, headers: res.headers };
  };
  return {
    call,
    signIn: (userId: string) => call("POST", "/api/demo/session", { userId }),
    snapshot: async () => (await call("GET", "/api/warehouse")).json.data as WarehouseSnapshot,
  };
}

const POST_BODY = { expectedVersion: 2, actualGoodsChecked: true };

describe("HTTP contract", () => {
  test("health, JSON 404 for unknown API paths, 401 without a session", async () => {
    const { base } = start(seeded().file);
    const c = client(base);
    expect((await c.call("GET", "/api/health")).json.data).toMatchObject({ ready: true, databaseReady: true, seeded: true });
    const missing = await c.call("GET", "/api/does-not-exist");
    expect([missing.status, missing.json.error.code]).toEqual([404, "not_found"]);
    const anon = await c.call("GET", "/api/warehouse");
    expect([anon.status, anon.json.error.code]).toEqual([401, "unauthenticated"]);
    const bad = await c.call("POST", "/api/demo/session", { userId: "u-admin-root" });
    expect(bad.status).toBe(422);
  });

  test("snapshot over HTTP has the exact seed totals", async () => {
    const { base } = start(seeded().file);
    const c = client(base);
    await c.signIn("u-sales-priya");
    const s = await c.snapshot();
    expect(totals(s)).toEqual({ skus: 43, onHand: 527, reserved: 140, available: 387, incoming: 99, occupied: 140, bays: 144 });
    expect(s.pendingReceivings.map((r) => r.documentRef)).toEqual(["DN-2291"]);
  });

  test("a sales persona gets 403 on direct edit and post requests, whatever it claims in the body", async () => {
    const { base } = start(seeded().file);
    const c = client(base);
    await c.signIn("u-sales-priya");
    const edit = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1, lines: [dnLine()], role: "owner", actorId: "u-owner-aisha" });
    expect([edit.status, edit.json.error.code]).toEqual([403, "forbidden"]);
    const post = await c.call("POST", `/api/receivings/${DN}/post`, { expectedVersion: 1, actualGoodsChecked: true, role: "warehouse" }, { "Idempotency-Key": "sales-try-0001" });
    expect([post.status, post.json.error.code]).toEqual([403, "forbidden"]);
    expect(sku(await c.snapshot(), SOFA)).toEqual([12, 5, 7, 4]);
  });

  test("malformed bodies, missing JSON type and cross-origin mutations are refused", async () => {
    const { base } = start(seeded().file);
    const c = client(base);
    await c.signIn("u-warehouse-jun");
    const malformed = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: "one", lines: [{ quantity: -2 }] });
    expect([malformed.status, malformed.json.error.code]).toEqual([400, "bad_request"]);
    expect(Object.keys(malformed.json.error.fields)).toEqual(expect.arrayContaining(["expectedVersion", "lines.0.quantity"]));
    const notJson = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1 }, { "content-type": "text/plain" });
    expect([notJson.status, notJson.json.error.code]).toEqual([400, "bad_request"]);
    const cross = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1, lines: [dnLine()] }, { Origin: "https://evil.example" });
    expect([cross.status, cross.json.error.code]).toEqual([403, "forbidden"]);
    const site = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1, lines: [dnLine()] }, { "Sec-Fetch-Site": "cross-site" });
    expect(site.status).toBe(403);
  });

  test("warehouse persona: edit, post with key, replay, repost refused, stale edit refused", async () => {
    const { base } = start(seeded().file);
    const c = client(base);
    await c.signIn("u-warehouse-jun");
    const edited = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1, lines: [dnLine()] });
    expect([edited.status, edited.json.data.version]).toEqual([200, 2]);
    expect(sku(await c.snapshot(), SOFA)).toEqual([12, 5, 7, 4]);

    const stale = await c.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1, supplierRef: "Other" });
    expect([stale.status, stale.json.error.code, stale.json.error.currentVersion]).toEqual([409, "version_conflict", 2]);

    const noKey = await c.call("POST", `/api/receivings/${DN}/post`, POST_BODY);
    expect(noKey.status).toBe(400);

    const posted = await c.call("POST", `/api/receivings/${DN}/post`, POST_BODY, { "Idempotency-Key": "browser-post-0001" });
    expect([posted.status, posted.json.data.postedUnits, posted.json.data.replayed]).toEqual([200, 4, false]);
    const replay = await c.call("POST", `/api/receivings/${DN}/post`, POST_BODY, { "Idempotency-Key": "browser-post-0001" });
    expect([replay.status, replay.json.data.replayed, replay.headers.get("idempotent-replayed")]).toEqual([200, true, "true"]);
    expect(replay.json.data.movementIds).toEqual(posted.json.data.movementIds);
    const repost = await c.call("POST", `/api/receivings/${DN}/post`, POST_BODY, { "Idempotency-Key": "browser-post-0002" });
    expect([repost.status, repost.json.error.code]).toEqual([409, "state_conflict"]);

    const s = await c.snapshot();
    expect(sku(s, SOFA)).toEqual([16, 5, 11, 0]);
    expect(totals(s)).toMatchObject({ onHand: 531, reserved: 140, available: 391, incoming: 95, occupied: 142 });
    const history = await c.call("GET", `/api/products/${SOFA}/movements?limit=2`);
    expect(history.json.data.rows.map((r: { sourceRef: string; quantity: number }) => `${r.sourceRef}+${r.quantity}`)).toEqual(["DN-2291+2", "DN-2291+2"]);
  });

  test("concurrent HTTP posts competing for the same bay cannot overfill it", async () => {
    const { base } = start(seeded().file);
    const c = client(base);
    await c.signIn("u-warehouse-jun");
    const mk = async (doc: string, qty: number) =>
      (
        await c.call("POST", "/api/receivings", {
          supplierRef: "Race supplier",
          documentRef: doc,
          lines: [dnLine({ sku: "SOFA-HAVN-2141", quantity: qty, purchaseLineId: null, allocations: [{ locationId: "1B25", quantity: qty }] })],
        })
      ).json.data.id as string;
    const a = await mk("RACE-A", 2);
    const b = await mk("RACE-B", 2);
    const results = await Promise.all([
      c.call("POST", `/api/receivings/${a}/post`, { expectedVersion: 1, actualGoodsChecked: true }, { "Idempotency-Key": "race-a-00001" }),
      c.call("POST", `/api/receivings/${b}/post`, { expectedVersion: 1, actualGoodsChecked: true }, { "Idempotency-Key": "race-b-00001" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await c.snapshot()).locations.find((l) => l.id === "1B25")).toMatchObject({ sku: "SOFA-HAVN-2141", quantity: 2 });
  });

  test("posted result survives a server restart on the same database; a second browser sees it", async () => {
    const t = seeded();
    const first = start(t.file);
    const browserA = client(first.base);
    await browserA.signIn("u-warehouse-jun");
    await browserA.call("PATCH", `/api/receivings/${DN}`, { expectedVersion: 1, lines: [dnLine()] });
    await browserA.call("POST", `/api/receivings/${DN}/post`, POST_BODY, { "Idempotency-Key": "restart-post-0001" });

    // Restart: stop the server and close the database, then start a new process-equivalent on the same file.
    first.server.stop(true);
    first.app.db.close();
    const second = start(t.file);
    const again = client(second.base);
    expect((await again.call("GET", "/api/warehouse")).status).toBe(401); // sessions are in memory; pick a persona again
    await again.signIn("u-owner-aisha");
    const s = await again.snapshot();
    expect(sku(s, SOFA)).toEqual([16, 5, 11, 0]);
    expect(totals(s)).toMatchObject({ onHand: 531, reserved: 140, available: 391, incoming: 95, occupied: 142 });
    expect(s.pendingReceivings).toEqual([]);

    const browserB = client(second.base);
    await browserB.signIn("u-sales-priya");
    expect(sku(await browserB.snapshot(), SOFA)).toEqual([16, 5, 11, 0]);
  });
});

describe("fail-closed configuration", () => {
  test("without DEMO_AUTH no demo session is issued and data stays closed", async () => {
    const { base } = start(seeded().file, false);
    const c = client(base);
    expect((await c.call("GET", "/api/demo/personas")).status).toBe(404);
    expect((await c.signIn("u-owner-aisha")).status).toBe(404);
    expect((await c.call("GET", "/api/warehouse")).status).toBe(401);
  });

  test("an uninitialized database reports not_initialized instead of inventing stock", async () => {
    const t = tempDb({ seed: false });
    t.db.close();
    stops.push(t.cleanup);
    const { base } = start(t.file);
    const c = client(base);
    expect((await c.call("GET", "/api/health")).json.data).toMatchObject({ ready: false, seeded: false });
    await c.signIn("u-owner-aisha");
    const r = await c.call("GET", "/api/warehouse");
    expect([r.status, r.json.error.code]).toEqual([503, "not_initialized"]);
  });
});
