import { randomUUID } from "crypto";
import { DatabaseError, Op, QueryTypes, UniqueConstraintError } from "sequelize";
import { env } from "../config/env";
import { sequelize } from "../db/sequelize";
import { AppError } from "../middleware/error";
import { Reservation } from "../models";
import { emitPurchaseCreated, emitStockUpdated } from "../sockets/hub";
import { invalidateDropCache } from "./dropCache";

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof UniqueConstraintError) return true;
  const code = (err as DatabaseError | undefined)?.original
    ? ((err as DatabaseError).original as { code?: string }).code
    : undefined;
  return code === "23505";
}

export type ReservationDto = {
  id: string;
  dropId: string;
  userId: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type DropLockRow = {
  id: string;
  available_stock: number;
};

function toReservationDto(row: Reservation): ReservationDto {
  return {
    id: row.id,
    dropId: row.dropId,
    userId: row.userId,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMyReservations(
  userId: string
): Promise<ReservationDto[]> {
  const rows = await Reservation.findAll({
    where: {
      userId,
      status: "pending",
      expiresAt: { [Op.gt]: sequelize.literal("NOW()") },
    },
    order: [["createdAt", "DESC"]],
  });
  return rows.map(toReservationDto);
}

export async function reserveDrop(
  dropId: string,
  userId: string
): Promise<{ reservation: ReservationDto; availableStock: number }> {
  const result = await sequelize.transaction(async (transaction) => {
    const existing = await Reservation.findOne({
      where: { dropId, userId, status: "pending" },
      transaction,
    });
    if (existing) {
      throw new AppError(
        409,
        "You already have an active reservation for this drop",
        "ALREADY_RESERVED"
      );
    }

    const [updated] = await sequelize.query<DropLockRow>(
      `
      UPDATE drops
      SET available_stock = available_stock - 1
      WHERE id = :dropId
        AND available_stock > 0
        AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())
      RETURNING id, available_stock
      `,
      {
        replacements: { dropId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    if (!updated) {
      const drop = await sequelize.query<{
        id: string;
        not_live: boolean;
        ended: boolean;
      }>(
        `
        SELECT
          id,
          starts_at > NOW() AS not_live,
          (ends_at IS NOT NULL AND ends_at <= NOW()) AS ended
        FROM drops
        WHERE id = :dropId
        `,
        {
          replacements: { dropId },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      if (!drop[0]) {
        throw new AppError(404, "Drop not found", "NOT_FOUND");
      }
      if (drop[0].not_live) {
        throw new AppError(400, "This drop is not live yet", "NOT_LIVE");
      }
      if (drop[0].ended) {
        throw new AppError(400, "This drop has ended", "ENDED");
      }
      throw new AppError(409, "Sold out", "SOLD_OUT");
    }

    try {
      const reservationId = randomUUID();
      const [row] = await sequelize.query<{
        id: string;
        drop_id: string;
        user_id: string;
        status: string;
        expires_at: Date;
        created_at: Date;
      }>(
        `
        INSERT INTO reservations (id, drop_id, user_id, status, expires_at, created_at)
        VALUES (
          :reservationId,
          :dropId,
          :userId,
          'pending',
          NOW() + make_interval(secs => CAST(:ttlSeconds AS integer)),
          NOW()
        )
        RETURNING id, drop_id, user_id, status, expires_at, created_at
        `,
        {
          replacements: {
            reservationId,
            dropId,
            userId,
            ttlSeconds: env.RESERVATION_TTL_SECONDS,
          },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      return {
        reservation: {
          id: row.id,
          dropId: row.drop_id,
          userId: row.user_id,
          status: row.status,
          expiresAt: new Date(row.expires_at).toISOString(),
          createdAt: new Date(row.created_at).toISOString(),
        },
        availableStock: Number(updated.available_stock),
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError(
          409,
          "You already have an active reservation for this drop",
          "ALREADY_RESERVED"
        );
      }
      throw err;
    }
  });

  invalidateDropCache();
  emitStockUpdated(dropId, result.availableStock);
  return result;
}

type PurchaseResult =
  | {
      kind: "purchased";
      purchaseId: string;
      dropId: string;
      createdAt: string;
      username: string;
    }
  | { kind: "expired"; dropId?: string; availableStock?: number };

export async function completePurchase(
  reservationId: string,
  userId: string
): Promise<{ purchaseId: string; dropId: string; createdAt: string; username: string }> {
  const result = await sequelize.transaction(async (transaction): Promise<PurchaseResult> => {
    const [locked] = await sequelize.query<{
      id: string;
      drop_id: string;
      user_id: string;
      status: string;
      is_expired: boolean;
    }>(
      `
      SELECT
        id,
        drop_id,
        user_id,
        status,
        expires_at <= NOW() AS is_expired
      FROM reservations
      WHERE id = :reservationId
      FOR UPDATE
      `,
      {
        replacements: { reservationId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    if (!locked) {
      throw new AppError(404, "Reservation not found", "NOT_FOUND");
    }
    if (locked.user_id !== userId) {
      throw new AppError(
        403,
        "You can only purchase your own reservation",
        "FORBIDDEN"
      );
    }
    if (locked.status === "purchased") {
      throw new AppError(409, "Already purchased", "ALREADY_PURCHASED");
    }
    if (locked.status === "expired" || locked.is_expired) {
      if (locked.status === "pending") {
        await sequelize.query(
          `UPDATE reservations SET status = 'expired' WHERE id = :reservationId`,
          { replacements: { reservationId }, transaction }
        );
        const [restored] = await sequelize.query<{ available_stock: number }>(
          `
          UPDATE drops
          SET available_stock = available_stock + 1
          WHERE id = :dropId
          RETURNING available_stock
          `,
          {
            replacements: { dropId: locked.drop_id },
            type: QueryTypes.SELECT,
            transaction,
          }
        );
        return {
          kind: "expired",
          dropId: locked.drop_id,
          availableStock: Number(restored.available_stock),
        };
      }
      return { kind: "expired" };
    }

    await sequelize.query(
      `UPDATE reservations SET status = 'purchased' WHERE id = :reservationId`,
      { replacements: { reservationId }, transaction }
    );

    const purchaseId = randomUUID();
    let purchase: { id: string; created_at: Date };
    try {
      const [row] = await sequelize.query<{
        id: string;
        created_at: Date;
      }>(
        `
        INSERT INTO purchases (id, drop_id, user_id, reservation_id, created_at)
        VALUES (:purchaseId, :dropId, :userId, :reservationId, NOW())
        RETURNING id, created_at
        `,
        {
          replacements: {
            purchaseId,
            dropId: locked.drop_id,
            userId,
            reservationId,
          },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      purchase = row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError(409, "Already purchased", "ALREADY_PURCHASED");
      }
      throw err;
    }

    const [buyer] = await sequelize.query<{ username: string }>(
      `SELECT username FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    return {
      kind: "purchased",
      purchaseId: purchase.id,
      dropId: locked.drop_id,
      createdAt: new Date(purchase.created_at).toISOString(),
      username: buyer?.username ?? "unknown",
    };
  });

  if (result.kind === "expired") {
    if (result.dropId != null && result.availableStock != null) {
      invalidateDropCache();
      emitStockUpdated(result.dropId, result.availableStock);
    }
    throw new AppError(409, "Reservation has expired", "RESERVATION_EXPIRED");
  }

  invalidateDropCache();
  emitPurchaseCreated({
    dropId: result.dropId,
    username: result.username,
    createdAt: result.createdAt,
  });

  return {
    purchaseId: result.purchaseId,
    dropId: result.dropId,
    createdAt: result.createdAt,
    username: result.username,
  };
}
