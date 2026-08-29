import { QueryTypes } from "sequelize";
import { z } from "zod";
import { sequelize } from "../db/sequelize";
import { Drop } from "../models";
import { AppError } from "../middleware/error";
import { emitDropCreated } from "../sockets/hub";
import { cachedListDrops, invalidateDropCache } from "./dropCache";

export const createDropSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(0),
  totalStock: z.number().int().min(1).max(1_000_000),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export type CreateDropInput = z.infer<typeof createDropSchema>;

export type RecentPurchaser = {
  username: string;
  createdAt: string;
};

export type DropDto = {
  id: string;
  name: string;
  priceCents: number;
  totalStock: number;
  availableStock: number;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  recentPurchasers: RecentPurchaser[];
};

type DropRow = {
  id: string;
  name: string;
  priceCents: number;
  totalStock: number;
  availableStock: number;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  recentPurchasers: RecentPurchaser[] | string | null;
};

function mapDrop(row: DropRow): DropDto {
  const recent =
    typeof row.recentPurchasers === "string"
      ? (JSON.parse(row.recentPurchasers) as RecentPurchaser[])
      : (row.recentPurchasers ?? []);

  return {
    id: row.id,
    name: row.name,
    priceCents: Number(row.priceCents),
    totalStock: Number(row.totalStock),
    availableStock: Number(row.availableStock),
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    recentPurchasers: recent.map((p) => ({
      username: p.username,
      createdAt: new Date(p.createdAt).toISOString(),
    })),
  };
}

async function queryDrops(): Promise<DropDto[]> {
  const rows = await sequelize.query<DropRow>(
    `
    SELECT
      d.id,
      d.name,
      d.price_cents AS "priceCents",
      d.total_stock AS "totalStock",
      d.available_stock AS "availableStock",
      d.starts_at AS "startsAt",
      d.ends_at AS "endsAt",
      d.created_at AS "createdAt",
      COALESCE(p.recent, '[]'::json) AS "recentPurchasers"
    FROM drops d
    LEFT JOIN LATERAL (
      SELECT json_agg(x) AS recent
      FROM (
        SELECT u.username, p.created_at AS "createdAt"
        FROM purchases p
        JOIN users u ON u.id = p.user_id
        WHERE p.drop_id = d.id
        ORDER BY p.created_at DESC
        LIMIT 3
      ) x
    ) p ON true
    ORDER BY d.starts_at DESC
    LIMIT 100
    `,
    { type: QueryTypes.SELECT }
  );

  return rows.map(mapDrop);
}

export async function listDrops(): Promise<DropDto[]> {
  return cachedListDrops(queryDrops);
}

export async function createDrop(input: CreateDropInput): Promise<DropDto> {
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;

  if (Number.isNaN(startsAt.getTime())) {
    throw new AppError(400, "Invalid startsAt", "VALIDATION_ERROR");
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw new AppError(400, "Invalid endsAt", "VALIDATION_ERROR");
  }
  if (endsAt && endsAt <= startsAt) {
    throw new AppError(400, "endsAt must be after startsAt", "VALIDATION_ERROR");
  }

  const drop = await Drop.create({
    name: input.name,
    priceCents: input.priceCents,
    totalStock: input.totalStock,
    availableStock: input.totalStock,
    startsAt,
    endsAt,
  });

  const dto: DropDto = {
    id: drop.id,
    name: drop.name,
    priceCents: drop.priceCents,
    totalStock: drop.totalStock,
    availableStock: drop.availableStock,
    startsAt: drop.startsAt.toISOString(),
    endsAt: drop.endsAt ? drop.endsAt.toISOString() : null,
    createdAt: drop.createdAt.toISOString(),
    recentPurchasers: [],
  };

  invalidateDropCache();
  emitDropCreated(dto);
  return dto;
}
