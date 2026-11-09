import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { assertAuthorized } from '@proofline/authorization';
import {
  ApproveSubmissionInputSchema,
  CreateDraftInputSchema,
  DisputeQuerySchema,
  LoginRequestSchema,
  SubmitSubmissionInputSchema
} from '@proofline/contracts';
import {
  assertPayPalConfigured,
  getIntegrationReadiness,
  type AppEnv
} from '@proofline/config';
import { DomainError, Money } from '@proofline/domain';
import {
  AuthService,
  DemoFixtureService,
  DisputeService,
  EvidenceService,
  InvestigationService,
  SubmissionService,
  WebhookService
} from '@proofline/application';
import {
  AuditRepository,
  DisputeRepository,
  EvidenceRepository,
  SubmissionRepository,
  WebhookRepository,
  WorkspaceRepository
} from '@proofline/database';
import type { EvidenceStorage } from '@proofline/evidence';
import type { AnthropicMessagesClient } from '@proofline/integration-anthropic';
import { PayPalSandboxClient } from '@proofline/integration-paypal';
import type { BackgroundJobCoordinator } from '../jobs/queue.js';
import { createAuthHooks, SESSION_COOKIE_NAME } from '../middleware/auth.js';

export interface RouteServices {
  env: AppEnv;
  authService: AuthService;
  disputeService: DisputeService;
  evidenceService: EvidenceService;
  investigationService: InvestigationService;
  submissionService: SubmissionService;
  webhookService: WebhookService;
  demoService: DemoFixtureService;
  workspaceRepo: WorkspaceRepository;
  disputeRepo: DisputeRepository;
  evidenceRepo: EvidenceRepository;
  submissionRepo: SubmissionRepository;
  webhookRepo: WebhookRepository;
  auditRepo: AuditRepository;
  storage: EvidenceStorage;
  jobCoordinator: BackgroundJobCoordinator;
  paypalClientFactory: () => PayPalSandboxClient;
  anthropicClientOverride?: AnthropicMessagesClient;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  services: RouteServices
): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { requireSession, requireCsrf } = createAuthHooks(services.authService);

  const cookieSecure = services.env.SESSION_COOKIE_SECURE || services.env.NODE_ENV === 'production';

  // ==================== AUTHENTICATION ====================
  typed.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Authenticate merchant operator using Argon2id password verification',
        body: LoginRequestSchema
      }
    },
    async (request, reply) => {
      const result = await services.authService.login(request.body.email, request.body.password);
      reply.setCookie(SESSION_COOKIE_NAME, result.rawSessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure,
        path: '/',
        maxAge: 7 * 24 * 60 * 60
      });
      return reply.status(200).send({
        user: {
          id: result.session.userId,
          workspaceId: result.session.workspaceId,
          workspaceName: result.session.workspaceName,
          email: result.session.email,
          displayName: result.session.displayName,
          role: result.session.role,
          csrfToken: result.session.csrfToken
        }
      });
    }
  );

  typed.get(
    '/api/auth/me',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Auth'],
        summary: 'Return current authenticated merchant session'
      }
    },
    async (request) => {
      const s = request.authSession!;
      return {
        user: {
          id: s.userId,
          workspaceId: s.workspaceId,
          workspaceName: s.workspaceName,
          email: s.email,
          displayName: s.displayName,
          role: s.role,
          csrfToken: s.csrfToken
        }
      };
    }
  );

  typed.get(
    '/api/auth/demo-hint',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Returns local/test demo autofill availability only when DEMO_MODE is active outside production'
      }
    },
    async () => {
      if (!services.env.DEMO_MODE || services.env.NODE_ENV === 'production') {
        return { available: false as const };
      }
      return {
        available: true as const,
        email: services.env.DEMO_LOGIN_EMAIL,
        password: services.env.DEMO_LOGIN_PASSWORD
      };
    }
  );

  typed.post(
    '/api/auth/logout',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke current session and clear cookie'
      }
    },
    async (request, reply) => {
      await services.authService.logout(request.authSession!);
      reply.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure,
        path: '/'
      });
      return reply.status(200).send({ ok: true });
    }
  );

  // ==================== DASHBOARD OVERVIEW ====================
  typed.get(
    '/api/dashboard/overview',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Dashboard'],
        summary: 'Workspace operational dispute, evidence, submission, and activity overview',
        querystring: z.object({
          origin: z.enum(['PAYPAL_SANDBOX', 'DEMO_FIXTURE']).optional()
        })
      }
    },
    async (request) => {
      const session = request.authSession!;
      assertAuthorized(request.actorContext!, 'dispute:read', session.workspaceId);
      const originFilter = request.query.origin;

      const [disputesRes, assets, submissions, audit] = await Promise.all([
        services.disputeRepo.listByWorkspace(session.workspaceId, {
          origin: originFilter,
          page: 1,
          pageSize: 500
        }),
        services.evidenceRepo.listByWorkspace(session.workspaceId, { origin: originFilter }),
        services.submissionRepo.listRecentByWorkspace(session.workspaceId, 50),
        services.auditRepo.listByWorkspace(session.workspaceId, 15)
      ]);

      const now = Date.now();
      const openDisputes = disputesRes.items.filter((d) => d.workflowStatus !== 'RESOLVED');
      const awaitingSeller = disputesRes.items.filter(
        (d) => d.workflowStatus === 'WAITING_FOR_SELLER_RESPONSE'
      );
      const dueWithin72h = openDisputes.filter(
        (d) =>
          d.sellerResponseDueAt &&
          d.sellerResponseDueAt.getTime() > now &&
          d.sellerResponseDueAt.getTime() - now <= 72 * 60 * 60 * 1000
      );

      const assetsByStatus = {
        UPLOADED: assets.filter((a) => a.status === 'UPLOADED').length,
        PROCESSING: assets.filter((a) => a.status === 'PROCESSING').length,
        PROCESSED: assets.filter((a) => a.status === 'PROCESSED').length,
        NEEDS_REVIEW: assets.filter((a) => a.status === 'NEEDS_REVIEW').length,
        FAILED: assets.filter((a) => a.status === 'FAILED').length
      };

      return {
        originFilter: originFilter ?? 'ALL',
        metrics: {
          openDisputesCount: openDisputes.length,
          awaitingSellerCount: awaitingSeller.length,
          urgentDeadlinesCount: dueWithin72h.length,
          evidenceAssetsCount: assets.length,
          needsReviewCount: assetsByStatus.NEEDS_REVIEW
        },
        evidenceStatusBreakdown: assetsByStatus,
        upcomingDeadlines: openDisputes
          .filter((d) => d.sellerResponseDueAt !== null)
          .slice(0, 6)
          .map((d) => ({
            id: d.id,
            paypalDisputeId: d.paypalDisputeId,
            recordOrigin: d.recordOrigin,
            reason: d.reason,
            workflowStatus: d.workflowStatus,
            formattedAmount: Money.fromMinorUnits(d.amountMinor, d.currencyCode).format(),
            sellerResponseDueAt: d.sellerResponseDueAt?.toISOString() ?? null
          })),
        recentSubmissions: submissions
          .filter((s) => (originFilter ? s.recordOrigin === originFilter : true))
          .slice(0, 10),
        recentActivity: audit
      };
    }
  );

  // ==================== DISPUTES ====================
  typed.get(
    '/api/disputes',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Disputes'],
        summary: 'List workspace disputes with status, reason, search, and origin filters',
        querystring: DisputeQuerySchema
      }
    },
    async (request) => {
      return services.disputeService.listDisputes(request.actorContext!, request.query);
    }
  );

  typed.get(
    '/api/disputes/:id',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Disputes'],
        summary: 'Get complete case dossier for a workspace dispute',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      return services.disputeService.getDisputeDetail(request.actorContext!, request.params.id);
    }
  );

  typed.post(
    '/api/disputes/sync',
    {
      preHandler: [requireSession, requireCsrf],
      config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
      schema: {
        tags: ['Disputes'],
        summary: 'Sync disputes from PayPal Sandbox Disputes API'
      }
    },
    async (request) => {
      assertPayPalConfigured(services.env);
      const client = services.paypalClientFactory();
      return services.disputeService.syncFromPayPalSandbox(request.actorContext!, client);
    }
  );

  typed.post(
    '/api/disputes/:id/investigate',
    {
      preHandler: [requireSession, requireCsrf],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Investigation'],
        summary: 'Run Anthropic tool-calling investigation on dispute evidence',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      return services.investigationService.runInvestigation(
        request.actorContext!,
        request.params.id,
        {
          env: services.env,
          clientOverride: services.anthropicClientOverride
        }
      );
    }
  );

  typed.get(
    '/api/disputes/:id/timeline',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Investigation'],
        summary: 'Get chronological source-linked delivery timeline for a dispute',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      const detail = await services.disputeService.getDisputeDetail(
        request.actorContext!,
        request.params.id
      );
      return { disputeId: detail.dispute.id, timeline: detail.timeline };
    }
  );

  typed.get(
    '/api/disputes/:id/evidence',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Evidence'],
        summary: 'List evidence assets linked to a dispute',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      const detail = await services.disputeService.getDisputeDetail(
        request.actorContext!,
        request.params.id
      );
      return { disputeId: detail.dispute.id, assets: detail.assets };
    }
  );

  // ==================== EVIDENCE ====================
  typed.get(
    '/api/evidence',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Evidence'],
        summary: 'Search workspace evidence assets',
        querystring: z.object({
          disputeId: z.string().uuid().optional(),
          origin: z.enum(['PAYPAL_SANDBOX', 'DEMO_FIXTURE']).optional(),
          search: z.string().optional()
        })
      }
    },
    async (request) => {
      const assets = await services.evidenceService.listAssets(request.actorContext!, request.query);
      return { assets };
    }
  );

  typed.post(
    '/api/evidence/upload',
    {
      preHandler: [requireSession, requireCsrf],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Evidence'],
        summary: 'Upload, validate, SHA-256 hash, privately store, and parse evidence'
      }
    },
    async (request, reply) => {
      let filename = '';
      let declaredMimeType = '';
      let bytes: Buffer | null = null;
      let disputeIdRaw: string | null = null;
      let originRaw = '';

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'file' && !bytes) {
            filename = part.filename;
            declaredMimeType = part.mimetype;
            bytes = await part.toBuffer();
          } else {
            await part.toBuffer();
          }
        } else if (part.fieldname === 'disputeId') {
          disputeIdRaw = String(part.value ?? '').trim() || null;
        } else if (part.fieldname === 'recordOrigin') {
          originRaw = String(part.value ?? '').trim();
        }
      }

      if (!bytes) {
        throw new DomainError('FILE_REQUIRED', 'Multipart form field "file" is required.', 400);
      }

      const recordOrigin =
        originRaw === 'DEMO_FIXTURE' || originRaw === 'PAYPAL_SANDBOX' ? originRaw : undefined;

      const result = await services.evidenceService.uploadEvidence(request.actorContext!, {
        disputeId: disputeIdRaw,
        recordOrigin,
        filename,
        declaredMimeType,
        bytes
      });

      return reply.status(201).send(result);
    }
  );

  typed.get(
    '/api/evidence/:id',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Evidence'],
        summary: 'Retrieve metadata, SHA-256 checksum, and extracted text for an asset',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      const asset = await services.evidenceService.getAsset(
        request.actorContext!,
        request.params.id
      );
      return { asset };
    }
  );

  typed.get(
    '/api/evidence/:id/download',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Evidence'],
        summary: 'Stream original preserved evidence file from private storage',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request, reply) => {
      const { asset, bytes } = await services.evidenceService.downloadAssetBytes(
        request.actorContext!,
        request.params.id
      );
      reply.header('Content-Type', asset.mimeType);
      reply.header(
        'Content-Disposition',
        `attachment; filename="${asset.originalFilename.replace(/"/g, '')}"`
      );
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Evidence-SHA256', asset.sha256Hash);
      return reply.send(bytes);
    }
  );

  typed.delete(
    '/api/evidence/:id',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Evidence'],
        summary: 'Delete an evidence asset if not retention-locked by a submission',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      await services.evidenceService.deleteAsset(request.actorContext!, request.params.id);
      return { deleted: true };
    }
  );

  // ==================== RESPONSE STUDIO & SUBMISSIONS ====================
  typed.post(
    '/api/disputes/:id/draft',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Submissions'],
        summary: 'Create or update an evidence response draft (edits invalidate prior approval)',
        params: z.object({ id: z.string().uuid() }),
        body: CreateDraftInputSchema.extend({
          submissionId: z.string().uuid().optional()
        })
      }
    },
    async (request, reply) => {
      if (request.body.submissionId) {
        const updated = await services.submissionService.updateDraft(
          request.actorContext!,
          request.body.submissionId,
          request.body,
          request.params.id
        );
        return reply.status(200).send({ submission: updated });
      }
      const created = await services.submissionService.createDraft(
        request.actorContext!,
        request.params.id,
        request.body
      );
      return reply.status(201).send({ submission: created });
    }
  );

  typed.post(
    '/api/disputes/:id/submissions',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Submissions'],
        summary: 'Create an evidence submission draft for a dispute',
        params: z.object({ id: z.string().uuid() }),
        body: CreateDraftInputSchema
      }
    },
    async (request, reply) => {
      const created = await services.submissionService.createDraft(
        request.actorContext!,
        request.params.id,
        request.body
      );
      return reply.status(201).send({ submission: created });
    }
  );

  typed.post(
    '/api/disputes/:id/bundle-pdf',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Submissions'],
        summary: 'Compile selected evidence excerpts and SHA-256 manifest into a PayPal-ready PDF',
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          evidenceType: z.string().min(1),
          responseNotes: z.string().min(1),
          assetIds: z.array(z.string().uuid()).default([])
        })
      }
    },
    async (request, reply) => {
      const asset = await services.submissionService.generateEvidenceSummaryPdf(
        request.actorContext!,
        request.params.id,
        request.body
      );
      return reply.status(201).send({ asset });
    }
  );

  typed.get(
    '/api/submissions/:id',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Submissions'],
        summary: 'Get submission details, approval digest, and verification state',
        params: z.object({ id: z.string().uuid() })
      }
    },
    async (request) => {
      assertAuthorized(request.actorContext!, 'dispute:read', request.authSession!.workspaceId);
      const submission = await services.submissionRepo.findById(
        request.authSession!.workspaceId,
        request.params.id
      );
      if (!submission) {
        throw new DomainError('SUBMISSION_NOT_FOUND', 'Submission not found.', 404);
      }
      return { submission };
    }
  );

  typed.post(
    '/api/submissions/:id/approve',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Submissions'],
        summary: 'Explicitly approve exact submission response and documents',
        params: z.object({ id: z.string().uuid() }),
        body: ApproveSubmissionInputSchema
      }
    },
    async (request) => {
      const submission = await services.submissionService.approveSubmission(
        request.actorContext!,
        request.params.id,
        request.body.confirmExactContent
      );
      return { submission };
    }
  );

  typed.post(
    '/api/submissions/:id/submit',
    {
      preHandler: [requireSession, requireCsrf],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Submissions'],
        summary: 'Execute approved submission against PayPal Sandbox API and re-verify state',
        params: z.object({ id: z.string().uuid() }),
        body: SubmitSubmissionInputSchema.optional()
      }
    },
    async (request) => {
      assertPayPalConfigured(services.env);
      const client = services.paypalClientFactory();
      const submission = await services.submissionService.submitApprovedSubmission(
        request.actorContext!,
        request.params.id,
        client
      );
      return { submission };
    }
  );

  // ==================== ACTIVITY, SETTINGS & DEMO ====================
  typed.get(
    '/api/activity',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Audit'],
        summary: 'List chronological workspace audit trail'
      }
    },
    async (request) => {
      assertAuthorized(request.actorContext!, 'activity:read', request.authSession!.workspaceId);
      const events = await services.auditRepo.listByWorkspace(
        request.authSession!.workspaceId,
        150
      );
      return { events };
    }
  );

  typed.get(
    '/api/settings/status',
    {
      preHandler: [requireSession],
      schema: {
        tags: ['Settings'],
        summary: 'Non-secret configuration status for PayPal Sandbox, Anthropic AI, webhooks, and storage'
      }
    },
    async (request) => {
      const session = request.authSession!;
      assertAuthorized(request.actorContext!, 'settings:read', session.workspaceId);
      const [workspace, recentWebhooks, storageHealth] = await Promise.all([
        services.workspaceRepo.findWorkspaceById(session.workspaceId),
        services.webhookRepo.listRecentByWorkspace(session.workspaceId, 10),
        services.storage.healthCheck()
      ]);

      return {
        workspace: workspace
          ? {
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
              paypalMerchantPayerId: workspace.paypalMerchantPayerId
            }
          : null,
        readiness: getIntegrationReadiness(services.env),
        anthropicModel: services.env.ANTHROPIC_MODEL || null,
        storageHealth,
        jobQueueMode: services.jobCoordinator.mode,
        recentWebhooks: recentWebhooks.map((w) => ({
          id: w.id,
          paypalEventId: w.paypalEventId,
          eventType: w.eventType,
          verificationStatus: w.verificationStatus,
          processingStatus: w.processingStatus,
          receivedAt: w.receivedAt.toISOString()
        }))
      };
    }
  );

  typed.post(
    '/api/demo/seed',
    {
      preHandler: [requireSession, requireCsrf],
      schema: {
        tags: ['Demo'],
        summary: 'Idempotently seed the clearly labelled USD 850 freelance demo fixture'
      }
    },
    async (request) => {
      if (!services.env.DEMO_MODE) {
        throw new DomainError('DEMO_MODE_DISABLED', 'Demo fixtures are disabled in this environment.', 403);
      }
      return services.demoService.seedDemoScenario(request.actorContext!);
    }
  );

  // ==================== PAYPAL WEBHOOKS ====================
  await app.register(async function webhookScope(scope) {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req, body, done) => {
        done(null, body);
      }
    );

    scope.post(
      '/api/webhooks/paypal',
      {
        config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
        schema: {
          tags: ['Webhooks'],
          summary: 'Receive, signature-verify, deduplicate, and enqueue PayPal dispute notifications'
        }
      },
      async (request, reply) => {
        assertPayPalConfigured(services.env);
        const rawBodyText = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});

        const getHeader = (name: string): string => {
          const val = request.headers[name];
          return Array.isArray(val) ? (val[0] ?? '') : (val ?? '');
        };

        const headers = {
          authAlgo: getHeader('paypal-auth-algo'),
          certUrl: getHeader('paypal-cert-url'),
          transmissionId: getHeader('paypal-transmission-id'),
          transmissionSig: getHeader('paypal-transmission-sig'),
          transmissionTime: getHeader('paypal-transmission-time')
        };

        if (
          !headers.authAlgo ||
          !headers.certUrl ||
          !headers.transmissionId ||
          !headers.transmissionSig ||
          !headers.transmissionTime
        ) {
          throw new DomainError(
            'WEBHOOK_HEADERS_MISSING',
            'Required PayPal webhook verification headers are missing.',
            400
          );
        }

        const defaultWorkspace = await services.workspaceRepo.findWorkspaceBySlug('default');
        const paypalClient = services.paypalClientFactory();

        const result = await services.webhookService.ingestPayPalWebhook({
          headers,
          rawBodyText,
          paypalClient,
          workspaceIdForSync: defaultWorkspace?.id ?? null,
          enqueueJob: defaultWorkspace
            ? async (webhookRecordId, disputeId) => {
                const payload = JSON.parse(rawBodyText) as { id?: string };
                await services.jobCoordinator.enqueueWebhookDisputeRefresh({
                  webhookRecordId,
                  workspaceId: defaultWorkspace.id,
                  paypalEventId: payload.id ?? webhookRecordId,
                  disputeId
                });
              }
            : undefined
        });

        return reply.status(200).send(result);
      }
    );
  });
}
