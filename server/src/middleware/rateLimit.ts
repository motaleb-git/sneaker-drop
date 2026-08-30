import type { Request, Response } from "express";
import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../config/env";
import { clientKey } from "../lib/clientKey";

type LimitMessage = { error: string; code: "RATE_LIMITED" };

const ipKey = (req: Request): string => `ip:${req.ip ?? "unknown"}`;

function rateLimitHandler(
  req: Request,
  res: Response,
  _next: () => void,
  options: Options
): void {
  const message = options.message as LimitMessage | undefined;
  res.status(429).json({
    error: message?.error ?? "Too many requests",
    code: "RATE_LIMITED",
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });
}

function createLimiter(options: Partial<Options> & Pick<Options, "max" | "message">): RateLimitRequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...options,
  });
}

/** Login / register — IP keyed to slow credential stuffing. */
export const authLimiter = createLimiter({
  max: env.RATE_LIMIT_AUTH_MAX,
  keyGenerator: ipKey,
  message: { error: "Too many auth attempts", code: "RATE_LIMITED" },
});

/** Public reads — IP keyed. */
export const readLimiter = createLimiter({
  max: env.RATE_LIMIT_READ_MAX,
  keyGenerator: ipKey,
  message: { error: "Too many requests", code: "RATE_LIMITED" },
});

/** Mutations (create drop, purchase) — user keyed after auth. */
export const mutationLimiter = createLimiter({
  max: env.RATE_LIMIT_MUTATION_MAX,
  keyGenerator: clientKey,
  message: { error: "Too many attempts", code: "RATE_LIMITED" },
});

/** Hot path: reserve — per-user cap; stock correctness stays in Postgres. */
export const reserveLimiter = createLimiter({
  max: env.RATE_LIMIT_RESERVE_MAX,
  keyGenerator: clientKey,
  message: { error: "Too many reserve attempts", code: "RATE_LIMITED" },
});
