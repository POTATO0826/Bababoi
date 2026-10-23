// Same-origin JSON API under /api. Runtime validation + session/role checks → services → SQLite.
import type { BunRequest } from "bun";
import { DEMO_USERS, can, type Permission } from "@/server/auth/users";
import { SessionStore, clearSessionCookie, isHttps, readSessionToken, sessionCookie } from "@/server/auth/sessions";
import type { ServerConfig } from "@/server/config";
import { migrate, openDatabase, schemaVersion, seedState, type Db } from "@/server/db/database";
import { WAREHOUSE_ID } from "@/server/db/seed";
import { AppError, type FaultPoint, type ServiceContext } from "@/server/services/context";
import { cancelReceiving, createReceiving, getReceiving, listReceivings, postReceiving, updateReceiving } from "@/server/services/receiving";
import { getDailyActivity, getMovements, getProductDetail, getWarehouseSnapshot } from "@/server/services/warehouse";
import { IDEMPOTENCY_HEADER, type ApiErrorBody, type ReceivingStatus, type SessionInfo, type SessionUser } from "@/shared/contracts";
import { Problems, isIsoDate, isObject, parseCancelReceiving, parseCreateReceiving, parsePostReceiving, parseUpdateReceiving } from "@/shared/validate";

export interface App {
  db: Db;
  services: ServiceContext;
  config: ServerConfig;
  sessions: SessionStore;
  routes: Record<string, (req: BunRequest) => Response | Promise<Response>>;
}

export interface AppOptions {
  clock?: () => Date;
  faults?: (point: FaultPoint) => void;
  db?: Db;
}

/** Opens the database and applies pending schema migrations. Never seeds or resets stock. */
export function createApp(config: ServerConfig, opts: AppOptions = {}): App {
  const db = opts.db ?? openDatabase(config.databasePath);
  migrate(db);
  const services: ServiceContext = { db, clock: opts.clock ?? (() => new Date()), warehouseId: WAREHOUSE_ID, faults: opts.faults };
  const sessions = new SessionStore();
  const app: App = { db, services, config, sessions, routes: {} };
  app.routes = createApiRoutes(app);
  return app;
}

// ── Response helpers ──────────────────────────────────────────────────────

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    const body: ApiErrorBody = { error: { code: e.code, message: e.message, ...e.extra } };
    return json(body, e.status);
  }
  const code = (e as { code?: unknown })?.code;
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") {
    return json({ error: { code: "unavailable", message: "The database is busy. Try again." } } satisfies ApiErrorBody, 503);
  }
  console.error("[api] unexpected error", e);
  return json({ error: { code: "internal", message: "Unexpected server error." } } satisfies ApiErrorBody, 500);
}

const fail = (code: ConstructorParameters<typeof AppError>[0], message: string, extra?: ConstructorParameters<typeof AppError>[2]) => {
  throw new AppError(code, message, extra);
};

const MAX_BODY = 256 * 1024;

async function readJson(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) fail("bad_request", "Send a JSON body with Content-Type: application/json.");
  const text = await req.text();
  if (text.length > MAX_BODY) fail("bad_request", "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    return fail("bad_request", "Request body is not valid JSON.");
  }
}

function validated<T>(parse: (body: unknown, p: Problems) => T, body: unknown): T {
  const p = new Problems();
  const value = parse(body, p);
  if (!p.ok) fail("bad_request", "Some fields are malformed.", { fields: p.fields });
  return value;
}

/** Mutations must come from this origin (CSRF defence alongside the SameSite=Strict cookie). */
function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host !== req.headers.get("host")) fail("forbidden", "Cross-origin requests cannot change data.");
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") fail("forbidden", "Cross-site requests cannot change data.");
}

// ── Route composition ─────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface HandlerArgs {
  req: BunRequest;
  /** Set (and role-checked) whenever the route declares a permission. */
  user: SessionUser | null;
  params: Record<string, string>;
  url: URL;
}

interface RouteSpec {
  /** null: no session required. */
  permission: Permission | null;
  handle: (args: HandlerArgs) => Response | Promise<Response>;
}

