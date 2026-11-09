import { parseEnv } from '@proofline/config';
import {
  AuditRepository,
  createPostgresDatabase,
  DisputeRepository,
  EvidenceRepository,
  runSqlMigrations,
  WorkspaceRepository
} from '@proofline/database';
import { AuthService, DemoFixtureService, EvidenceService } from '@proofline/application';
import { EvidenceParserRegistry, LocalPrivateStorage } from '@proofline/evidence';

async function main() {
  const env = parseEnv(process.env);
  const dbHandle = createPostgresDatabase(env.DATABASE_URL);

  try {
    await runSqlMigrations(dbHandle);
    const workspaceRepo = new WorkspaceRepository(dbHandle.db);
    const auditRepo = new AuditRepository(dbHandle.db);
    const disputeRepo = new DisputeRepository(dbHandle.db);
    const evidenceRepo = new EvidenceRepository(dbHandle.db);

    const authService = new AuthService(workspaceRepo, auditRepo);
    const { workspaceId, userId } = await authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'PROOFLINE Merchant Workspace',
      workspaceSlug: 'default',
      email: env.DEMO_LOGIN_EMAIL,
      password: env.DEMO_LOGIN_PASSWORD,
      displayName: 'Lakshmikanthan K (Merchant Demo)'
    });

    const storage = new LocalPrivateStorage(env.STORAGE_PATH);
    const evidenceService = new EvidenceService(
      evidenceRepo,
      disputeRepo,
      auditRepo,
      storage,
      new EvidenceParserRegistry()
    );
    const demoService = new DemoFixtureService(
      disputeRepo,
      evidenceRepo,
      auditRepo,
      evidenceService
    );

    const seeded = await demoService.seedDemoScenario({
      type: 'MERCHANT_USER',
      userId,
      workspaceId,
      role: 'OWNER'
    });

    console.log('DEMO DATA — NOT A LIVE CUSTOMER RECORD');
    console.log(JSON.stringify(seeded, null, 2));
  } finally {
    await dbHandle.close();
  }
}

main().catch((error) => {
  console.error('Demo seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

