import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertAuthorized, AuthorizationError, type ActorContext } from '@proofline/authorization';
import { DomainError } from '@proofline/domain';
import { parseEnv } from '@proofline/config';
import {
  createPgliteDatabase,
  runSqlMigrations,
  WebhookRepository,
  type DatabaseHandle
} from '@proofline/database';
import { groundInvestigationOutput, type AnthropicMessagesClient } from '@proofline/integration-anthropic';
import { PayPalSandboxClient } from '@proofline/integration-paypal';
import { buildApiContext, type BuiltApiContext } from '../../apps/api/src/app.js';

describe('Security Boundaries: Workspace Isolation, AI Capability Enforcement & Injection Grounding', () => {
  let dbHandle: DatabaseHandle;
  let storageDir: string;
  let ctx: BuiltApiContext;
  let wsACookie: string;
  let wsACsrf: string;
  let wsBDisputeId: string;
  let wsAId: string;
  let wsBId: string;
  let wsBUserActor: ActorContext;

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'proofline-sec-'));
    const pglite = new PGlite();
    dbHandle = createPgliteDatabase(pglite);
    await runSqlMigrations(dbHandle);

    const env = parseEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
      SESSION_SECRET: 'security-test-session-secret-32-chars-minimum',
      STORAGE_DRIVER: 'local',
      STORAGE_PATH: storageDir,
      PAYPAL_ENVIRONMENT: 'sandbox',
      DEMO_MODE: 'true'
    });

    ctx = await buildApiContext({ env, dbHandle });

    const wsA = await ctx.authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'Workspace Alpha',
      workspaceSlug: 'alpha',
      email: 'alpha@proofline.test',
      password: 'AlphaPassword!2026',
      displayName: 'Alpha User'
    });
    wsAId = wsA.workspaceId;

    const wsB = await ctx.authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'Workspace Beta',
      workspaceSlug: 'beta',
      email: 'beta@proofline.test',
      password: 'BetaPassword!2026',
      displayName: 'Beta User'
    });
    wsBId = wsB.workspaceId;

    wsBUserActor = {
      type: 'MERCHANT_USER',
      userId: wsB.userId,
      workspaceId: wsBId,
      role: 'OWNER'
    };

    // Seed demo fixture exclusively in Workspace Beta
    const demoSeed = await ctx.demoService.seedDemoScenario(wsBUserActor);
    wsBDisputeId = demoSeed.disputeId;

    // Sign in as Workspace Alpha user
    const loginA = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'alpha@proofline.test',
        password: 'AlphaPassword!2026'
      }
    });
    wsACsrf = loginA.json().user.csrfToken;
    const rawCookie = loginA.headers['set-cookie'];
    wsACookie = (Array.isArray(rawCookie) ? rawCookie[0]! : String(rawCookie)).split(';')[0]!;
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

  it('denies cross-workspace HTTP read, evidence download, draft creation, and deletion', async () => {
    const readOtherDispute = await ctx.app.inject({
      method: 'GET',
      url: `/api/disputes/${wsBDisputeId}`,
      headers: { cookie: wsACookie }
    });
    expect(readOtherDispute.statusCode).toBe(404);

    // Fetch Beta's asset directly through Beta service only to learn asset ID, then try accessing from Alpha HTTP session
    const betaDetail = await ctx.disputeService.getDisputeDetail(wsBUserActor, wsBDisputeId);
    const betaAssetId = betaDetail.assets[0]!.id;

    const downloadOtherAsset = await ctx.app.inject({
      method: 'GET',
      url: `/api/evidence/${betaAssetId}/download`,
      headers: { cookie: wsACookie }
    });
    expect(downloadOtherAsset.statusCode).toBe(404);

    const draftOtherDispute = await ctx.app.inject({
      method: 'POST',
      url: `/api/disputes/${wsBDisputeId}/draft`,
      headers: { cookie: wsACookie, 'x-csrf-token': wsACsrf },
      payload: {
        actionType: 'PROVIDE_EVIDENCE',
        evidenceType: 'PROOF_OF_FULFILLMENT',
        responseNotes: 'Cross-tenant hijack attempt',
        attachmentAssetIds: []
      }
    });
    expect(draftOtherDispute.statusCode).toBe(404);

    // Production DEMO_MODE safety: default demo password must be rejected when NODE_ENV=production and DEMO_MODE=true
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
        SESSION_SECRET: 'production-test-session-secret-at-least-32-chars',
        DEMO_MODE: 'true'
      })
    ).toThrow(/INSECURE_DEMO_CREDENTIALS|override the default/i);

    // Production default DEMO_MODE resolves to false safely
    const prodEnv = parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
      SESSION_SECRET: 'production-test-session-secret-at-least-32-chars'
    });
    expect(prodEnv.DEMO_MODE).toBe(false);

    // Record a webhook event exclusively in Workspace Beta and ensure Workspace Alpha does NOT see it
    const webhookRepo = new WebhookRepository(dbHandle.db);
    await webhookRepo.recordIfNew({
      workspaceId: wsBId,
      paypalEventId: 'WH-BETA-ISOLATION-1',
      eventType: 'CUSTOMER.DISPUTE.UPDATED',
      resourceId: 'PP-D-BETA-ONLY',
      signatureVerified: true,
      verificationStatus: 'SUCCESS',
      processingStatus: 'PROCESSED',
      payload: { id: 'WH-BETA-ISOLATION-1' },
      headers: {}
    });

    const alphaSettings = await ctx.app.inject({
      method: 'GET',
      url: '/api/settings/status',
      headers: { cookie: wsACookie }
    });
    expect(alphaSettings.statusCode).toBe(200);
    expect(alphaSettings.json().recentWebhooks).toEqual([]);

    const betaLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'beta@proofline.test',
        password: 'BetaPassword!2026'
      }
    });
    expect(betaLogin.statusCode).toBe(200);
    const betaCookie = (
      Array.isArray(betaLogin.headers['set-cookie'])
        ? betaLogin.headers['set-cookie'][0]!
        : String(betaLogin.headers['set-cookie'])
    ).split(';')[0]!;
    const betaSettings = await ctx.app.inject({
      method: 'GET',
      url: '/api/settings/status',
      headers: { cookie: betaCookie }
    });
    expect(betaSettings.statusCode).toBe(200);
    expect(
      betaSettings.json().recentWebhooks.some(
        (w: { paypalEventId: string }) => w.paypalEventId === 'WH-BETA-ISOLATION-1'
      )
    ).toBe(true);

    // REVIEWER role is denied GET /api/settings/status (403) while permitted dispute reads
    await ctx.authService.ensureBootstrapWorkspaceAndUser({
      workspaceName: 'Workspace Alpha',
      workspaceSlug: 'alpha',
      email: 'alpha-reviewer@proofline.test',
      password: 'ReviewerPassword!2026',
      displayName: 'Alpha Reviewer',
      role: 'REVIEWER'
    });
    const reviewerLogin = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'alpha-reviewer@proofline.test',
        password: 'ReviewerPassword!2026'
      }
    });
    expect(reviewerLogin.statusCode).toBe(200);
    const revCookieHeader = (
      Array.isArray(reviewerLogin.headers['set-cookie'])
        ? reviewerLogin.headers['set-cookie'][0]!
        : String(reviewerLogin.headers['set-cookie'])
    ).split(';')[0]!;

    const reviewerSettings = await ctx.app.inject({
      method: 'GET',
      url: '/api/settings/status',
      headers: { cookie: revCookieHeader }
    });
    expect(reviewerSettings.statusCode).toBe(403);
    expect(reviewerSettings.json().error.code).toBe('FORBIDDEN_ACTION');
  });

  it('INTEGRATION: proves AI_ASSISTANT actor cannot approve, submit, refund, accept claim, or access another workspace via application services', async () => {
    const aiActor: ActorContext = {
      type: 'AI_ASSISTANT',
      runId: '11111111-1111-4111-8111-111111111111',
      workspaceId: wsBId
    };

    // Prepare a real draft as workspace Beta owner
    const betaDetail = await ctx.disputeService.getDisputeDetail(wsBUserActor, wsBDisputeId);
    const pdfAsset = betaDetail.assets.find((a) => a.extension === 'pdf')!;

    const draft = await ctx.submissionService.createDraft(wsBUserActor, wsBDisputeId, {
      actionType: 'PROVIDE_EVIDENCE',
      evidenceType: 'PROOF_OF_FULFILLMENT',
      responseNotes: 'Merchant drafted proof package.',
      attachmentAssetIds: [pdfAsset.id]
    });

    // AI_ASSISTANT tries to approve -> must throw AuthorizationError
    await expect(
      ctx.submissionService.approveSubmission(aiActor, draft.id, true)
    ).rejects.toThrowError(AuthorizationError);

    // Merchant approves validly, then AI_ASSISTANT attempts to submit -> must throw AuthorizationError
    await ctx.submissionService.approveSubmission(wsBUserActor, draft.id, true);
    const dummyPayPal = new PayPalSandboxClient({
      environment: 'sandbox',
      clientId: 'sb-id',
      clientSecret: 'sb-secret'
    });
    await expect(
      ctx.submissionService.submitApprovedSubmission(aiActor, draft.id, dummyPayPal)
    ).rejects.toThrowError(AuthorizationError);

    // AI_ASSISTANT attempts upload, delete, refund, accept_claim, or cross-workspace read -> all rejected
    await expect(ctx.evidenceService.deleteAsset(aiActor, pdfAsset.id)).rejects.toThrowError(
      AuthorizationError
    );
    expect(() => assertAuthorized(aiActor, 'evidence:upload', wsBId)).toThrowError(
      AuthorizationError
    );
    expect(() => assertAuthorized(aiActor, 'dispute:refund', wsBId)).toThrowError(
      AuthorizationError
    );
    expect(() => assertAuthorized(aiActor, 'dispute:accept_claim', wsBId)).toThrowError(
      AuthorizationError
    );
    expect(() => assertAuthorized(aiActor, 'dispute:read', wsAId)).toThrowError(
      AuthorizationError
    );
    await expect(ctx.disputeService.getDisputeDetail(aiActor, wsAId)).rejects.toThrowError(
      DomainError
    );
  });

  it('isolates untrusted evidence prompt injection inside <untrusted_evidence> tags and strips hallucinated sourceAssetIds in investigation output', async () => {
    const betaDetail = await ctx.disputeService.getDisputeDetail(wsBUserActor, wsBDisputeId);
    const realPdfAsset = betaDetail.assets.find((a) => a.extension === 'pdf')!;
    const realPngAssetId = '22222222-2222-4222-8222-222222222222';

    // Run real InvestigationService with an adversarial/mocked AnthropicMessagesClient
    let sawWrappedUntrustedTag = false;
    const mockAnthropicClient: AnthropicMessagesClient = {
      messages: {
        create: async (params) => {
          const msgCount = params.messages.length;
          if (msgCount === 1) {
            return {
              id: 'msg-1',
              type: 'message',
              role: 'assistant',
              model: 'test-model',
              stop_reason: 'tool_use',
              stop_sequence: null,
              usage: {
                input_tokens: 10,
                output_tokens: 10,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                cache_creation: null,
                inference_geo: null,
                server_tool_use: null,
                service_tier: null
              },
              content: [
                {
                  type: 'tool_use',
                  id: 'tool-call-1',
                  name: 'get_evidence_assets',
                  input: { disputeId: wsBDisputeId },
                  caller: { type: 'direct' }
                }
              ]
            } as unknown as Awaited<ReturnType<AnthropicMessagesClient['messages']['create']>>;
          }

          // Inspect tool_result payload returned from PROOFLINE to Anthropic
          const serializedMessages = JSON.stringify(params.messages);
          if (serializedMessages.includes('<untrusted_evidence ')) {
            sawWrappedUntrustedTag = true;
          }

          return {
            id: 'msg-2',
            type: 'message',
            role: 'assistant',
            model: 'test-model',
            stop_reason: 'end_turn',
            stop_sequence: null,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'Grounded test summary.',
                  facts: [
                    {
                      fact: 'Valid contract term cited.',
                      factType: 'CONTRACT_AGREEMENT',
                      sourceAssetId: realPdfAsset.id,
                      locator: { type: 'pdf_page', pageNumber: 1, textStart: 0, textEnd: 40 },
                      confidence: 0.92,
                      verificationStatus: 'VERIFIED',
                      isOcrDerived: false
                    },
                    {
                      fact: 'Fabricated asset fact should be stripped',
                      factType: 'DELIVERY_COMPLETION',
                      sourceAssetId: '99999999-9999-4999-8999-999999999999',
                      locator: { type: 'text_range', lineStart: 1, lineEnd: 1, textStart: 0, textEnd: 10 },
                      confidence: 0.99,
                      verificationStatus: 'VERIFIED',
                      isOcrDerived: false
                    }
                  ],
                  timeline: [],
                  supportedClaims: [
                    {
                      claimText: 'Contract confirms electronic website handover.',
                      category: 'VERIFIED_FACT',
                      mappedEvidenceType: 'PROOF_OF_FULFILLMENT',
                      sources: [
                        {
                          sourceAssetId: realPdfAsset.id,
                          locator: { type: 'pdf_page', pageNumber: 2, textStart: 0, textEnd: 50 }
                        }
                      ]
                    },
                    {
                      claimText: 'Hallucinated FedEx tracking number 12345.',
                      category: 'VERIFIED_FACT',
                      mappedEvidenceType: 'PROOF_OF_FULFILLMENT',
                      sources: [
                        {
                          sourceAssetId: '99999999-9999-4999-8999-999999999999',
                          locator: { type: 'text_range', lineStart: 1, lineEnd: 1, textStart: 0, textEnd: 10 }
                        }
                      ]
                    }
                  ],
                  unsupportedClaims: [],
                  contradictions: [],
                  missingEvidence: [],
                  recommendedEvidenceTypes: ['PROOF_OF_FULFILLMENT'],
                  draftNotes: 'Factual draft.'
                })
              }
            ]
          } as unknown as Awaited<ReturnType<AnthropicMessagesClient['messages']['create']>>;
        }
      }
    };

    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://proofline:proofline@localhost:5432/proofline',
      SESSION_SECRET: 'security-test-session-secret-32-chars-minimum'
    });

    const investigationRes = await ctx.investigationService.runInvestigation(
      wsBUserActor,
      wsBDisputeId,
      {
        env,
        clientOverride: mockAnthropicClient,
        modelOverride: 'test-model'
      }
    );

    expect(sawWrappedUntrustedTag).toBe(true);
    // Only the contract claim should remain supported; hallucinated FedEx claim must be downgraded
    expect(investigationRes.output.supportedClaims).toHaveLength(1);
    expect(investigationRes.output.supportedClaims[0]?.claimText).toContain('electronic website handover');
    expect(investigationRes.output.unsupportedClaims).toHaveLength(1);
    expect(investigationRes.output.unsupportedClaims[0]?.reason).toContain('Downgraded');

    // Also test direct image OCR review tagging via groundInvestigationOutput
    const pngGrounded = groundInvestigationOutput(
      {
        summary: 's',
        facts: [
          {
            fact: 'Screenshot text',
            factType: 'DELIVERY_COMPLETION',
            sourceAssetId: realPngAssetId,
            locator: { type: 'image_ocr', extractionMethod: 'metadata' },
            confidence: 0.9,
            verificationStatus: 'VERIFIED',
            isOcrDerived: false
          }
        ],
        timeline: [],
        supportedClaims: [],
        unsupportedClaims: [],
        contradictions: [],
        missingEvidence: [],
        recommendedEvidenceTypes: [],
        draftNotes: 'n'
      },
      [{ id: realPngAssetId, extension: 'png' }]
    );
    expect(pngGrounded.facts[0]?.isOcrDerived).toBe(true);
    expect(pngGrounded.facts[0]?.verificationStatus).toBe('REQUIRES_REVIEW');
  });
});
