import type { NextFunction, Request, Response } from "express";
import { z, type ZodSchema } from "zod";
import { AppError } from "./error";

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

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as Request["params"];
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Validates a route param is a UUID; preserves legacy 400 "Invalid id" response shape. */
export function validateUuidParam(name: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.params[name] ?? "";
    const result = z.string().uuid().safeParse(value);
    if (!result.success) {
      next(new AppError(400, "Invalid id", "VALIDATION_ERROR"));
      return;
    }
    next();
  };
}
