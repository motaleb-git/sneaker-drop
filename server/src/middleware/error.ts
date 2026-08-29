import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  ConnectionAcquireTimeoutError,
  ConnectionError,
  ConnectionRefusedError,
  TimeoutError,
  UniqueConstraintError,
  ValidationError,
} from "sequelize";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

function fieldMessages(err: ZodError): Record<string, string> {
  const flat = err.flatten().fieldErrors;
  const fields: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages?.[0]) fields[key] = messages[0];
  }
  return fields;
}

function withRequestId(
  req: Request,
  body: Record<string, unknown>
): Record<string, unknown> {
  if (req.requestId) body.requestId = req.requestId;
  return body;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json(
      withRequestId(req, {
        error: err.message,
        code: err.code,
      })
    );
    return;
  }

  if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status?: number }).status === 400
  ) {
    res.status(400).json(
      withRequestId(req, {
        error: "The request body is not valid JSON.",
        code: "INVALID_JSON",
      })
    );
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json(
      withRequestId(req, {
        error: "Please check the form and try again.",
        code: "VALIDATION_ERROR",
        fields: fieldMessages(err),
      })
    );
    return;
  }

  if (err instanceof UniqueConstraintError) {
    res.status(409).json(
      withRequestId(req, {
        error: "That record already exists.",
        code: "UNIQUE_CONSTRAINT",
      })
    );
    return;
  }

  if (err instanceof ValidationError) {
    const fields: Record<string, string> = {};
    for (const item of err.errors) {
      if (item.path && item.message) fields[item.path] = item.message;
    }
    res.status(400).json(
      withRequestId(req, {
        error: "Please check the form and try again.",
        code: "VALIDATION_ERROR",
        fields,
      })
    );
    return;
  }

  if (
    err instanceof ConnectionError ||
    err instanceof ConnectionRefusedError ||
    err instanceof ConnectionAcquireTimeoutError ||
    err instanceof TimeoutError
  ) {
    console.error(`[${req.requestId ?? "-"} ${req.method} ${req.path}] database unavailable`, err);
    res.status(503).json(
      withRequestId(req, {
        error: "The service is temporarily unavailable.",
        code: "SERVICE_UNAVAILABLE",
      })
    );
    return;
  }

  console.error(`[${req.requestId ?? "-"} ${req.method} ${req.path}]`, err);
  res.status(500).json(
    withRequestId(req, {
      error: "Something went wrong. Please try again.",
      code: "INTERNAL",
    })
  );
}
