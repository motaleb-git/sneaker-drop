import type { Request, Response } from "express";
import { env } from "../config/env";

export const ACCESS_COOKIE = "access_token";

function sameSiteFlag(): string {
  const value = env.COOKIE_SAMESITE;
  return `SameSite=${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function cookieFlags(): string {
  const parts = ["Path=/", "HttpOnly"];
  if (env.COOKIE_SECURE) parts.push("Secure");
  parts.push(sameSiteFlag());
  parts.push(`Max-Age=${60 * 60 * 24 * 7}`);
  return parts.join("; ");
}

export function setAccessCookie(res: Response, token: string): void {
  res.append("Set-Cookie", `${ACCESS_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags()}`);
}

export function clearAccessCookie(res: Response): void {
  const parts = ["Path=/", "HttpOnly", "Max-Age=0"];
  if (env.COOKIE_SECURE) parts.push("Secure");
  parts.push(sameSiteFlag());
  res.append("Set-Cookie", `${ACCESS_COOKIE}=; ${parts.join("; ")}`);
}

export function readAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return tokenFromCookieHeader(req.headers.cookie);
}

export function tokenFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === ACCESS_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
