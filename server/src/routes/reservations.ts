import { Router } from "express";
import { asyncHandler, requireAuth } from "../middleware/auth";
import { mutationLimiter } from "../middleware/rateLimit";
import { validateUuidParam } from "../middleware/validate";
import {
  completePurchase,
} from "../services/reservationService";

export const reservationsRouter = Router();

reservationsRouter.post(
  "/:id/purchase",
  validateUuidParam("id"),
  requireAuth,
  mutationLimiter,
  asyncHandler(async (req, res) => {
    const result = await completePurchase(req.params.id, req.user!.id);
    res.status(201).json(result);
  })
);
