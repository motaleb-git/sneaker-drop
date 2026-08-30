# Limited Edition Sneaker Drop

A real-time sneaker drop platform where inventory, holds, and purchases stay correct under load. Users browse live stock, reserve a unit for 60 seconds, and complete the purchase before the hold expires. Every connected client sees stock updates instantly.

**Repository:** [github.com/motaleb-git/sneaker-drop](https://github.com/motaleb-git/sneaker-drop)

---

## What this project demonstrates

- **No overselling** — stock changes are atomic in PostgreSQL, not read-modify-write in application code
- **Reliable holds** — expiry time is set in the database; a background worker returns stock when holds expire
- **Live UI** — Socket.io pushes stock, purchase, and expiry events to all open dashboards
- **Production-minded API** — Zod validation, tiered rate limits, structured errors, OpenAPI docs, versioned migrations

The hard constraint is inventory correctness. Redis (optional) is used only for caching and cross-process events — never for stock counts.

---

## Tech stack

| Layer | Choices |
|-------|---------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Zustand, Socket.io-client |
| Backend | Node.js 20+, Express, TypeScript, Socket.io, Sequelize |
| Database | PostgreSQL 16 |

The repo is two independent apps — `server/` and `client/` — each with its own `package.json` and dependencies.

---

## Quick start

You need **Node.js 20+** and **PostgreSQL 16** (or Docker).

### 1. Database

**Docker (recommended)**

```bash
cd server
docker compose up -d
```

**Manual setup**

```sql
CREATE USER sneaker WITH PASSWORD 'sneaker';
CREATE DATABASE sneaker_drop OWNER sneaker;
GRANT ALL ON SCHEMA public TO sneaker;
```

Connection string:

```
postgres://sneaker:sneaker@localhost:5432/sneaker_drop
```

> **DBeaver tip:** connect as user `sneaker`, database `sneaker_drop` — not the default `postgres` user. A preconfigured datasource lives in `server/.dbeaver/data-sources.json`.

### 2. API server

```bash
cd server
cp .env.example .env
npm install
npm run seed    # creates sample drops + demo accounts
npm run dev
```

| Endpoint | URL |
|----------|-----|
| API + WebSocket | http://localhost:4000 |
| Swagger UI | http://localhost:4000/api/docs |
| OpenAPI JSON | http://localhost:4000/api/docs.json |
| Health check | `GET /api/health` |

**Demo accounts** (created by `npm run seed`):

| Username | Password | Role |
|----------|----------|------|
| `alice` | `password123` | admin — can create drops |
| `bob` | `password123` | user |

In Swagger, click **Authorize** and paste the JWT returned from `POST /api/auth/login`.

### 3. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/socket.io` to port 4000 — no client `.env` needed locally.

---

## How it works

### Reserve → hold → purchase

```
User clicks "Reserve"
        │
        ▼
┌─────────────────────────────────────┐
│  Atomic UPDATE on drops row         │
│  (decrement stock if available)     │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  INSERT reservation (pending, 60s)  │
│  Same transaction — rolls back if   │
│  user already has a pending hold    │
└─────────────────────────────────────┘
        │
        ▼
  Socket: stock:updated
        │
        ▼
User clicks "Purchase" within 60s
        │
        ▼
  Reservation → purchased, stock stays decremented
  Socket: purchase:created
```

If the user does nothing, a worker expires the hold, restores stock, and broadcasts `reservation:expired` + `stock:updated`.

### Why expiry lives in Postgres

`expires_at` is written as `NOW() + interval` inside the database — not calculated from the Node.js clock. That means:

- A server restart does not lose active holds or leak stock
- Purchase rejection uses the same `expires_at <= NOW()` check
- `FOR UPDATE SKIP LOCKED` makes the worker safe to run in multiple processes later

The worker runs every second by default inside the API process (`START_EXPIRY_WORKER=true`). For split deployments, disable it on the API and run `npm run worker` separately.

### Why overselling is impossible

Reserve never does a separate read and write. One statement inside a transaction handles it:

```sql
UPDATE drops
SET available_stock = available_stock - 1
WHERE id = :dropId
  AND available_stock > 0
  AND starts_at <= NOW()
  AND (ends_at IS NULL OR ends_at > NOW())
RETURNING *;
```

If `RETURNING` is empty, the API responds **409** (`SOLD_OUT`, `NOT_LIVE`, or `ENDED`). A hundred concurrent clicks on the last unit serialize on the Postgres row lock — only one succeeds. The reservation insert is in the same transaction, so a duplicate hold for the same user rolls the decrement back.

Socket events are emitted **after commit**, so clients never see optimistic stock that was rolled back.

### Stock invariant

A deferred trigger enforces this at the database level:

```
available_stock + pending_reservations + purchases = total_stock
```

Reference schema: [`server/src/db/schema.sql`](server/src/db/schema.sql). Versioned migrations in [`server/src/db/migrations/`](server/src/db/migrations/) run automatically on boot.

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | — | Create account, returns JWT |
| `POST` | `/api/auth/login` | — | Login, returns JWT |
| `GET` | `/api/drops` | — | List drops with top 3 recent buyers per drop |
| `POST` | `/api/drops` | admin | Create a new drop |
| `POST` | `/api/drops/:id/reserve` | user | Reserve one unit (60s hold) |
| `POST` | `/api/reservations/:id/purchase` | user | Complete purchase (owner, pending, not expired) |
| `GET` | `/api/me/reservations` | user | Current user's active holds |

**Create drop** (admin only):

```json
{
  "name": "Air Jordan 1 - 100 units",
  "priceCents": 18000,
  "totalStock": 100,
  "startsAt": "2026-08-29T12:00:00.000Z",
  "endsAt": null
}
```

`availableStock` starts equal to `totalStock`. Reserve and purchase are rejected until `startsAt`.

`GET /api/drops` uses a SQL `LATERAL` join for the activity feed — Sequelize `include` + `limit` does not reliably limit per parent row.

Request bodies are validated with **Zod** (`server/src/schemas/`). Invalid input returns structured 400 responses.

---

## WebSocket events

Connect to the API origin with `{ auth: { token } }` (JWT from login).

| Event | Payload | When |
|-------|---------|------|
| `stock:updated` | `{ dropId, availableStock }` | After reserve, expiry, or any stock change |
| `purchase:created` | `{ dropId, username, createdAt }` | After a successful purchase |
| `reservation:expired` | `{ reservationId, dropId, availableStock }` | Hold timed out |
| `drop:created` | full drop object | Admin created a new drop |

Stock correctness does not depend on sockets. If a client misses an event, the next `GET /api/drops` or page refresh reconciles state from Postgres.

---

## Environment variables

### Server (`server/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | local connection string | PostgreSQL connection |
| `JWT_SECRET` | dev fallback | JWT signing — **must be 32+ chars in production** |
| `PORT` | `4000` | HTTP listen port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allowlist (comma-separated) |
| `RESERVATION_TTL_SECONDS` | `60` | Hold duration |
| `START_EXPIRY_WORKER` | `true` | Run expiry loop in API process |
| `SWAGGER_ENABLED` | `true` locally | OpenAPI UI |
| `SYNC_SCHEMA` | `false` | Emergency Sequelize sync — migrations are the default |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | auto | HttpOnly session cookie settings |
| `REDIS_URL` | — | Optional — live events + drop cache across processes |
| `RATE_LIMIT_*` | see `.env.example` | Per-tier rate limits (auth, read, mutation, reserve) |

Do not commit `.env` files.

### Client (`client/.env`)

Only needed for production builds:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend origin (no trailing `/api`) |
| `VITE_WS_URL` | Socket.io origin |

Leave both empty for local development — Vite proxies to `localhost:4000`.

---

## Deployment

Socket.io and the expiry worker need a **long-lived Node process**. Serverless platforms (e.g. Vercel functions) cannot host WebSockets or background loops reliably.

**Recommended layout:**

| Service | Role |
|---------|------|
| **Neon** (or any Postgres) | Database — use the **pooled** connection URL |
| **Render** | API + worker — see [`render.yaml`](render.yaml) or [`server/Dockerfile`](server/Dockerfile) |
| **Vercel** | Static React app — see [`client/vercel.json`](client/vercel.json) |

**Checklist:**

1. Set `DATABASE_URL`, `JWT_SECRET` (32+ chars), and `CLIENT_ORIGIN` on Render
2. Set `VITE_API_URL` and `VITE_WS_URL` on Vercel to the Render API URL
3. Redeploy Vercel after changing env vars — Vite embeds them at build time
4. Run `npm run seed` once against the production database (or create drops via Swagger as `alice`)
5. Confirm `GET /api/health` returns `{ "ok": true, "db": "up" }`

Migrations create tables on first boot. Swagger is off in production by default.

---

## Project layout

```
sneaker-drop/
├── client/                 React SPA
│   ├── src/
│   │   ├── components/     DropCard, CreateDropForm, …
│   │   ├── hooks/          useSocket, useCountdown, useHoldExpiry
│   │   ├── lib/            API client, auth, realtime helpers
│   │   ├── pages/          Login, Dashboard
│   │   └── store/          Zustand drop state
│   └── vite.config.ts      Dev proxy to API
│
├── server/                 Express API + Socket.io
│   ├── src/
│   │   ├── db/             Migrations, seed, schema reference
│   │   ├── middleware/     Auth, validation, rate limits, errors
│   │   ├── routes/         REST endpoints
│   │   ├── services/       Business logic, expiry worker, cache
│   │   ├── sockets/        Real-time event hub
│   │   └── schemas/        Zod request validation
│   └── docker-compose.yml  Local Postgres
│
├── .github/workflows/ci.yml
└── render.yaml             Render blueprint
```

---

## CI

GitHub Actions runs on every push and pull request:

- **Server** — `npm ci` + `tsc` build against Postgres 16
- **Client** — `npm ci` + typecheck + Vite production build

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Manual verification scripts

These are developer utilities, not automated tests:

```bash
# Simulate concurrent reserve attempts on the last unit
cd server && npm run test:concurrency

# Benchmark drop listing query
cd server && npm run test:bench
```

Expected concurrency output for a single-unit drop: `wins=1 losses=7 stock=0`.

---

## Scaling notes

The current design is correct with one API process or many — every reserve, purchase, and expiry goes through Postgres row locks and transactions.

If you add more API instances later:

- **Inventory** — already safe; no changes needed
- **Live events** — add a Socket.io Redis adapter (or use the optional `REDIS_URL` pub/sub) so all instances broadcast to all clients
- **Database** — use a connection pooler (Neon pooler, PgBouncer) under load

Optional improvements not implemented here: idempotency keys on purchase, read replicas for listing, dedicated worker fleet for expiry.
