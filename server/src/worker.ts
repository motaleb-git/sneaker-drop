import { env } from "./config/env";
import { connectDb, sequelize } from "./db/sequelize";
import { startExpirationWorker } from "./services/expirationWorker";

async function main(): Promise<void> {
  await connectDb();
  const worker = startExpirationWorker();
  console.log(
    `Expiry worker running (ttl=${env.RESERVATION_TTL_SECONDS}s). This process does not serve HTTP.`
  );

  const shutdown = (): void => {
    clearInterval(worker);
    void sequelize.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
