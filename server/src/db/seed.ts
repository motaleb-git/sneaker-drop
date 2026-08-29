import bcrypt from "bcrypt";
import { connectDb, sequelize } from "./sequelize";
import { Drop, User } from "../models";

async function seed(): Promise<void> {
  await connectDb();

  const passwordHash = await bcrypt.hash("password123", 10);

  const [alice] = await User.findOrCreate({
    where: { username: "alice" },
    defaults: { username: "alice", passwordHash, role: "admin" },
  });
  if (alice.role !== "admin") {
    await alice.update({ role: "admin" });
  }
  const [bob] = await User.findOrCreate({
    where: { username: "bob" },
    defaults: { username: "bob", passwordHash, role: "user" },
  });

  const now = Date.now();

  const existing = await Drop.count();
  if (existing === 0) {
    await Drop.bulkCreate([
      {
        name: "Air Jordan 1 Retro High OG",
        priceCents: 18000,
        totalStock: 8,
        availableStock: 8,
        startsAt: new Date(now - 60_000),
        endsAt: null,
      },
      {
        name: "Nike Dunk Low — Last Pair",
        priceCents: 12000,
        totalStock: 1,
        availableStock: 1,
        startsAt: new Date(now - 60_000),
        endsAt: null,
      },
      {
        name: "Yeezy Slide — Upcoming",
        priceCents: 9000,
        totalStock: 25,
        availableStock: 25,
        startsAt: new Date(now + 10 * 60_000),
        endsAt: null,
      },
    ]);
  }

  console.log("Seed complete.");
  console.log("Users: alice (admin) / bob (user)  password: password123");
  console.log(`User ids: ${alice.id}, ${bob.id}`);

  await sequelize.close();
}

void seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
