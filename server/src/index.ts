import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb, sequelize } from "./db/sequelize";
import { startExpirationWorker } from "./services/expirationWorker";
import { attachSockets } from "./sockets";

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  const io = attachSockets(server);
  const worker = env.START_EXPIRY_WORKER ? startExpirationWorker() : null;
  if (!worker) {
    console.log("START_EXPIRY_WORKER=false — run `npm run worker` in a separate process");
  }

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${env.PORT} is already in use`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(env.PORT, () => {
    console.log(`API + WebSocket listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (): void => {
    if (worker) clearInterval(worker);
    io.close();
    server.close(() => {
      void sequelize.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
