import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { createPostgresDatabase, type DatabaseHandle } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveMigrationsDir(): string {
  const sameDir = join(__dirname, 'migrations');
  if (existsSync(sameDir)) {
    return sameDir;
  }
  const srcDir = join(__dirname, '..', 'src', 'migrations');
  if (existsSync(srcDir)) {
    return srcDir;
  }
  throw new Error(`Unable to locate SQL migrations directory from ${__dirname}`);
}

export async function runSqlMigrations(handle: DatabaseHandle): Promise<string[]> {
  const migrationsDir = resolveMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await handle.executeRawSql(`
    CREATE TABLE IF NOT EXISTS "_proofline_migrations" (
      "filename" varchar(255) PRIMARY KEY,
      "applied_at" timestamptz DEFAULT now() NOT NULL
    );
  `);

  const applied: string[] = [];
  for (const filename of files) {
    const escaped = filename.replace(/'/g, "''");
    const existingResult: unknown = await handle.db.execute(
      sql.raw(`SELECT filename FROM "_proofline_migrations" WHERE filename = '${escaped}'`)
    );
    const rows =
      existingResult && typeof existingResult === 'object' && 'rows' in existingResult
        ? (existingResult as { rows?: unknown[] }).rows
        : [];
    if (Array.isArray(rows) && rows.length > 0) {
      continue;
    }

    const sqlText = readFileSync(join(migrationsDir, filename), 'utf8');
    await handle.executeRawSql(sqlText);
    await handle.executeRawSql(
      `INSERT INTO "_proofline_migrations" ("filename") VALUES ('${escaped}') ON CONFLICT DO NOTHING;`
    );
    applied.push(filename);
  }

  return applied;
}

const isCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required to run migrations.');
    process.exit(1);
  }

  const handle = createPostgresDatabase(databaseUrl);
  runSqlMigrations(handle)
    .then(async (applied) => {
      console.log(
        applied.length > 0
          ? `Applied migrations: ${applied.join(', ')}`
          : 'Database schema is up to date.'
      );
      await handle.close();
    })
    .catch(async (error) => {
      console.error('Migration failed:', error);
      await handle.close();
      process.exit(1);
    });
}