function createApiRoutes(app: App) {
  const { services, sessions, config } = app;

  const route =
    (methods: Partial<Record<Method, RouteSpec>>) =>
    async (req: BunRequest): Promise<Response> => {
      try {
        const spec = methods[req.method as Method];
        if (!spec) return json({ error: { code: "bad_request", message: `${req.method} is not supported here.` } } satisfies ApiErrorBody, 405);
        if (req.method !== "GET") requireSameOrigin(req);
        let user: SessionUser | null = null;
        if (spec.permission) {
          user = sessions.resolve(readSessionToken(req));
          if (!user) fail("unauthenticated", config.demoAuth ? "Choose a demo persona to continue." : "Sign-in is not configured on this server.");
          if (!can(user!.role, spec.permission)) fail("forbidden", `The ${user!.role} role cannot do this.`);
        }
        return await spec.handle({ req, user, params: (req.params ?? {}) as Record<string, string>, url: new URL(req.url) });
      } catch (e) {
        return errorResponse(e);
      }
    };

  const revision = () =>
    (services.db.query("SELECT snapshot_revision AS r FROM warehouse_settings WHERE id = ?").get(services.warehouseId) as { r: number } | null)?.r;

  const sessionInfo = (user: SessionUser): SessionInfo => ({ user, demo: config.demoAuth });

  return {
    "/api/health": route({
      GET: {
        permission: null,
        handle: () => {
          const s = seedState(app.db);
          const ready = schemaVersion(app.db) >= 1 && s.seeded;
          return json({ data: { ready, databaseReady: ready, schemaVersion: schemaVersion(app.db), seeded: s.seeded, demoAuth: config.demoAuth } });
        },
      },
    }),

    "/api/session": route({
      GET: {
        permission: null,
        handle: ({ req }) => {
          const user = sessions.resolve(readSessionToken(req));
          if (!user) fail("unauthenticated", config.demoAuth ? "Choose a demo persona to continue." : "Sign-in is not configured on this server.");
          return json({ data: sessionInfo(user!) });
        },
      },
      DELETE: {
        permission: null,
        handle: ({ req }) => {
          sessions.delete(readSessionToken(req));
          return json({ data: { signedOut: true } }, 200, { "set-cookie": clearSessionCookie(isHttps(req)) });
        },
      },
    }),

    "/api/demo/personas": route({
      GET: {
        permission: null,
        handle: () => {
          if (!config.demoAuth) fail("not_found", "Demo personas are disabled (DEMO_AUTH is not set).");
          return json({ data: { personas: DEMO_USERS, label: "Synthetic demo personas — simulated sign-in, real server-side role checks." } });
        },
      },
    }),

    "/api/demo/session": route({
      POST: {
        permission: null,
        handle: async ({ req }) => {
          if (!config.demoAuth) fail("not_found", "Demo sign-in is disabled (DEMO_AUTH is not set).");
          const body = await readJson(req);
          const userId = isObject(body) && typeof body.userId === "string" ? body.userId : null;
          const user = DEMO_USERS.find((u) => u.id === userId);
          if (!user) fail("validation_failed", "Unknown demo persona.", { fields: { userId: "Choose one of the configured demo personas." } });
          sessions.delete(readSessionToken(req));
          const token = sessions.create(user!.id);
          return json({ data: sessionInfo(user!) }, 200, { "set-cookie": sessionCookie(token, isHttps(req)) });
        },
      },
    }),

    "/api/warehouse": route({
      GET: {
        permission: "warehouse.read",
        handle: () => {
          const snapshot = getWarehouseSnapshot(services);
          return json({ data: snapshot, snapshotRevision: snapshot.revision });
        },
      },
    }),

    "/api/products/:sku": route({
      GET: {
        permission: "warehouse.read",
        handle: ({ params }) => {
          const detail = getProductDetail(services, params.sku!.toUpperCase());
          return json({ data: detail, snapshotRevision: detail.revision });
        },
      },
    }),

    "/api/products/:sku/movements": route({
      GET: {
        permission: "warehouse.read",
        handle: ({ params, url }) => {
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
          return json({ data: getMovements(services, params.sku!.toUpperCase(), url.searchParams.get("cursor"), limit), snapshotRevision: revision() });
        },
      },
    }),

    "/api/activity": route({
      GET: {
        permission: "warehouse.read",
        handle: ({ url }) => {
          const date = url.searchParams.get("date");
          if (date !== null && !isIsoDate(date)) fail("bad_request", "date must be YYYY-MM-DD.");
          return json({ data: getDailyActivity(services, date), snapshotRevision: revision() });
        },
      },
    }),

    "/api/receivings": route({
      GET: {
        permission: "warehouse.read",
        handle: ({ url }) => {
          const status = url.searchParams.get("status");
          if (status !== null && !["draft", "posted", "cancelled"].includes(status)) fail("bad_request", "status must be draft, posted or cancelled.");
          return json({ data: listReceivings(services, status as ReceivingStatus | null), snapshotRevision: revision() });
        },
      },
      POST: {
        permission: "receiving.create",
        handle: async ({ req, user }) => {
          const body = validated(parseCreateReceiving, await readJson(req));
          return json({ data: createReceiving(services, user!, body), snapshotRevision: revision() }, 201);
        },
      },
    }),

    "/api/receivings/:id": route({
      GET: {
        permission: "warehouse.read",
        handle: ({ params }) => json({ data: getReceiving(services, params.id!), snapshotRevision: revision() }),
      },
      PATCH: {
        permission: "receiving.edit",
        handle: async ({ req, user, params }) => {
          const body = validated(parseUpdateReceiving, await readJson(req));
          return json({ data: updateReceiving(services, user!, params.id!, body), snapshotRevision: revision() });
        },
      },
    }),

    "/api/receivings/:id/post": route({
      POST: {
        permission: "receiving.post",
        handle: async ({ req, user, params }) => {
          const body = validated(parsePostReceiving, await readJson(req));
          const result = postReceiving(services, user!, params.id!, body, req.headers.get(IDEMPOTENCY_HEADER));
          return json({ data: result, snapshotRevision: result.snapshotRevision }, 200, result.replayed ? { "idempotent-replayed": "true" } : {});
        },
      },
    }),

    "/api/receivings/:id/cancel": route({
      POST: {
        permission: "receiving.cancel",
        handle: async ({ req, user, params }) => {
          const body = validated(parseCancelReceiving, await readJson(req));
          return json({ data: cancelReceiving(services, user!, params.id!, body), snapshotRevision: revision() });
        },
      },
    }),

    // Unknown API paths are JSON 404s, never the HTML application.
    "/api/*": () => json({ error: { code: "not_found", message: "No such API route." } } satisfies ApiErrorBody, 404),
  };
}
