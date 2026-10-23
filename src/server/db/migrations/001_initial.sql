-- WareOrb schema v1: one warehouse, receiving core, stock ledger, synthetic opening records.
-- Quantities are positive integers in one base unit per SKU. Timestamps are UTC ISO-8601 text;
-- *_on / local_date columns are warehouse-local calendar dates (YYYY-MM-DD).

CREATE TABLE warehouse_settings (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  timezone               TEXT NOT NULL,
  currency               TEXT NOT NULL,
  geometry_version       TEXT NOT NULL,
  snapshot_revision      INTEGER NOT NULL CHECK (snapshot_revision >= 1),
  observation_started_on TEXT NOT NULL,
  demo_anchor_date       TEXT NOT NULL,
  synthetic              INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  seed_version           TEXT,
  seeded_at              TEXT,
  version                INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE category (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
) STRICT;

CREATE TABLE product (
  sku            TEXT PRIMARY KEY,
  category_id    TEXT NOT NULL REFERENCES category (id),
  model_name     TEXT NOT NULL,
  variant        TEXT NOT NULL,
  color          TEXT NOT NULL,
  kind           TEXT NOT NULL,
  doors          INTEGER NOT NULL,
  units_per_bay  INTEGER NOT NULL CHECK (units_per_bay > 0),
  base_unit      TEXT NOT NULL CHECK (base_unit IN ('piece', 'set')),
  home_floor     INTEGER NOT NULL CHECK (home_floor IN (1, 2)),
  home_zone      TEXT NOT NULL CHECK (home_zone IN ('A', 'B', 'C', 'D')),
  sort_order     INTEGER NOT NULL,
  length_mm      INTEGER,
  width_mm       INTEGER,
  height_mm      INTEGER,
  weight_grams   INTEGER,
  pack_multiple  INTEGER NOT NULL DEFAULT 1 CHECK (pack_multiple > 0),
  synthetic      INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
) STRICT;

-- Location identity is the legacy bay ID within the warehouse; display code repeats across floors.
CREATE TABLE location (
  id           TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouse_settings (id),
  floor        INTEGER NOT NULL CHECK (floor IN (1, 2)),
  zone         TEXT NOT NULL CHECK (zone IN ('A', 'B', 'C', 'D')),
  row_index    INTEGER NOT NULL CHECK (row_index >= 0),
  bay_index    INTEGER NOT NULL CHECK (bay_index >= 0),
  code         TEXT NOT NULL,
  x0           REAL NOT NULL,
  z0           REAL NOT NULL,
  x1           REAL NOT NULL,
  z1           REAL NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  UNIQUE (warehouse_id, floor, code)
) STRICT;

CREATE TABLE purchase (
  id           TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouse_settings (id),
  supplier_ref TEXT NOT NULL,
  document_ref TEXT,
  status       TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  version      INTEGER NOT NULL,
  synthetic    INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL
) STRICT;

-- Received quantity is derived from posted receiving lines linked to the purchase line.
CREATE TABLE purchase_line (
  id            TEXT PRIMARY KEY,
  purchase_id   TEXT NOT NULL REFERENCES purchase (id),
  sku           TEXT NOT NULL REFERENCES product (sku),
  ordered_qty   INTEGER NOT NULL CHECK (ordered_qty > 0),
  cancelled_qty INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_qty >= 0),
  expected_on   TEXT,
  CHECK (cancelled_qty <= ordered_qty)
) STRICT;
CREATE INDEX purchase_line_sku ON purchase_line (sku);

CREATE TABLE receiving (
  id             TEXT PRIMARY KEY,
  warehouse_id   TEXT NOT NULL REFERENCES warehouse_settings (id),
  kind           TEXT NOT NULL CHECK (kind IN ('delivery', 'demo_opening')),
  supplier_ref   TEXT,
  document_ref   TEXT,
  -- lower(trim(supplier)) || '|' || lower(trim(document)); NULL unless both are present.
  normalized_ref TEXT,
  status         TEXT NOT NULL CHECK (status IN ('draft', 'posted', 'cancelled')),
  version        INTEGER NOT NULL CHECK (version >= 1),
  synthetic      INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  posted_by      TEXT,
  posted_at      TEXT,
  cancelled_by   TEXT,
  cancelled_at   TEXT,
  cancel_reason  TEXT
) STRICT;
CREATE INDEX receiving_status ON receiving (status);
-- One live record per supplier + document reference: stops a second draft or a repost of the same note.
CREATE UNIQUE INDEX receiving_unique_reference ON receiving (warehouse_id, normalized_ref)
  WHERE normalized_ref IS NOT NULL AND status <> 'cancelled';

