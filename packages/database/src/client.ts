import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index.js';

export type ProoflineSchema = typeof schema;
export type ProoflineDatabase = PgDatabase<PgQueryResultHKT, ProoflineSchema>;
export type NodeProoflineDatabase = NodePgDatabase<ProoflineSchema>;
export type PgliteProoflineDatabase = PgliteDatabase<ProoflineSchema>;

export interface DatabaseHandle {
  db: ProoflineDatabase;
  executeRawSql: (sqlText: string) => Promise<void>;
  close: () => Promise<void>;
  kind: 'postgres' | 'pglite';
}

export function createPostgresDatabase(connectionString: string): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  const db = drizzlePg(pool, { schema }) as unknown as ProoflineDatabase;

  return {
    db,
    kind: 'postgres',
    executeRawSql: async (sqlText: string) => {
      await pool.query(sqlText);
    },
    close: async () => {
      await pool.end();
    }
  };
}

export function createPgliteDatabase(pglite: PGlite): DatabaseHandle {
  const db = drizzlePglite(pglite, { schema }) as unknown as ProoflineDatabase;

  return {
    db,
    kind: 'pglite',
    executeRawSql: async (sqlText: string) => {
      await pglite.exec(sqlText);
    },
    close: async () => {
      await pglite.close();
    }
  };
}

export async function openPgliteDatabase(dataDir?: string): Promise<DatabaseHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pglite = dataDir ? new PGlite(dataDir) : new PGlite();
  return createPgliteDatabase(pglite);
}
