import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "./error";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateUuidParam(name: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!UUID_RE.test(req.params[name] ?? "")) {
      next(new AppError(400, "Invalid id", "VALIDATION_ERROR"));
      return;
    }
    next();
  };
}
