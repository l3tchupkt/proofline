import { parseEnv } from '@proofline/config';
import { createPostgresDatabase, runSqlMigrations } from '@proofline/database';
import { buildApiContext } from './app.js';

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  const dbHandle = createPostgresDatabase(env.DATABASE_URL);

  await runSqlMigrations(dbHandle);

  const ctx = await buildApiContext({
    env,
    dbHandle,
    startJobWorker: true
  });

  if (env.DEMO_MODE) {
    const bootstrapped = await ctx.authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'PROOFLINE Merchant Workspace',
      workspaceSlug: 'default',
      email: env.DEMO_LOGIN_EMAIL,
      password: env.DEMO_LOGIN_PASSWORD,
      displayName: 'Lakshmikanthan K (Merchant Demo)'
    });
    ctx.app.log.info({ workspaceId: bootstrapped.workspaceId }, 'Bootstrap merchant account verified');
  }

  const shutdown = async (signal: string) => {
    ctx.app.log.info({ signal }, 'Shutting down PROOFLINE API');
    await ctx.jobCoordinator.stop();
    await ctx.app.close();
    await dbHandle.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await ctx.app.listen({
    port: env.API_PORT,
    host: '0.0.0.0'
  });
}

main().catch((error) => {
  console.error('Failed to start PROOFLINE API:', error);
  process.exit(1);
});
