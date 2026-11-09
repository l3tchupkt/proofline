import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@proofline/config';
import {
  createPgliteDatabase,
  runSqlMigrations,
  type DatabaseHandle
} from '@proofline/database';
import { PayPalSandboxClient } from '@proofline/integration-paypal';
import { buildApiContext, type BuiltApiContext } from '../../apps/api/src/app.js';
import { createSyntheticPdf } from '../fixtures/builders.js';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('Integration: Full Auth, Demo Seed, Sync, Submission, Webhooks & Retention Lock', () => {
  let dbHandle: DatabaseHandle;
  let storageDir: string;
  let ctx: BuiltApiContext;
  let cookieHeader: string;
  let csrfToken: string;

  // Controllable simulated PayPal Sandbox HTTP transport for integration testing
  let paypalMode: 'verified' | 'verify_fail' | 'bad_webhook_sig' = 'verified';
  let provideEvidencePosted = false;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'proofline-int-'));
    const pglite = new PGlite();
    dbHandle = createPgliteDatabase(pglite);
    await runSqlMigrations(dbHandle);

    const env = parseEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
      SESSION_SECRET: 'integration-test-session-secret-32-chars-minimum',
      STORAGE_DRIVER: 'local',
      STORAGE_PATH: storageDir,
      PAYPAL_ENVIRONMENT: 'sandbox',
      PAYPAL_CLIENT_ID: 'sb-client-test',
      PAYPAL_CLIENT_SECRET: 'sb-secret-test',
      PAYPAL_WEBHOOK_ID: 'WH-TEST-001',
      DEMO_MODE: 'true',
      DEMO_LOGIN_EMAIL: 'merchant@demo.proofline.local',
      DEMO_LOGIN_PASSWORD: 'ProoflineDemo!2026'
    });

    const paypalFactory = () =>
      new PayPalSandboxClient({
        environment: 'sandbox',
        clientId: env.PAYPAL_CLIENT_ID,
        clientSecret: env.PAYPAL_CLIENT_SECRET,
        webhookId: env.PAYPAL_WEBHOOK_ID,
        maxRetries: 0,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.endsWith('/v1/oauth2/token')) {
            return jsonRes({ access_token: 'tok-int', expires_in: 3600 });
          }
          if (url.includes('/v1/customer/disputes?') || url.endsWith('/v1/customer/disputes')) {
            return jsonRes({
              items: [
                {
                  dispute_id: 'PP-D-SBX-500',
                  reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
                  status: 'WAITING_FOR_SELLER_RESPONSE',
                  dispute_life_cycle_stage: 'INQUIRY',
                  dispute_amount: { currency_code: 'USD', value: '420.00' }
                }
              ]
            });
          }
          if (url.endsWith('/v1/customer/disputes/PP-D-SBX-500/provide-evidence')) {
            provideEvidencePosted = true;
            return jsonRes({ links: [] }, 200);
          }
          if (url.endsWith('/v1/customer/disputes/PP-D-SBX-500')) {
            if (paypalMode === 'verify_fail' && provideEvidencePosted) {
              return jsonRes({ name: 'INTERNAL_SERVER_ERROR', message: 'Transient verify outage' }, 503);
            }
            const statusAfter = provideEvidencePosted ? 'UNDER_REVIEW' : 'WAITING_FOR_SELLER_RESPONSE';
            return jsonRes({
              dispute_id: 'PP-D-SBX-500',
              reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
              status: statusAfter,
              dispute_life_cycle_stage: 'INQUIRY',
              seller_response_due_date: '2030-01-10T00:00:00Z',
              dispute_amount: { currency_code: 'USD', value: '420.00' },
              disputed_transactions: [
                {
                  seller_transaction_id: 'TXN-SBX-500',
                  buyer: { name: 'Sandbox Buyer' }
                }
              ],
              links: [
                {
                  href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-D-SBX-500/provide-evidence',
                  rel: 'provide_evidence',
                  method: 'POST'
                }
              ]
            });
          }
          if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
            return jsonRes({
              verification_status: paypalMode === 'bad_webhook_sig' ? 'FAILURE' : 'SUCCESS'
            });
          }
          if (init?.method === 'GET' && url.includes('/v1/customer/disputes/PP-D-WH-900')) {
            return jsonRes({
              dispute_id: 'PP-D-WH-900',
              reason: 'ITEM_NOT_AS_DESCRIBED',
              status: 'OPEN',
              dispute_life_cycle_stage: 'INQUIRY',
              dispute_amount: { currency_code: 'USD', value: '199.00' },
              links: []
            });
          }
          return jsonRes({ error: 'unexpected route' }, 404);
        }
      });

    ctx = await buildApiContext({
      env,
      dbHandle,
      paypalClientFactory: paypalFactory
    });

    await ctx.authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'PROOFLINE Default Workspace',
      workspaceSlug: 'default',
      email: env.DEMO_LOGIN_EMAIL,
      password: env.DEMO_LOGIN_PASSWORD,
      displayName: 'Test Operator'
    });

    const loginRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: env.DEMO_LOGIN_EMAIL,
        password: env.DEMO_LOGIN_PASSWORD
      }
    });
    expect(loginRes.statusCode).toBe(200);
    csrfToken = loginRes.json().user.csrfToken;
    const rawCookie = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(rawCookie) ? rawCookie[0]! : String(rawCookie);
    cookieHeader = cookieStr.split(';')[0]!;
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.app.close();
    }
    if (dbHandle) {
      await dbHandle.close();
    }
    if (storageDir) {
      await rm(storageDir, { recursive: true, force: true });
    }
  });

  it('enforces CSRF on state-changing routes', async () => {
    const noCsrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { cookie: cookieHeader },
      payload: {}
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('seeds isolated USD 850 DEMO_FIXTURE and blocks submitting demo fixture to PayPal', async () => {
    const seedRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(seedRes.statusCode).toBe(200);
    const { disputeId } = seedRes.json();

    const detailRes = await ctx.app.inject({
      method: 'GET',
      url: `/api/disputes/${disputeId}`,
      headers: { cookie: cookieHeader }
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json();
    expect(detail.dispute.recordOrigin).toBe('DEMO_FIXTURE');
    expect(detail.dispute.formattedAmount).toBe('USD 850.00');
    expect(detail.assets.length).toBe(5);

    const pdfAsset = detail.assets.find((a: { extension: string }) => a.extension === 'pdf');
    expect(pdfAsset).toBeDefined();

    // Create draft + approve + confirm DEMO_SUBMISSION_BLOCKED on submit
    const draftRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${disputeId}/draft`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Demo proof bundle referencing SOW-DEMO-2026-104.',
        attachmentAssetIds: [pdfAsset.id]
      }
    });
    expect(draftRes.statusCode).toBe(201);
    const submissionId = draftRes.json().submission.id;

    const approveRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/approve`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { confirmExactContent: true }
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().submission.status).toBe('APPROVED');

    const submitDemoRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/submit`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(submitDemoRes.statusCode).toBe(409);
    expect(submitDemoRes.json().error.code).toBe('DEMO_SUBMISSION_BLOCKED');
  });

  it('syncs PayPal Sandbox dispute, enforces retention lock, invalidates edited approvals, prevents duplicate submit, and records post-submit verification', async () => {
    const syncRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/disputes/sync',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(syncRes.statusCode).toBe(200);
    const sbxDisputeId = syncRes.json().disputeIds[0] as string;

    // Upload a real PDF via multipart upload
    const pdfBuffer = await createSyntheticPdf(['Signed digital invoice #500 for USD 420.00 agreement']);
    const boundary = '----ProoflineBoundary12345';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="disputeId"\r\n\r\n${sbxDisputeId}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="recordOrigin"\r\n\r\nPAYPAL_SANDBOX\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="invoice_500.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
      ),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/evidence/upload',
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': csrfToken,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    });
    expect(uploadRes.statusCode).toBe(201);
    const assetId = uploadRes.json().asset.id as string;

    // Draft submission referencing assetId
    const draftRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${sbxDisputeId}/draft`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Attached invoice #500 with electronic delivery log.',
        attachmentAssetIds: [assetId]
      }
    });
    expect(draftRes.statusCode).toBe(201);
    const subId = draftRes.json().submission.id as string;

    // Retention lock prevents deleting referenced evidence asset
    const deleteRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/evidence/${assetId}`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken }
    });
    expect(deleteRes.statusCode).toBe(409);
    expect(deleteRes.json().error.code).toBe('EVIDENCE_RETENTION_LOCKED');

    // Approve, then edit notes -> approval must invalidate to DRAFT
    const approve1 = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${subId}/approve`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { confirmExactContent: true }
    });
    expect(approve1.statusCode).toBe(200);
    expect(approve1.json().submission.status).toBe('APPROVED');

    const editRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${sbxDisputeId}/draft`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        submissionId: subId,
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Updated factual response notes after editing.',
        attachmentAssetIds: [assetId]
      }
    });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json().submission.status).toBe('DRAFT');
    expect(editRes.json().submission.approvalDigest).toBeNull();

    // Repeated edits to an already-DRAFT submission must continue succeeding cleanly
    const editRes2 = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${sbxDisputeId}/draft`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        submissionId: subId,
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Second draft edit after review.',
        attachmentAssetIds: [assetId]
      }
    });
    expect(editRes2.statusCode).toBe(200);
    expect(editRes2.json().submission.status).toBe('DRAFT');

    // Updating a submission under a different dispute ID route must be rejected with 404
    const demoOther = await ctx.app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    const otherDisputeId = demoOther.json().disputeId as string;
    const mismatchRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${otherDisputeId}/draft`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        submissionId: subId,
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Cross-dispute target attempt.',
        attachmentAssetIds: [assetId]
      }
    });
    expect(mismatchRes.statusCode).toBe(404);
    expect(mismatchRes.json().error.code).toBe('SUBMISSION_DISPUTE_MISMATCH');

    // Unapproved submission cannot submit
    const submitUnapproved = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${subId}/submit`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(submitUnapproved.statusCode).toBe(409);
    expect(submitUnapproved.json().error.code).toBe('MERCHANT_APPROVAL_REQUIRED');

    // Re-approve & execute to PayPal Sandbox
    const approve2 = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${subId}/approve`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { confirmExactContent: true }
    });
    expect(approve2.statusCode).toBe(200);

    provideEvidencePosted = false;
    paypalMode = 'verified';
    const submitOk = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${subId}/submit`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(submitOk.statusCode).toBe(200);
    expect(submitOk.json().submission.status).toBe('VERIFIED');
    expect(submitOk.json().submission.paypalCorrelationId).toBeTruthy();

    // Second submission attempt must be rejected as duplicate
    const submitDup = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${subId}/submit`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(submitDup.statusCode).toBe(409);
    expect(submitDup.json().error.code).toBe('DUPLICATE_SUBMISSION_PREVENTED');
  });

  it('preserves SUBMITTED -> VERIFICATION_PENDING and correlation ID if post-submit GET verification transiently fails', async () => {
    provideEvidencePosted = false;
    paypalMode = 'verified';
    const syncRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/disputes/sync',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(syncRes.statusCode).toBe(200);
    const sbxDisputeId = syncRes.json().disputeIds[0] as string;

    const pdfBuffer = await createSyntheticPdf(['Milestone 2 sign-off confirmation']);
    const boundary = '----ProoflineVerifyFailBoundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="disputeId"\r\n\r\n${sbxDisputeId}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="recordOrigin"\r\n\r\nPAYPAL_SANDBOX\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="milestone_2.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
      ),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/evidence/upload',
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': csrfToken,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: body
    });
    expect(uploadRes.statusCode).toBe(201);
    const assetId = uploadRes.json().asset.id as string;

    const draftRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${sbxDisputeId}/draft`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Milestone 2 delivery verification bundle.',
        attachmentAssetIds: [assetId]
      }
    });
    expect(draftRes.statusCode).toBe(201);
    const pendingSubId = draftRes.json().submission.id as string;

    const approveRes = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${pendingSubId}/approve`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { confirmExactContent: true }
    });
    expect(approveRes.statusCode).toBe(200);

    // Trigger transient 503 on post-submit GET /disputes/PP-D-SBX-500 verification
    provideEvidencePosted = false;
    paypalMode = 'verify_fail';
    const submitPending = await ctx.app.inject({
      method: 'POST',
      url: `/api/submissions/${pendingSubId}/submit`,
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: {}
    });
    expect(submitPending.statusCode).toBe(200);
    expect(submitPending.json().submission.status).toBe('VERIFICATION_PENDING');
    expect(submitPending.json().submission.paypalCorrelationId).toBeTruthy();

    paypalMode = 'verified';
    provideEvidencePosted = false;
  });

  it('rejects invalid webhook signatures with 401 and deduplicates repeated PayPal webhook event deliveries', async () => {
    const whHeaders = {
      'content-type': 'application/json',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
      'paypal-transmission-id': 'tx-wh-1',
      'paypal-transmission-sig': 'sig-wh-1',
      'paypal-transmission-time': '2026-10-20T12:00:00Z'
    };

    const payload = JSON.stringify({
      id: 'WH-UNIQUE-EVENT-900',
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: { dispute_id: 'PP-D-WH-900' }
    });

    paypalMode = 'bad_webhook_sig';
    const badRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/webhooks/paypal',
      headers: whHeaders,
      payload
    });
    expect(badRes.statusCode).toBe(401);
    expect(badRes.json().error.code).toBe('WEBHOOK_SIGNATURE_INVALID');

    paypalMode = 'verified';
    const ok1 = await ctx.app.inject({
      method: 'POST',
      url: '/api/webhooks/paypal',
      headers: whHeaders,
      payload
    });
    expect(ok1.statusCode).toBe(200);
    expect(ok1.json().duplicate).toBe(false);

    const ok2 = await ctx.app.inject({
      method: 'POST',
      url: '/api/webhooks/paypal',
      headers: whHeaders,
      payload
    });
    expect(ok2.statusCode).toBe(200);
    expect(ok2.json().duplicate).toBe(true);
  });
});

