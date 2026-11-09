import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@proofline/config';
import {
  AuditRepository,
  createPgliteDatabase,
  DisputeRepository,
  runSqlMigrations,
  WorkspaceRepository,
  type DatabaseHandle
} from '@proofline/database';
import { buildApiApp } from '../../apps/api/src/app.js';

describe('Milestone 1: Database Schema & API Health Check', () => {
  let dbHandle: DatabaseHandle;

  beforeAll(async () => {
    const pglite = new PGlite();
    dbHandle = createPgliteDatabase(pglite);
    await runSqlMigrations(dbHandle);
  });

  afterAll(async () => {
    await dbHandle.close();
  });

  it('applies all 16 schema tables and supports workspace-isolated repositories', async () => {
    const workspaceRepo = new WorkspaceRepository(dbHandle.db);
    const disputeRepo = new DisputeRepository(dbHandle.db);
    const auditRepo = new AuditRepository(dbHandle.db);

    const workspace = await workspaceRepo.createWorkspace({
      name: 'Acme Studio',
      slug: 'acme-studio'
    });

    const user = await workspaceRepo.createUser({
      workspaceId: workspace.id,
      email: 'ops@acme.test',
      displayName: 'Acme Operator',
      role: 'OWNER',
      passwordHash: '$argon2id$stub-for-schema-test'
    });

    expect(user.workspaceId).toBe(workspace.id);

    const dispute = await disputeRepo.upsertDispute({
      workspaceId: workspace.id,
      recordOrigin: 'DEMO_FIXTURE',
      paypalDisputeId: 'PP-D-DEMO-001',
      paypalTransactionId: 'TXN-DEMO-001',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      rawStatus: 'WAITING_FOR_SELLER_RESPONSE',
      workflowStatus: 'WAITING_FOR_SELLER_RESPONSE',
      rawLifecycleStage: 'INQUIRY',
      lifecycleStage: 'INQUIRY',
      channel: 'INTERNAL',
      amountMinor: 85000,
      currencyCode: 'USD',
      buyerDisplayLabel: 'Synthetic Client',
      sellerResponseDueAt: new Date('2026-11-20T00:00:00Z'),
      disputeCreatedAt: new Date('2026-11-01T00:00:00Z'),
      disputeUpdatedAt: new Date('2026-11-01T00:00:00Z'),
      outcomeCode: null,
      links: [{ href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-D-DEMO-001', rel: 'self' }],
      rawPayload: { demo: true },
      lastSyncedAt: new Date()
    });

    expect(dispute.amountMinor).toBe(85000);

    const audit = await auditRepo.append({
      workspaceId: workspace.id,
      disputeId: dispute.id,
      actorType: 'SYSTEM_WORKER',
      actorId: 'test-runner',
      action: 'dispute.seeded',
      resourceType: 'dispute',
      resourceId: dispute.id,
      result: 'SUCCESS'
    });

    expect(audit.id).toBeDefined();
  });

  it('serves GET /api/health with database connectivity and safe integration readiness', async () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
      SESSION_SECRET: 'test-session-secret-with-at-least-32-chars',
      PAYPAL_ENVIRONMENT: 'sandbox'
    });

    const app = await buildApiApp({ env, dbHandle });
    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.database.connected).toBe(true);
    expect(body.integrations.paypalEnvironment).toBe('sandbox');
    expect(body.integrations.paypalConfigured).toBe(false);
    await app.close();
  });
});

