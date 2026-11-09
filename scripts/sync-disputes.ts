import { assertPayPalConfigured, parseEnv } from '@proofline/config';
import {
  AiRunRepository,
  AuditRepository,
  createPostgresDatabase,
  DisputeRepository,
  EvidenceRepository,
  runSqlMigrations,
  SubmissionRepository,
  WorkspaceRepository
} from '@proofline/database';
import { AuthService, DisputeService } from '@proofline/application';
import { PayPalSandboxClient } from '@proofline/integration-paypal';

async function main() {
  const env = parseEnv(process.env);
  const cfg = assertPayPalConfigured(env);
  const dbHandle = createPostgresDatabase(env.DATABASE_URL);

  try {
    await runSqlMigrations(dbHandle);
    const workspaceRepo = new WorkspaceRepository(dbHandle.db);
    const auditRepo = new AuditRepository(dbHandle.db);
    const authService = new AuthService(workspaceRepo, auditRepo);
    const { workspaceId } = await authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'PROOFLINE Merchant Workspace',
      workspaceSlug: 'default',
      email: env.DEMO_LOGIN_EMAIL,
      password: env.DEMO_LOGIN_PASSWORD,
      displayName: 'Lakshmikanthan K'
    });

    const disputeService = new DisputeService(
      new DisputeRepository(dbHandle.db),
      new EvidenceRepository(dbHandle.db),
      new SubmissionRepository(dbHandle.db),
      new AiRunRepository(dbHandle.db),
      auditRepo
    );

    const paypalClient = new PayPalSandboxClient({
      environment: cfg.environment,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      webhookId: cfg.webhookId
    });

    const result = await disputeService.syncFromPayPalSandbox(
      { type: 'SYSTEM_WORKER', workerId: 'cli-sync-disputes', workspaceId },
      paypalClient
    );

    console.log(`Synced ${result.syncedCount} PayPal Sandbox dispute(s).`);
  } finally {
    await dbHandle.close();
  }
}

main().catch((error) => {
  console.error('Sync failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

