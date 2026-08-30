import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProd = NODE_ENV === "production";

function required(name: string, devFallback?: string): string {
  const value = process.env[name] ?? (isProd ? undefined : devFallback);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtSecret = required("JWT_SECRET", "dev-only-change-me");
if (isProd && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
if (isProd && clientOrigin.split(",").some((o) => o.trim() === "*")) {
  throw new Error("CLIENT_ORIGIN cannot be * when credentials are enabled");
}

const ttl = Number(process.env.RESERVATION_TTL_SECONDS ?? 60);
if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3600) {
  throw new Error("RESERVATION_TTL_SECONDS must be an integer between 1 and 3600");
}

const cookieSameSite = (process.env.COOKIE_SAMESITE ?? (isProd ? "none" : "lax")).toLowerCase();
if (cookieSameSite !== "lax" && cookieSameSite !== "strict" && cookieSameSite !== "none") {
  throw new Error("COOKIE_SAMESITE must be lax, strict, or none");
}

function rateLimitMax(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
if (!Number.isInteger(rateLimitWindowMs) || rateLimitWindowMs < 1000 || rateLimitWindowMs > 3_600_000) {
  throw new Error("RATE_LIMIT_WINDOW_MS must be an integer between 1000 and 3600000");
}

export const env = {
  DATABASE_URL: required(
    "DATABASE_URL",
    "postgres://sneaker:sneaker@localhost:5432/sneaker_drop"
  ),
  JWT_SECRET: jwtSecret,
  PORT: Number(process.env.PORT ?? 4000),
  CLIENT_ORIGIN: clientOrigin,
  RESERVATION_TTL_SECONDS: ttl,
  NODE_ENV,
  SWAGGER_ENABLED: (process.env.SWAGGER_ENABLED ?? (isProd ? "false" : "true")) === "true",
  SYNC_SCHEMA: process.env.SYNC_SCHEMA === "true",
  START_EXPIRY_WORKER: (process.env.START_EXPIRY_WORKER ?? "true") === "true",
  COOKIE_SECURE: (process.env.COOKIE_SECURE ?? (isProd ? "true" : "false")) === "true",
  COOKIE_SAMESITE: cookieSameSite as "lax" | "strict" | "none",
  RATE_LIMIT_WINDOW_MS: rateLimitWindowMs,
  RATE_LIMIT_AUTH_MAX: rateLimitMax("RATE_LIMIT_AUTH_MAX", 10, 1000),
  RATE_LIMIT_READ_MAX: rateLimitMax("RATE_LIMIT_READ_MAX", 120, 10_000),
  RATE_LIMIT_MUTATION_MAX: rateLimitMax("RATE_LIMIT_MUTATION_MAX", 20, 1000),
  RATE_LIMIT_RESERVE_MAX: rateLimitMax("RATE_LIMIT_RESERVE_MAX", 30, 1000),
  /** Optional. Live events + drop-list cache across processes. Never used for stock. */
  REDIS_URL: process.env.REDIS_URL?.trim() || undefined,
};
