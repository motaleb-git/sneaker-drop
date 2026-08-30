import type { Request } from "express";

/** Authenticated user id, otherwise client IP (requires `trust proxy`). */
export function clientKey(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip ?? "unknown"}`;
}
