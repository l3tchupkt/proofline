import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from '@proofline/config';
import { openPgliteDatabase, runSqlMigrations } from '@proofline/database';
import { buildApiContext } from '../apps/api/src/app.js';

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'proofline-e2e-'));
  const storageDir = join(tempRoot, 'storage');

  const env = parseEnv({
    ...process.env,
    NODE_ENV: 'test',
    API_PORT: '4000',
    WEB_PORT: '3000',
    LOG_LEVEL: 'warn',
    DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
    SESSION_SECRET: 'e2e-harness-session-secret-must-be-32-chars',
    CORS_ORIGIN: 'http://localhost:3000,http://127.0.0.1:3000',
    STORAGE_DRIVER: 'local',
    STORAGE_PATH: storageDir,
    PAYPAL_ENVIRONMENT: 'sandbox',
    DEMO_MODE: 'true'
  });

  const dbHandle = await openPgliteDatabase();
  await runSqlMigrations(dbHandle);

  const ctx = await buildApiContext({
    env,
    dbHandle,
    startJobWorker: true
  });

  await ctx.authService.ensureBootstrapWorkspaceAndUser({
    workspaceName: 'PROOFLINE Merchant Workspace',
    workspaceSlug: 'default',
    email: env.DEMO_LOGIN_EMAIL,
    password: env.DEMO_LOGIN_PASSWORD,
    displayName: 'Lakshmikanthan K (Merchant Demo)'
  });

  const shutdown = async () => {
    await ctx.jobCoordinator.stop();
    await ctx.app.close();
    await dbHandle.close();
    await rm(tempRoot, { recursive: true, force: true });
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await ctx.app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`PROOFLINE E2E API Harness listening on http://127.0.0.1:${env.API_PORT}`);
}

main().catch((err) => {
  console.error('E2E API harness failed:', err);
  process.exit(1);
});

