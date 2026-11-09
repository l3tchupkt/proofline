import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod';
import { z } from 'zod';
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
  assertPayPalConfigured,
  ConfigurationError,
  getIntegrationReadiness,
  type AppEnv
} from '@proofline/config';
import {
  AiRunRepository,
  AuditRepository,
  DisputeRepository,
  EvidenceRepository,
  JobRepository,
  SubmissionRepository,
  WebhookRepository,
  WorkspaceRepository,
  type DatabaseHandle
} from '@proofline/database';
import { DomainError } from '@proofline/domain';
import {
  EvidenceParserRegistry,
  LocalPrivateStorage,
  S3CompatibleStorage,
  type EvidenceStorage
} from '@proofline/evidence';
import type { AnthropicMessagesClient } from '@proofline/integration-anthropic';
import { PayPalSandboxClient } from '@proofline/integration-paypal';
import { createJobCoordinator, type BackgroundJobCoordinator } from './jobs/queue.js';
import { registerApiRoutes } from './modules/routes.js';

export interface ApiAppDependencies {
  env: AppEnv;
  dbHandle: DatabaseHandle;
  storageOverride?: EvidenceStorage;
  paypalClientFactory?: () => PayPalSandboxClient;
  anthropicClientOverride?: AnthropicMessagesClient;
  startJobWorker?: boolean;
}

export interface BuiltApiContext {
  app: FastifyInstance;
  authService: AuthService;
  disputeService: DisputeService;
  evidenceService: EvidenceService;
  investigationService: InvestigationService;
  submissionService: SubmissionService;
  webhookService: WebhookService;
  demoService: DemoFixtureService;
  jobCoordinator: BackgroundJobCoordinator;
}

const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('proofline-api'),
  timestamp: z.string(),
  database: z.object({
    connected: z.boolean(),
    kind: z.enum(['postgres', 'pglite'])
  }),
  storage: z.object({
    healthy: z.boolean(),
    driver: z.enum(['local', 's3'])
  }),
  integrations: z.object({
    paypalEnvironment: z.literal('sandbox'),
    paypalConfigured: z.boolean(),
    paypalWebhookConfigured: z.boolean(),
    anthropicConfigured: z.boolean(),
    anthropicModelConfigured: z.boolean(),
    storageDriver: z.enum(['local', 's3']),
    demoMode: z.boolean()
  })
});

function createStorageAdapter(env: AppEnv): EvidenceStorage {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3CompatibleStorage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    });
  }
  return new LocalPrivateStorage(env.STORAGE_PATH);
}

