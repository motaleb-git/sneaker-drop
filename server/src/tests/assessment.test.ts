import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "http";
import type { AddressInfo } from "net";
import bcrypt from "bcrypt";
import { QueryTypes } from "sequelize";
import { io as ioc } from "socket.io-client";
import { signToken } from "../middleware/auth";
import { AppError } from "../middleware/error";
import request from "supertest";
import { createApp } from "../app";
import { connectDb, sequelize } from "../db/sequelize";
import { Drop, User } from "../models";
import { createDrop, listDrops } from "../services/dropService";
import { invalidateDropCache } from "../services/dropCache";
import { expireReservations } from "../services/expirationWorker";
import {
  completePurchase,
  listMyReservations,
  reserveDrop,
} from "../services/reservationService";
import { attachSockets } from "../sockets";
import type { DropCreated } from "../types/realtime";

function errCode(err: unknown): string {
  if (err instanceof AppError) return err.code ?? "";
  throw err;
}

let passwordHash = "";
const testDropIds: string[] = [];
const testUserIds: string[] = [];

async function makeUser(prefix: string): Promise<User> {
  const username = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await User.create({ username, passwordHash, role: "user" });
  testUserIds.push(user.id);
  return user;
}

async function makeDrop(stock: number, name = "Assessment"): Promise<Drop> {
  const drop = await Drop.create({
    name: `${name} ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    priceCents: 1000,
    totalStock: stock,
    availableStock: stock,
    startsAt: new Date(Date.now() - 1000),
    endsAt: null,
  });
  testDropIds.push(drop.id);
  invalidateDropCache();
  return drop;
}

async function stockOf(id: string): Promise<number> {
  const rows = await sequelize.query<{ available_stock: number }>(
    `SELECT available_stock FROM drops WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return Number(rows[0]?.available_stock);
}

async function expireHold(reservationId: string): Promise<void> {
  await sequelize.query(
    `UPDATE reservations SET expires_at = NOW() - interval '2 seconds' WHERE id = :id`,
    { replacements: { id: reservationId } }
  );
}

before(async () => {
  passwordHash = await bcrypt.hash("password123", 4);
  await connectDb();
});

after(async () => {
  // Clean up all test-created data so the dashboard stays tidy.
  // All operations run in one transaction so the DEFERRABLE deferred stock
  // invariant trigger only fires at commit, after all deletes are complete.
  try {
    if (testDropIds.length > 0 || testUserIds.length > 0) {
      await sequelize.transaction(async (t) => {
        if (testDropIds.length > 0) {
          const dropPlaceholders = testDropIds.map((_, i) => `:id${i}`).join(", ");
          const dropReplacements = Object.fromEntries(testDropIds.map((id, i) => [`id${i}`, id]));
          // Reset stock so invariant holds when CASCADE removes child rows
          await sequelize.query(
            `UPDATE drops SET available_stock = total_stock WHERE id IN (${dropPlaceholders})`,
            { replacements: dropReplacements, transaction: t }
          );
          // CASCADE on drops removes dependent reservations and purchases
          await sequelize.query(
            `DELETE FROM drops WHERE id IN (${dropPlaceholders})`,
            { replacements: dropReplacements, transaction: t }
          );
        }
        if (testUserIds.length > 0) {
          const userPlaceholders = testUserIds.map((_, i) => `:uid${i}`).join(", ");
          const userReplacements = Object.fromEntries(testUserIds.map((id, i) => [`uid${i}`, id]));
          await sequelize.query(
            `DELETE FROM users WHERE id IN (${userPlaceholders})`,
            { replacements: userReplacements, transaction: t }
          );
        }
      });
    }
  } finally {
    await sequelize.close();
  }
});

test("1. reserve decrements available stock", async () => {
  const user = await makeUser("r1");
  const drop = await makeDrop(3);
  const result = await reserveDrop(drop.id, user.id);
  assert.equal(result.availableStock, 2);
  assert.equal(result.reservation.status, "pending");
  assert.equal(await stockOf(drop.id), 2);
});

test("2. sold out when last unit is already held", async () => {
  const owner = await makeUser("sold_a");
  const other = await makeUser("sold_b");
  const drop = await makeDrop(1);
  await reserveDrop(drop.id, owner.id);
  await assert.rejects(
    () => reserveDrop(drop.id, other.id),
    (err: unknown) => errCode(err) === "SOLD_OUT"
  );
  assert.equal(await stockOf(drop.id), 0);
});

test("3. concurrent reserve: one winner, stock 0", async () => {
  const users = await Promise.all(
    Array.from({ length: 8 }, (_, i) => makeUser(`race_${i}`))
  );
  const drop = await makeDrop(1, "Race");
  const results = await Promise.allSettled(
    users.map((user) => reserveDrop(drop.id, user.id))
  );
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const losses = results.filter((r) => r.status === "rejected").length;
  assert.equal(wins, 1);
  assert.equal(losses, 7);
  assert.equal(await stockOf(drop.id), 0);
});

test("4. expiry worker restores stock", async () => {
  const user = await makeUser("exp");
  const drop = await makeDrop(2);
  const { reservation } = await reserveDrop(drop.id, user.id);
  assert.equal(await stockOf(drop.id), 1);
  await expireHold(reservation.id);
  const expired = await expireReservations();
  assert.ok(expired.some((row) => row.reservationId === reservation.id));
  assert.equal(await stockOf(drop.id), 2);
});

test("5. owner can purchase a pending reservation", async () => {
  const user = await makeUser("buy");
  const drop = await makeDrop(1);
  const { reservation } = await reserveDrop(drop.id, user.id);
  const purchase = await completePurchase(reservation.id, user.id);
  assert.equal(purchase.dropId, drop.id);
  assert.equal(purchase.username, user.username);
  assert.equal(await stockOf(drop.id), 0);
});

test("6. expired reservation cannot be purchased and stock is restored", async () => {
  const user = await makeUser("late");
  const drop = await makeDrop(1);
  const { reservation } = await reserveDrop(drop.id, user.id);
  await expireHold(reservation.id);
  await assert.rejects(
    () => completePurchase(reservation.id, user.id),
    (err: unknown) => errCode(err) === "RESERVATION_EXPIRED"
  );
  assert.equal(await stockOf(drop.id), 1);
});

test("7. another user cannot purchase someone else's reservation", async () => {
  const owner = await makeUser("own");
  const other = await makeUser("oth");
  const drop = await makeDrop(1);
  const { reservation } = await reserveDrop(drop.id, owner.id);
  await assert.rejects(
    () => completePurchase(reservation.id, other.id),
    (err: unknown) => errCode(err) === "FORBIDDEN"
  );
});

test("8. duplicate purchase is rejected", async () => {
  const user = await makeUser("dup");
  const drop = await makeDrop(1);
  const { reservation } = await reserveDrop(drop.id, user.id);
  await completePurchase(reservation.id, user.id);
  await assert.rejects(
    () => completePurchase(reservation.id, user.id),
    (err: unknown) => errCode(err) === "ALREADY_PURCHASED"
  );
});

test("9. concurrent purchase of the same reservation: one winner", async () => {
  const user = await makeUser("cp");
  const drop = await makeDrop(1);
  const { reservation } = await reserveDrop(drop.id, user.id);
  const results = await Promise.allSettled([
    completePurchase(reservation.id, user.id),
    completePurchase(reservation.id, user.id),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const losses = results.filter((r) => r.status === "rejected");
  assert.equal(wins, 1);
  assert.equal(losses.length, 1);
  assert.equal(errCode((losses[0] as PromiseRejectedResult).reason), "ALREADY_PURCHASED");
});

test("10. same user cannot hold two pending reservations on one drop", async () => {
  const user = await makeUser("two");
  const drop = await makeDrop(5);
  await reserveDrop(drop.id, user.id);
  await assert.rejects(
    () => reserveDrop(drop.id, user.id),
    (err: unknown) => errCode(err) === "ALREADY_RESERVED"
  );
});

test("11. GET drops LATERAL top 3 purchasers, newest first", async () => {
  const drop = await makeDrop(4, "Feed");
  const names: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const user = await makeUser(`top${i}`);
    names.push(user.username);
    const { reservation } = await reserveDrop(drop.id, user.id);
    await completePurchase(reservation.id, user.id);
  }
  const listed = await listDrops();
  const found = listed.find((row) => row.id === drop.id);
  assert.ok(found);
  assert.equal(found.recentPurchasers.length, 3);
  assert.equal(found.recentPurchasers[0]?.username, names[3]);
  assert.equal(found.recentPurchasers[1]?.username, names[2]);
  assert.equal(found.recentPurchasers[2]?.username, names[1]);
});

test("12. stock:updated is emitted after reserve commit", async () => {
  const user = await makeUser("ws");
  const drop = await makeDrop(2);
  const token = signToken({ id: user.id, username: user.username, role: "user" });

  const server = http.createServer();
  attachSockets(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  const socket = ioc(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const stockEvent = new Promise<{ dropId: string; availableStock: number }>(
    (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("stock event timeout")), 5000);
      socket.on("stock:updated", (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    }
  );

  const reserved = await reserveDrop(drop.id, user.id);
  const payload = await stockEvent;
  assert.equal(payload.dropId, drop.id);
  assert.equal(payload.availableStock, reserved.availableStock);

  socket.disconnect();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("13. concurrent reserve stress: 40 users, 5 stock", async () => {
  const users = await Promise.all(
    Array.from({ length: 40 }, (_, i) => makeUser(`stress_${i}`))
  );
  const drop = await makeDrop(5, "Stress");
  const results = await Promise.allSettled(
    users.map((user) => reserveDrop(drop.id, user.id))
  );
  const wins = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(wins, 5);
  assert.equal(await stockOf(drop.id), 0);
});

test("14. purchase:created, reservation:expired, and drop:created emit after commit", async () => {
  const user = await makeUser("ws2");
  const drop = await makeDrop(2);
  const token = signToken({ id: user.id, username: user.username, role: "user" });

  const server = http.createServer();
  attachSockets(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const socket = ioc(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const purchaseEvent = new Promise<{ dropId: string; username: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("purchase event timeout")), 5000);
    socket.on("purchase:created", (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  const { reservation } = await reserveDrop(drop.id, user.id);
  const purchase = await completePurchase(reservation.id, user.id);
  const purchased = await purchaseEvent;
  assert.equal(purchased.dropId, drop.id);
  assert.equal(purchased.username, user.username);
  assert.equal(purchase.dropId, drop.id);

  const other = await makeUser("ws3");
  const hold = await reserveDrop(drop.id, other.id);
  await expireHold(hold.reservation.id);
  const expiredEvent = new Promise<{ reservationId: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("expired event timeout")), 5000);
    socket.on("reservation:expired", (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  await expireReservations();
  const expired = await expiredEvent;
  assert.equal(expired.reservationId, hold.reservation.id);

  const createdEvent = new Promise<DropCreated>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("drop event timeout")), 5000);
    socket.on("drop:created", (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  const created = await createDrop({
    name: `Live ${Date.now()}`,
    priceCents: 500,
    totalStock: 3,
  });
  testDropIds.push(created.id);
  const createdPayload = await createdEvent;
  assert.equal(createdPayload.id, created.id);
  assert.equal(createdPayload.totalStock, 3);

  socket.disconnect();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("15. deferred stock invariant holds after reserve + purchase + expire", async () => {
  const user = await makeUser("inv");
  const drop = await makeDrop(2);
  const first = await reserveDrop(drop.id, user.id);
  await completePurchase(first.reservation.id, user.id);
  const other = await makeUser("inv2");
  const second = await reserveDrop(drop.id, other.id);
  await expireHold(second.reservation.id);
  await expireReservations();

  const [row] = await sequelize.query<{ ok: boolean }>(
    `
    SELECT (
      available_stock
      + (SELECT COUNT(*) FROM reservations r WHERE r.drop_id = d.id AND r.status = 'pending')
      + (SELECT COUNT(*) FROM purchases p WHERE p.drop_id = d.id)
    ) = total_stock AS ok
    FROM drops d
    WHERE d.id = :id
    `,
    { replacements: { id: drop.id }, type: QueryTypes.SELECT }
  );
  assert.equal(row?.ok, true);
});

const app = createApp();

test("16. health includes db, ttl, and request id", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.db, "up");
  assert.equal(typeof res.body.reservationTtlSeconds, "number");
  assert.ok(res.headers["x-request-id"]);
});

test("17. register validation returns field errors + request id", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username: "ab", password: "short" });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "VALIDATION_ERROR");
  assert.ok(res.body.fields.username);
  assert.ok(res.body.fields.password);
  assert.ok(res.body.requestId);
});

test("18. non-admin cannot create a drop over HTTP", async () => {
  const username = `http_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const registered = await request(app)
    .post("/api/auth/register")
    .send({ username, password: "password123" });
  assert.equal(registered.status, 201);
  testUserIds.push(registered.body.user.id);
  const denied = await request(app)
    .post("/api/drops")
    .set("Authorization", `Bearer ${registered.body.token}`)
    .send({ name: "Nope", priceCents: 1000, totalStock: 1 });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "ADMIN_REQUIRED");
});

test("19. admin can create a drop over HTTP", async () => {
  const admin = await User.create({
    username: `adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    passwordHash,
    role: "admin",
  });
  testUserIds.push(admin.id);
  const token = signToken({
    id: admin.id,
    username: admin.username,
    role: "admin",
  });
  const created = await request(app)
    .post("/api/drops")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `Http ${Date.now()}`, priceCents: 2500, totalStock: 4 });
  assert.equal(created.status, 201);
  assert.equal(created.body.drop.availableStock, 4);
  testDropIds.push(created.body.drop.id);
});

test("20. unknown API route is 404 with code", async () => {
  const res = await request(app).get("/api/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.code, "NOT_FOUND");
});

test("21. alice hold is not returned to bob; bob sees stock only", async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const aliceRes = await request(app)
    .post("/api/auth/register")
    .send({ username: `alice_${suffix}`, password: "password123" });
  const bobRes = await request(app)
    .post("/api/auth/register")
    .send({ username: `bob_${suffix}`, password: "password123" });
  assert.equal(aliceRes.status, 201);
  assert.equal(bobRes.status, 201);
  testUserIds.push(aliceRes.body.user.id);
  testUserIds.push(bobRes.body.user.id);

  const aliceToken = aliceRes.body.token as string;
  const bobToken = bobRes.body.token as string;
  const drop = await makeDrop(3, "Isolation");

  const reserved = await request(app)
    .post(`/api/drops/${drop.id}/reserve`)
    .set("Authorization", `Bearer ${aliceToken}`);
  assert.equal(reserved.status, 201);
  assert.equal(reserved.body.availableStock, 2);
  assert.equal(reserved.body.reservation.userId, aliceRes.body.user.id);

  const aliceHolds = await request(app)
    .get("/api/me/reservations")
    .set("Authorization", `Bearer ${aliceToken}`);
  assert.equal(aliceHolds.status, 200);
  assert.equal(aliceHolds.body.reservations.length, 1);
  assert.equal(aliceHolds.body.reservations[0].id, reserved.body.reservation.id);

  const bobHolds = await request(app)
    .get("/api/me/reservations")
    .set("Authorization", `Bearer ${bobToken}`);
  assert.equal(bobHolds.status, 200);
  assert.equal(bobHolds.body.reservations.length, 0);

  const bobDrops = await request(app)
    .get("/api/drops")
    .set("Authorization", `Bearer ${bobToken}`);
  const listed = bobDrops.body.drops.find((row: { id: string }) => row.id === drop.id);
  assert.ok(listed);
  assert.equal(listed.availableStock, 2);

  const steal = await request(app)
    .post(`/api/reservations/${reserved.body.reservation.id}/purchase`)
    .set("Authorization", `Bearer ${bobToken}`);
  assert.equal(steal.status, 403);
  assert.equal(steal.body.code, "FORBIDDEN");

  const serviceAlice = await listMyReservations(aliceRes.body.user.id);
  const serviceBob = await listMyReservations(bobRes.body.user.id);
  assert.equal(serviceAlice.length, 1);
  assert.equal(serviceBob.length, 0);
});


