import { connectDb, sequelize } from "../db/sequelize";
import { Drop } from "../models";
import { listDrops } from "../services/dropService";

async function main(): Promise<void> {
  await connectDb();
  await Drop.create({
    name: `Bench ${Date.now()}`,
    priceCents: 1000,
    totalStock: 10,
    availableStock: 10,
    startsAt: new Date(Date.now() - 1000),
    endsAt: null,
  });

  const rounds = 80;
  const started = Date.now();
  for (let i = 0; i < rounds; i += 1) {
    await listDrops();
  }
  const elapsed = Date.now() - started;
  console.log(`listDrops x${rounds}: ${elapsed}ms total, ${(elapsed / rounds).toFixed(2)}ms avg`);
  await sequelize.close();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