export async function buildApiContext(deps: ApiAppDependencies): Promise<BuiltApiContext> {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: deps.env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
          '*.password',
          '*.clientSecret',
          '*.apiKey',
          '*.accessToken'
        ],
        censor: '[REDACTED]'
      }
    },
    bodyLimit: 52 * 1024 * 1024
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest('authSession', null);
  app.decorateRequest('actorContext', null);

  const allowedOrigins = deps.env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new DomainError('CORS_ORIGIN_DENIED', 'Origin not allowed by CORS policy.', 403), false);
    },
    credentials: true
  });

  await app.register(cookie, {
    secret: deps.env.SESSION_SECRET
  });

  await app.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 10
    }
  });

  await app.register(rateLimit, {
    global: true,
    max: 180,
    timeWindow: '1 minute'
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'PROOFLINE API',
        description:
          'PayPal dispute investigation and evidence provenance API. All PayPal endpoints operate exclusively against Sandbox.',
        version: '0.1.0'
      },
      servers: [{ url: `http://localhost:${deps.env.API_PORT}` }]
    },
    transform: jsonSchemaTransform
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs'
  });

  const storage = deps.storageOverride ?? createStorageAdapter(deps.env);
  const parserRegistry = new EvidenceParserRegistry();

  const workspaceRepo = new WorkspaceRepository(deps.dbHandle.db);
  const disputeRepo = new DisputeRepository(deps.dbHandle.db);
  const evidenceRepo = new EvidenceRepository(deps.dbHandle.db);
  const submissionRepo = new SubmissionRepository(deps.dbHandle.db);
  const webhookRepo = new WebhookRepository(deps.dbHandle.db);
  const auditRepo = new AuditRepository(deps.dbHandle.db);
  const aiRunRepo = new AiRunRepository(deps.dbHandle.db);
  const jobRepo = new JobRepository(deps.dbHandle.db);

  const authService = new AuthService(workspaceRepo, auditRepo);
  const evidenceService = new EvidenceService(
    evidenceRepo,
    disputeRepo,
    auditRepo,
    storage,
    parserRegistry
  );
  const disputeService = new DisputeService(
    disputeRepo,
    evidenceRepo,
    submissionRepo,
    aiRunRepo,
    auditRepo
  );
  const investigationService = new InvestigationService(
    disputeRepo,
    evidenceRepo,
    aiRunRepo,
    auditRepo
  );
  const submissionService = new SubmissionService(
    disputeRepo,
    evidenceRepo,
    submissionRepo,
    auditRepo,
    storage,
    evidenceService
  );
  const webhookService = new WebhookService(webhookRepo, disputeRepo, auditRepo);
  const demoService = new DemoFixtureService(
    disputeRepo,
    evidenceRepo,
    auditRepo,
    evidenceService
  );

  const paypalClientFactory =
    deps.paypalClientFactory ??
    (() => {
      const cfg = assertPayPalConfigured(deps.env);
      return new PayPalSandboxClient({
        environment: cfg.environment,
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        webhookId: cfg.webhookId,
        logger: {
          info: (msg, meta) => app.log.info(meta ?? {}, msg),
          warn: (msg, meta) => app.log.warn(meta ?? {}, msg),
          error: (msg, meta) => app.log.error(meta ?? {}, msg)
        }
      });
    });

  const jobCoordinator = createJobCoordinator({
    env: deps.env,
    dbHandle: deps.dbHandle,
    jobRepo,
    webhookService,
    createPayPalClient: paypalClientFactory,
    logger: {
      info: (msg, meta) => app.log.info(meta ?? {}, msg),
      error: (msg, meta) => app.log.error(meta ?? {}, msg)
    }
  });

  if (deps.startJobWorker) {
    await jobCoordinator.start();
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ConfigurationError) {
      request.log.warn({ code: error.code, details: error.details }, error.message);
      return reply.status(428).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null
        }
      });
    }

    if (error instanceof DomainError) {
      request.log.warn({ code: error.code, details: error.details }, error.message);
      const safeDetails =
        error.details && typeof error.details === 'object'
          ? Object.fromEntries(
              Object.entries(error.details).filter(([k]) => k !== 'paypalBody')
            )
          : null;
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: safeDetails && Object.keys(safeDetails).length > 0 ? safeDetails : null
        }
      });
    }

    const maybeValidation = error as { validation?: unknown; statusCode?: number; message?: string };
    if (maybeValidation.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: maybeValidation.message ?? 'Invalid request payload',
          details: maybeValidation.validation
        }
      });
    }

    request.log.error({ err: error }, 'Unhandled API error');
    const statusCode =
      maybeValidation.statusCode && maybeValidation.statusCode >= 400
        ? maybeValidation.statusCode
        : 500;
    return reply.status(statusCode).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          statusCode >= 500
            ? 'An unexpected internal error occurred.'
            : (maybeValidation.message ?? 'Request error')
      }
    });
  });

  app.get(
    '/api/health',
    {
      schema: {
        tags: ['System'],
        summary: 'API, database, storage, and integration readiness check',
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema
        }
      }
    },
    async (_request, reply) => {
      let dbConnected = false;
      try {
        await deps.dbHandle.db.execute(sql`SELECT 1`);
        dbConnected = true;
      } catch {
        dbConnected = false;
      }

      const storageHealth = await storage.healthCheck();
      const healthy = dbConnected && storageHealth.healthy;

      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? ('ok' as const) : ('degraded' as const),
        service: 'proofline-api' as const,
        timestamp: new Date().toISOString(),
        database: {
          connected: dbConnected,
          kind: deps.dbHandle.kind
        },
        storage: {
          healthy: storageHealth.healthy,
          driver: storage.driver
        },
        integrations: getIntegrationReadiness(deps.env)
      });
    }
  );

  await registerApiRoutes(app, {
    env: deps.env,
    authService,
    disputeService,
    evidenceService,
    investigationService,
    submissionService,
    webhookService,
    demoService,
    workspaceRepo,
    disputeRepo,
    evidenceRepo,
    submissionRepo,
    webhookRepo,
    auditRepo,
    storage,
    jobCoordinator,
    paypalClientFactory,
    anthropicClientOverride: deps.anthropicClientOverride
  });

  return {
    app,
    authService,
    disputeService,
    evidenceService,
    investigationService,
    submissionService,
    webhookService,
    demoService,
    jobCoordinator
  };
}

export async function buildApiApp(deps: ApiAppDependencies): Promise<FastifyInstance> {
  const ctx = await buildApiContext(deps);
  return ctx.app;
}