CREATE TABLE receiving_line (
  id               TEXT PRIMARY KEY,
  receiving_id     TEXT NOT NULL REFERENCES receiving (id),
  line_no          INTEGER NOT NULL CHECK (line_no >= 1),
  sku              TEXT REFERENCES product (sku),
  quantity         INTEGER CHECK (quantity IS NULL OR quantity > 0),
  unit             TEXT CHECK (unit IS NULL OR unit IN ('piece', 'set')),
  received_on      TEXT,
  purchase_line_id TEXT REFERENCES purchase_line (id),
  length_mm        INTEGER,
  width_mm         INTEGER,
  height_mm        INTEGER,
  weight_grams     INTEGER,
  UNIQUE (receiving_id, line_no)
) STRICT;
CREATE INDEX receiving_line_purchase ON receiving_line (purchase_line_id);

-- Proposed positions for a line. Becomes stock only when the receiving is posted.
CREATE TABLE receiving_allocation (
  line_id     TEXT NOT NULL REFERENCES receiving_line (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES location (id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (line_id, location_id)
) STRICT;

CREATE TABLE stock_lot (
  id                TEXT PRIMARY KEY,
  receiving_line_id TEXT NOT NULL UNIQUE REFERENCES receiving_line (id),
  sku               TEXT NOT NULL REFERENCES product (sku),
  received_on       TEXT NOT NULL,
  length_mm         INTEGER,
  width_mm          INTEGER,
  height_mm         INTEGER,
  weight_grams      INTEGER,
  synthetic         INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  created_at        TEXT NOT NULL
) STRICT;
CREATE INDEX stock_lot_sku ON stock_lot (sku);

CREATE TABLE stock_balance (
  lot_id      TEXT NOT NULL REFERENCES stock_lot (id),
  location_id TEXT NOT NULL REFERENCES location (id),
  on_hand     INTEGER NOT NULL CHECK (on_hand >= 0),
  PRIMARY KEY (lot_id, location_id)
) STRICT;
CREATE INDEX stock_balance_location ON stock_balance (location_id);

-- Immutable operational ledger, written in the same transaction as the balance change.
CREATE TABLE stock_movement (
  id             TEXT PRIMARY KEY,
  lot_id         TEXT NOT NULL REFERENCES stock_lot (id),
  location_id    TEXT NOT NULL REFERENCES location (id),
  sku            TEXT NOT NULL REFERENCES product (sku),
  quantity       INTEGER NOT NULL CHECK (quantity <> 0),
  kind           TEXT NOT NULL CHECK (kind IN ('receipt', 'sale_dispatch', 'demo_opening')),
  source_type    TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  source_line_id TEXT,
  actor_id       TEXT NOT NULL,
  occurred_at    TEXT NOT NULL,
  recorded_at    TEXT NOT NULL,
  local_date     TEXT NOT NULL,
  seq            INTEGER NOT NULL UNIQUE,
  synthetic      INTEGER NOT NULL CHECK (synthetic IN (0, 1))
) STRICT;
CREATE INDEX stock_movement_sku ON stock_movement (sku, seq);
CREATE INDEX stock_movement_day ON stock_movement (local_date);

CREATE TABLE reservation (
  id            TEXT PRIMARY KEY,
  lot_id        TEXT NOT NULL REFERENCES stock_lot (id),
  location_id   TEXT NOT NULL REFERENCES location (id),
  sku           TEXT NOT NULL REFERENCES product (sku),
  original_qty  INTEGER NOT NULL CHECK (original_qty > 0),
  remaining_qty INTEGER NOT NULL CHECK (remaining_qty >= 0),
  status        TEXT NOT NULL CHECK (status IN ('active', 'released', 'consumed')),
  source_type   TEXT NOT NULL CHECK (source_type IN ('demo_opening_booking', 'sale')),
  source_ref    TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  synthetic     INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  CHECK (remaining_qty <= original_qty)
) STRICT;
CREATE INDEX reservation_position ON reservation (lot_id, location_id, status);
CREATE INDEX reservation_sku ON reservation (sku, status);

CREATE TABLE activity (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  entity_version INTEGER,
  action         TEXT NOT NULL,
  actor_id       TEXT NOT NULL,
  occurred_at    TEXT NOT NULL,
  local_date     TEXT NOT NULL,
  reason         TEXT,
  metadata_json  TEXT,
  synthetic      INTEGER NOT NULL CHECK (synthetic IN (0, 1))
) STRICT;
CREATE INDEX activity_day ON activity (local_date, id);
CREATE INDEX activity_entity ON activity (entity_type, entity_id);

CREATE TABLE idempotency_result (
  warehouse_id  TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  action        TEXT NOT NULL,
  idem_key      TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (warehouse_id, actor_id, action, idem_key)
) STRICT;

-- ── Database-level guards (the services check first and return friendly errors) ──────────────

-- A bay holds one SKU in v1, and never more than that SKU's configured units per bay.
CREATE TRIGGER stock_balance_bay_rules_insert BEFORE INSERT ON stock_balance
BEGIN
  SELECT RAISE(ABORT, 'bay_holds_other_sku')
  WHERE NEW.on_hand > 0 AND EXISTS (
    SELECT 1 FROM stock_balance b JOIN stock_lot l ON l.id = b.lot_id
    WHERE b.location_id = NEW.location_id AND b.on_hand > 0
      AND l.sku <> (SELECT sku FROM stock_lot WHERE id = NEW.lot_id));
  SELECT RAISE(ABORT, 'bay_capacity_exceeded')
  WHERE NEW.on_hand + COALESCE((SELECT SUM(on_hand) FROM stock_balance WHERE location_id = NEW.location_id), 0)
        > (SELECT p.units_per_bay FROM stock_lot l JOIN product p ON p.sku = l.sku WHERE l.id = NEW.lot_id);
END;

CREATE TRIGGER stock_balance_bay_rules_update BEFORE UPDATE OF on_hand ON stock_balance
WHEN NEW.on_hand > OLD.on_hand
BEGIN
  SELECT RAISE(ABORT, 'bay_capacity_exceeded')
  WHERE NEW.on_hand - OLD.on_hand + (SELECT SUM(on_hand) FROM stock_balance WHERE location_id = NEW.location_id)
        > (SELECT p.units_per_bay FROM stock_lot l JOIN product p ON p.sku = l.sku WHERE l.id = NEW.lot_id);
END;

-- 0 <= reserved <= on hand at every lot/location.
CREATE TRIGGER reservation_within_balance BEFORE INSERT ON reservation
WHEN NEW.status = 'active'
BEGIN
  SELECT RAISE(ABORT, 'reservation_exceeds_balance')
  WHERE NEW.remaining_qty + COALESCE((SELECT SUM(remaining_qty) FROM reservation
          WHERE lot_id = NEW.lot_id AND location_id = NEW.location_id AND status = 'active'), 0)
        > COALESCE((SELECT on_hand FROM stock_balance WHERE lot_id = NEW.lot_id AND location_id = NEW.location_id), 0);
END;

CREATE TRIGGER stock_balance_keeps_reservations BEFORE UPDATE OF on_hand ON stock_balance
WHEN NEW.on_hand < OLD.on_hand
BEGIN
  SELECT RAISE(ABORT, 'balance_below_reserved')
  WHERE NEW.on_hand < COALESCE((SELECT SUM(remaining_qty) FROM reservation
          WHERE lot_id = NEW.lot_id AND location_id = NEW.location_id AND status = 'active'), 0);
END;

-- The ledger is append-only; there is no generic way to rewrite a count.
CREATE TRIGGER stock_movement_no_update BEFORE UPDATE ON stock_movement
BEGIN SELECT RAISE(ABORT, 'stock_movement_is_immutable'); END;
CREATE TRIGGER stock_movement_no_delete BEFORE DELETE ON stock_movement
BEGIN SELECT RAISE(ABORT, 'stock_movement_is_immutable'); END;
CREATE TRIGGER stock_balance_no_delete BEFORE DELETE ON stock_balance
BEGIN SELECT RAISE(ABORT, 'stock_balance_is_permanent'); END;

-- Lines and allocations of a posted or cancelled receiving cannot be changed.
CREATE TRIGGER receiving_line_locked_insert BEFORE INSERT ON receiving_line
WHEN (SELECT status FROM receiving WHERE id = NEW.receiving_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'receiving_not_editable'); END;
CREATE TRIGGER receiving_line_locked_update BEFORE UPDATE ON receiving_line
WHEN (SELECT status FROM receiving WHERE id = OLD.receiving_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'receiving_not_editable'); END;
CREATE TRIGGER receiving_line_locked_delete BEFORE DELETE ON receiving_line
WHEN (SELECT status FROM receiving WHERE id = OLD.receiving_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'receiving_not_editable'); END;
CREATE TRIGGER receiving_allocation_locked_insert BEFORE INSERT ON receiving_allocation
WHEN (SELECT r.status FROM receiving r JOIN receiving_line l ON l.receiving_id = r.id WHERE l.id = NEW.line_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'receiving_not_editable'); END;
CREATE TRIGGER receiving_allocation_locked_delete BEFORE DELETE ON receiving_allocation
WHEN (SELECT r.status FROM receiving r JOIN receiving_line l ON l.receiving_id = r.id WHERE l.id = OLD.line_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'receiving_not_editable'); END;
