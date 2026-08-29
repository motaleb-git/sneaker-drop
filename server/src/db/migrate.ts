import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize";
import { id as id001, statements as sql001 } from "./migrations/001_init";
import { id as id002, statements as sql002 } from "./migrations/002_user_role";
import { id as id003, statements as sql003 } from "./migrations/003_stock_invariant";

type Migration = { id: string; statements: string[] };

const migrations: Migration[] = [
  { id: id001, statements: sql001 },
  { id: id002, statements: sql002 },
  { id: id003, statements: sql003 },
];

export async function runMigrations(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await sequelize.query<{ id: string }>(
    `SELECT id FROM schema_migrations`,
    { type: QueryTypes.SELECT }
  );
  const done = new Set(applied.map((row) => row.id));

  for (const migration of migrations) {
    if (done.has(migration.id)) continue;
    await sequelize.transaction(async (transaction) => {
      for (const statement of migration.statements) {
        await sequelize.query(statement, { transaction });
      }
      await sequelize.query(`INSERT INTO schema_migrations (id) VALUES (:id)`, {
        replacements: { id: migration.id },
        transaction,
      });
    });
    console.log(`Applied migration ${migration.id}`);
  }
}
