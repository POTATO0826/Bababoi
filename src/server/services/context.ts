import type { ApiErrorCode, ReceivingIssue, SessionUser } from "@/shared/contracts";
import type { Db } from "@/server/db/database";

/** Named points inside write transactions where tests can inject a failure to prove rollback. */
export type FaultPoint = "receiving.post:after-balances" | "receiving.post:before-commit";

export interface ServiceContext {
  db: Db;
  clock: () => Date;
  warehouseId: string;
  faults?: (point: FaultPoint) => void;
}

export type Actor = Pick<SessionUser, "id" | "role" | "name">;

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  version_conflict: 409,
  state_conflict: 409,
  idempotency_conflict: 409,
  duplicate_reference: 409,
  stock_conflict: 409,
  validation_failed: 422,
  not_initialized: 503,
  unavailable: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly extra: { fields?: Record<string, string>; issues?: ReceivingIssue[]; currentVersion?: number } = {},
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export function isConstraint(e: unknown, text: string) {
  const code = (e as { code?: unknown } | null)?.code;
  return e instanceof Error && typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT") && e.message.includes(text);
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** Bumps the snapshot revision in the current transaction and returns the new value. */
export function bumpRevision(ctx: ServiceContext): number {
  const row = ctx.db
    .query("UPDATE warehouse_settings SET snapshot_revision = snapshot_revision + 1 WHERE id = ? RETURNING snapshot_revision AS r")
    .get(ctx.warehouseId) as { r: number } | null;
  if (!row) throw new AppError("not_initialized", "Warehouse is not initialized. Run `bun run db:seed`.");
  return row.r;
}

export function warehouseRow(ctx: ServiceContext) {
  const row = ctx.db
    .query(
      "SELECT id, name, timezone, geometry_version, snapshot_revision, demo_anchor_date, synthetic, seed_version FROM warehouse_settings WHERE id = ?",
    )
    .get(ctx.warehouseId) as {
    id: string;
    name: string;
    timezone: string;
    geometry_version: string;
    snapshot_revision: number;
    demo_anchor_date: string;
    synthetic: number;
    seed_version: string | null;
  } | null;
  if (!row || !row.seed_version) throw new AppError("not_initialized", "Warehouse is not initialized. Run `bun run db:seed`.");
  return row;
}

export function recordActivity(
  ctx: ServiceContext,
  a: {
    entityType: string;
    entityId: string;
    entityVersion: number | null;
    action: string;
    actorId: string;
    at: string;
    localDate: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    synthetic: boolean;
  },
) {
  ctx.db
    .query(
      `INSERT INTO activity (entity_type, entity_id, entity_version, action, actor_id, occurred_at, local_date, reason, metadata_json, synthetic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      a.entityType,
      a.entityId,
      a.entityVersion,
      a.action,
      a.actorId,
      a.at,
      a.localDate,
      a.reason ?? null,
      a.metadata ? JSON.stringify(a.metadata) : null,
      a.synthetic ? 1 : 0,
    );
}
