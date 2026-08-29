import { Sequelize } from "sequelize";
import { env } from "../config/env";

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: "postgres",
  logging: env.NODE_ENV === "development" ? false : false,
  pool: {
    max: 10,
    min: 1,
    acquire: 15_000,
    idle: 10_000,
  },
  dialectOptions:
    env.DATABASE_URL.includes("sslmode=require") ||
    env.DATABASE_URL.includes("neon.tech")
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
});

export async function connectDb(): Promise<void> {
  await sequelize.authenticate();
  const { initModels } = await import("../models");
  initModels();
  const { runMigrations } = await import("./migrate");
  await runMigrations();
  if (env.SYNC_SCHEMA) {
    await sequelize.sync();
  }
}
