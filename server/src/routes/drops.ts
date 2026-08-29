import { Router } from "express";
import { env } from "../config/env";
import { asyncHandler, requireAdmin, requireAuth } from "../middleware/auth";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit";
import { validateBody, validateUuidParam } from "../middleware/validate";
import {
  createDrop,
  createDropSchema,
  listDrops,
} from "../services/dropService";
import { reserveDrop } from "../services/reservationService";

export const dropsRouter = Router();

dropsRouter.get(
  "/",
  readLimiter,
  asyncHandler(async (_req, res) => {
    const drops = await listDrops();
    res.set("Cache-Control", "no-store");
    res.json({
      drops,
      reservationTtlSeconds: env.RESERVATION_TTL_SECONDS,
    });
  })
);

dropsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  mutationLimiter,
  validateBody(createDropSchema),
  asyncHandler(async (req, res) => {
    const drop = await createDrop(req.body);
    res.status(201).json({ drop });
  })
);

dropsRouter.post(
  "/:id/reserve",
  validateUuidParam("id"),
  requireAuth,
  mutationLimiter,
  asyncHandler(async (req, res) => {
    const result = await reserveDrop(req.params.id, req.user!.id);
    res.status(201).json(result);
  })
);
