import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { sequelize } from "./db/sequelize";
import { mountSwagger } from "./docs/swagger";
import { asyncHandler, requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { requestId } from "./middleware/requestId";
import { authRouter } from "./routes/auth";
import { dropsRouter } from "./routes/drops";
import { reservationsRouter } from "./routes/reservations";
import { listMyReservations } from "./services/reservationService";

export function createApp() {
  const app = express();
  const origins = env.CLIENT_ORIGIN.split(",").map((s) => s.trim());

  app.set("trust proxy", 1);
  app.use(requestId);
  const helmetMw = helmet();
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/docs")) {
      next();
      return;
    }
    helmetMw(req, res, next);
  });
  app.use(
    cors({
      origin: origins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(compression());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      try {
        await sequelize.query("SELECT 1");
        res.json({
          ok: true,
          db: "up",
          reservationTtlSeconds: env.RESERVATION_TTL_SECONDS,
        });
      } catch {
        res.status(503).json({
          ok: false,
          db: "down",
          code: "SERVICE_UNAVAILABLE",
          requestId: _req.requestId,
        });
      }
    })
  );

  mountSwagger(app);

  app.use("/api/auth", authRouter);
  app.use("/api/drops", dropsRouter);
  app.use("/api/reservations", reservationsRouter);
  app.get(
    "/api/me/reservations",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const reservations = await listMyReservations(req.user!.id);
      res.json({ reservations });
    })
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: "Not found",
      code: "NOT_FOUND",
      requestId: _req.requestId,
    });
  });

  app.use(errorHandler);
  return app;
}
