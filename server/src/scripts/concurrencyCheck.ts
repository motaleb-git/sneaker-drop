import bcrypt from "bcrypt";
import { QueryTypes } from "sequelize";
import { connectDb, sequelize } from "../db/sequelize";
import { Drop, User } from "../models";
import { reserveDrop } from "../services/reservationService";

async function main(): Promise<void> {
  await connectDb();

  const passwordHash = await bcrypt.hash("password123", 10);
  const users = [];
  for (let i = 0; i < 8; i += 1) {
    const [user] = await User.findOrCreate({
      where: { username: `race_${i}` },
      defaults: { username: `race_${i}`, passwordHash },
    });
    users.push(user);
  }

  const drop = await Drop.create({
    name: "Concurrency Check",
    priceCents: 1000,
    totalStock: 1,
    availableStock: 1,
    startsAt: new Date(Date.now() - 1000),
    endsAt: null,
  });

  const results = await Promise.allSettled(
    users.map((user) => reserveDrop(drop.id, user.id))
  );

  const wins = results.filter((r) => r.status === "fulfilled").length;
  const losses = results.filter((r) => r.status === "rejected").length;
  const rows = await sequelize.query<{ available_stock: number }>(
    `SELECT available_stock FROM drops WHERE id = :id`,
    { replacements: { id: drop.id }, type: QueryTypes.SELECT }
  );
  const stock = Number(rows[0]?.available_stock);

  console.log(`wins=${wins} losses=${losses} stock=${stock}`);

  await sequelize.close();

  if (wins !== 1 || losses !== 7 || stock !== 0) {
    console.error("Concurrency check failed");
    process.exit(1);
  }
  console.log("Concurrency check passed: 1 winner, stock 0");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
