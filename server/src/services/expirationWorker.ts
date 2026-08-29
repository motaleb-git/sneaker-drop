import { QueryTypes } from "sequelize";
import { sequelize } from "../db/sequelize";
import {
  emitReservationExpired,
  emitStockUpdated,
} from "../sockets/hub";
import { invalidateDropCache } from "./dropCache";

type ExpiredRow = {
  reservationId: string;
  dropId: string;
  userId: string;
  availableStock: number;
};

const TICK_MS = 1000;

export async function expireReservations(): Promise<ExpiredRow[]> {
  const rows = await sequelize.query<ExpiredRow>(
    `
    WITH expired AS (
      UPDATE reservations
      SET status = 'expired'
      WHERE id IN (
        SELECT id FROM reservations
        WHERE status = 'pending' AND expires_at <= NOW()
        FOR UPDATE SKIP LOCKED
        LIMIT 100
      )
      RETURNING id, drop_id, user_id
    ),
    counts AS (
      SELECT drop_id, COUNT(*)::int AS n FROM expired GROUP BY drop_id
    ),
    updated AS (
      UPDATE drops d
      SET available_stock = d.available_stock + c.n
      FROM counts c
      WHERE d.id = c.drop_id
      RETURNING d.id, d.available_stock
    )
    SELECT
      e.id AS "reservationId",
      e.drop_id AS "dropId",
      e.user_id AS "userId",
      u.available_stock AS "availableStock"
    FROM expired e
    JOIN updated u ON u.id = e.drop_id
    `,
    { type: QueryTypes.SELECT }
  );

  if (rows.length === 0) return rows;

  invalidateDropCache();
  const seenDrops = new Set<string>();
  for (const row of rows) {
    emitReservationExpired({
      reservationId: row.reservationId,
      dropId: row.dropId,
      availableStock: Number(row.availableStock),
    });
    if (!seenDrops.has(row.dropId)) {
      seenDrops.add(row.dropId);
      emitStockUpdated(row.dropId, Number(row.availableStock));
    }
  }
  return rows;
}

export function startExpirationWorker(): NodeJS.Timeout {
  let running = false;

  const tick = (): void => {
    if (running) return;
    running = true;
    void expireReservations()
      .catch((err) => {
        console.error("Expiration worker failed", err);
      })
      .finally(() => {
        running = false;
      });
  };

  tick();
  return setInterval(tick, TICK_MS);
}
