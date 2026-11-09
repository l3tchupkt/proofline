import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/tables.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://proofline:proofline@localhost:5432/proofline'
  }
});

