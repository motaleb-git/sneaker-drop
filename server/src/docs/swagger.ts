import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "../config/env";
import { openApiSpec } from "./openapi";

export function mountSwagger(app: Express): void {
  if (!env.SWAGGER_ENABLED) return;

  app.get("/api/docs.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "Sneaker Drop API",
      swaggerOptions: { persistAuthorization: true },
    })
  );
}
