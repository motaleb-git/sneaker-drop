/**
 * One-time script to remove test-generated drops left behind by assessment
 * and bench scripts. Safe to run against a live dev database — only removes
 * drops whose names match the auto-generated patterns used by the test suite.
 *
 * Usage:  npx tsx src/scripts/cleanTestData.ts
 */
import { QueryTypes } from "sequelize";
import { connectDb, sequelize } from "../db/sequelize";

const TEST_NAME_PATTERNS = [
  "Assessment %",
  "Race %",
  "Feed %",
  "Stress %",
  "Bench %",
  "Isolation %",
  "Http %",
  "Live %",
  "Concurrency Check",
];

async function main(): Promise<void> {
  await connectDb();

  // Find all matching test drops
  const whereClauses = TEST_NAME_PATTERNS.map((_, i) => `name LIKE :p${i}`).join(" OR ");
  const replacements = Object.fromEntries(
    TEST_NAME_PATTERNS.map((p, i) => [`p${i}`, p])
  );

  const rows = await sequelize.query<{ id: string; name: string }>(
    `SELECT id, name FROM drops WHERE ${whereClauses} ORDER BY created_at DESC`,
    { replacements, type: QueryTypes.SELECT }
  );

  if (rows.length === 0) {
    console.log("No test drops found — database is already clean.");
    await sequelize.close();
    return;
  }

  console.log(`Found ${rows.length} test drop(s) to remove:`);
  rows.forEach((r) => console.log(`  • ${r.name} (${r.id})`));

  const dropIds = rows.map((r) => r.id);
  const idPlaceholders = dropIds.map((_, i) => `:id${i}`).join(", ");
  const idReplacements = Object.fromEntries(dropIds.map((id, i) => [`id${i}`, id]));

  await sequelize.transaction(async (t) => {
    // Reset stock so the deferred invariant trigger is satisfied on delete
    await sequelize.query(
      `UPDATE drops SET available_stock = total_stock WHERE id IN (${idPlaceholders})`,
      { replacements: idReplacements, transaction: t }
    );
    // CASCADE removes dependent reservations and purchases
    await sequelize.query(
      `DELETE FROM drops WHERE id IN (${idPlaceholders})`,
      { replacements: idReplacements, transaction: t }
    );
  });

  console.log(`\nRemoved ${rows.length} test drop(s) and all dependent records.`);
  console.log("Database is clean.");
  await sequelize.close();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
