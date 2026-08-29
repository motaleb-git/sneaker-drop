import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { readAccessToken } from "../lib/cookies";
import { AppError } from "./error";

export type UserRole = "user" | "admin";

export type JwtPayload = {
  sub: string;
  username: string;
  role: UserRole;
};

export function signToken(user: {
  id: string;
  username: string;
  role?: UserRole;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role ?? "user",
    } satisfies JwtPayload,
    env.JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" }
  );
}

export function verifyToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;
  return {
    sub: payload.sub,
    username: payload.username,
    role: payload.role === "admin" ? "admin" : "user",
  };
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = readAccessToken(req);
  if (!token) {
    next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token", "UNAUTHORIZED"));
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
    return;
  }
  if (req.user.role !== "admin") {
    next(new AppError(403, "Only admins can create drops", "ADMIN_REQUIRED"));
    return;
  }
  next();
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}
