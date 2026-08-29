# Limited Edition Sneaker Drop

Repository: [github.com/motaleb-git/sneaker-drop](https://github.com/motaleb-git/sneaker-drop)

Real-time inventory for a high-demand merch drop. Users see live stock, reserve a unit for 60 seconds, then complete purchase. Overselling is blocked at the database, and expired holds automatically return stock to every connected client.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind + Zustand + Socket.io-client
- **Backend:** Node.js + Express + TypeScript + Socket.io
- **ORM:** Sequelize
- **Database:** PostgreSQL 16

This repo is **two standalone projects**. Each has its own `package.json` and `node_modules`.

```
sneaker-drop/
  server/    Node + Express + Socket.io + Sequelize
  client/    React + Vite
```

## How to run locally

### 1. Start Postgres

From `server/`:

**Option A — Docker**

```bash
cd server
docker compose up -d
```

**Option B — local PostgreSQL**

```sql
CREATE USER sneaker WITH PASSWORD 'sneaker';
CREATE DATABASE sneaker_drop OWNER sneaker;
GRANT ALL ON SCHEMA public TO sneaker;
```

Connection string: `postgres://sneaker:sneaker@localhost:5432/sneaker_drop`

### 2. Backend

```bash
cd server
cp .env.example .env
npm install
npm run seed
npm run dev
```

API + WebSocket: [http://localhost:4000](http://localhost:4000)  
Swagger UI: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)  
OpenAPI JSON: [http://localhost:4000/api/docs.json](http://localhost:4000/api/docs.json)  
Health check: `GET /api/health`

In Swagger: **Authorize** → paste the JWT from `/api/auth/login` (seed: `alice` / `password123`).

Change `JWT_SECRET` before any public deploy.

`npm test` runs 21 scenarios, including **alice’s hold is invisible to bob** (stock still updates). Client: `cd client && npm test` checks the UI filter. GitHub Actions [CI](.github/workflows/ci.yml) runs both.

```bash
cd server
npm test
```

CI (on every push): server tests + `tsc` build, plus client `tsc`.

Versioned SQL migrations in [`server/src/db/migrations`](server/src/db/migrations) run on boot (`schema_migrations`). `SYNC_SCHEMA=true` is an emergency Sequelize sync only — not the default. Reference copy: [`server/src/db/schema.sql`](server/src/db/schema.sql). Applied objects include:

- unique partial index: one **pending** reservation per user per drop
- expiry index on `reservations(expires_at) WHERE status = 'pending'`
- activity-feed index on `purchases(drop_id, created_at DESC)`

Seed accounts:

| Username | Password      |
|----------|---------------|
| `alice` (admin) | `password123` |
| `bob` (user)    | `password123` |

### 3. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

UI: [http://localhost:5173](http://localhost:5173)

Optional: copy [`client/.env.example`](client/.env.example) to `client/.env` and set `VITE_API_URL` / `VITE_WS_URL` for production. Locally the Vite proxy talks to `localhost:4000`.

## SQL schema

See [`server/src/db/schema.sql`](server/src/db/schema.sql). Tables:

- `users` — username + password hash
- `drops` — merch drop, `price_cents`, `total_stock`, `available_stock`, `starts_at`, `ends_at`
- `reservations` — 60s hold (`pending` / `purchased` / `expired`)
- `purchases` — permanent sale, unique `reservation_id`

Stock invariant:

`available_stock + pending_reservations + purchases = total_stock`

## Architecture: 60-second expiration

`expires_at` is set in Postgres as `NOW() + interval`, not from the Node clock. Purchase expiry also uses `expires_at <= NOW()`. A 1-second worker expires due rows with:

```sql
SELECT id FROM reservations
WHERE status = 'pending' AND expires_at <= NOW()
FOR UPDATE SKIP LOCKED
```

then increments `available_stock` in the same statement and emits `reservation:expired` + `stock:updated` over Socket.io. The API process starts the worker by default (`START_EXPIRY_WORKER=true`). For a split deploy: `START_EXPIRY_WORKER=false` on the API and `npm run worker` in a second process.

Why this approach:

- Time lives in the database, so a server restart does not lose holds or leak stock
- `SKIP LOCKED` is safe if you later run more than one worker
- Lazy-only expiry would leave stock wrong until the next click
- Per-reservation `setTimeout` dies on restart and does not scale

## Concurrency: no overselling

Reserve never does `SELECT` then `UPDATE`. It uses one atomic statement inside a transaction:

```sql
UPDATE drops
SET available_stock = available_stock - 1
WHERE id = :dropId
  AND available_stock > 0
  AND starts_at <= NOW()
  AND (ends_at IS NULL OR ends_at > NOW())
RETURNING *;
```

If `RETURNING` is empty, the API responds **409** (`SOLD_OUT`, `NOT_LIVE`, or `ENDED`). A hundred concurrent clicks on the last unit serialize on the Postgres row lock; only one decrement succeeds. The reservation insert is in the same transaction, so a unique-constraint collision (same user, same drop) rolls the stock decrement back.

Socket events are emitted **after commit**.

Verify last-item safety against your database:

```bash
cd server
npm run test:concurrency
npm test
```

Expected concurrency check: `wins=1 losses=7 stock=0`. Test 13 also runs 40 users against 5 units (`wins=5 stock=0`).

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/auth/register` | no | Create user + JWT |
| `POST` | `/api/auth/login` | no | JWT |
| `GET` | `/api/drops` | no | Drops + nested top 3 purchasers |
| `POST` | `/api/drops` | yes | Initialize a merch drop |
| `POST` | `/api/drops/:id/reserve` | yes | Atomic 60s hold |
| `POST` | `/api/reservations/:id/purchase` | yes | Complete purchase (owner + still pending) |
| `GET` | `/api/me/reservations` | yes | Current user's pending holds |

`GET /api/drops` uses a SQL `LATERAL` subquery so each drop includes the 3 latest purchasers (`username`, `createdAt`). Sequelize `include` + `limit` is not used because it does not limit per parent row reliably.

Create-drop body:

```json
{
  "name": "Air Jordan 1 - 100 units",
  "priceCents": 18000,
  "totalStock": 100,
  "startsAt": "2026-08-29T12:00:00.000Z",
  "endsAt": null
}
```

`availableStock` is initialized to `totalStock`. Reserve/purchase are rejected until `startsAt`.

## WebSocket events

Connect to the API origin with `{ auth: { token } }`.

- `stock:updated` → `{ dropId, availableStock }`
- `purchase:created` → `{ dropId, username, createdAt }`
- `reservation:expired` → `{ reservationId, dropId, availableStock }`
- `drop:created` → full drop DTO (other open dashboards add the card)

Stock correctness does not depend on Redis or in-memory locks. One API process is enough for the live UI. If you later run more than one Node process, clients on other instances may miss Socket events — overselling is still impossible because every reserve/purchase/expiry goes through Postgres.

## Environment variables

| Name | Where | Purpose |
|------|--------|---------|
| `DATABASE_URL` | server | Postgres (use Neon **pooled** host in production) |
| `JWT_SECRET` | server | Sign JWTs |
| `PORT` | server | Default `4000` |
| `CLIENT_ORIGIN` | server | CORS allowlist, comma-separated |
| `RESERVATION_TTL_SECONDS` | server | Default `60` |
| `SYNC_SCHEMA` | server | Emergency `sequelize.sync()` only. Default `false` — migrations create tables |
| `SWAGGER_ENABLED` | server | Local default `true`. Off in production unless you set `true` |
| `START_EXPIRY_WORKER` | server | Default `true`. Set `false` if you run `npm run worker` separately |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | server | HttpOnly session cookie. Cross-site: `none` + `secure` |
| `VITE_API_URL` | client | API origin (empty in local Vite proxy) |
| `VITE_WS_URL` | client | Socket.io origin (local default `http://localhost:4000`) |

Do not commit `.env`.

## Production hosting (bonus)

Socket.io and the 1s expiry worker need a **long-lived Node process**. Vercel serverless cannot hold WebSocket connections or run that loop reliably.

Recommended:

1. **Neon** — Postgres (`DATABASE_URL` pooled)
2. **Render** — Blueprint [`render.yaml`](render.yaml) or Docker [`server/Dockerfile`](server/Dockerfile)
3. **Vercel** — the Vite React app (`client/vercel.json` SPA rewrite). Set `VITE_API_URL` / `VITE_WS_URL` to the Render origin, and `CLIENT_ORIGIN` on the API to the Vercel origin.

Migrations create tables on first boot. Set `JWT_SECRET` to at least 32 characters. `alice` is the only seed admin (`POST /api/drops`).

## Scale notes (not required for the demo)

Correctness is Postgres: atomic `UPDATE`, the reservation insert in the same transaction, purchase `FOR UPDATE`, expiry `FOR UPDATE SKIP LOCKED`, and a deferred trigger that `available + pending + purchased = total`. That holds with one Node process or many.

Later, if you need it:

- A Socket.io pub/sub adapter so live events reach every API instance (UI only — not inventory)
- Neon pooler / PgBouncer (use the pooled URL now)
- Idempotency-Key on purchase
