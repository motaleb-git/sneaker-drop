import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.header("x-request-id");
  const id =
    incoming && /^[\w-]{8,128}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.set("X-Request-Id", id);
  next();
}
