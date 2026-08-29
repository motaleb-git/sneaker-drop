export const id = "001_init";

export const statements = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS drops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    total_stock INTEGER NOT NULL CHECK (total_stock >= 0),
    available_stock INTEGER NOT NULL CHECK (available_stock >= 0),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (available_stock <= total_stock),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
  )`,
  `CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES drops (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'purchased', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES drops (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reservation_id UUID NOT NULL UNIQUE REFERENCES reservations (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_pending_per_user_drop
    ON reservations (user_id, drop_id)
    WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS reservations_pending_expiry
    ON reservations (expires_at)
    WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS purchases_drop_created
    ON purchases (drop_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS drops_starts_ends_idx
    ON drops (starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS reservations_drop_id_idx
    ON reservations (drop_id)`,
  `CREATE INDEX IF NOT EXISTS reservations_user_id_idx
    ON reservations (user_id)`,
];
