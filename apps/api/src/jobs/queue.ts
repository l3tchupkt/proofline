import { PgBoss } from 'pg-boss';
import type { AppEnv } from '@proofline/config';
import { JobRepository, type DatabaseHandle } from '@proofline/database';
import type { WebhookService } from '@proofline/application';
import { PayPalSandboxClient } from '@proofline/integration-paypal';

export const QUEUE_PAYPAL_WEBHOOK_REFRESH = 'paypal-webhook-dispute-refresh';

export interface BackgroundJobCoordinator {
  mode: 'pg-boss' | 'in-process';
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueueWebhookDisputeRefresh(params: {
    webhookRecordId: string;
    workspaceId: string;
    paypalEventId: string;
    disputeId: string | null;
  }): Promise<string>;
}

export function createJobCoordinator(params: {
  env: AppEnv;
  dbHandle: DatabaseHandle;
  jobRepo: JobRepository;
  webhookService: WebhookService;
  createPayPalClient: () => PayPalSandboxClient;
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void };
}): BackgroundJobCoordinator {
  let boss: PgBoss | null = null;

  const processPayload = async (data: {
    jobRowId: string;
    webhookRecordId: string;
    workspaceId: string;
  }) => {
    try {
      const client = params.createPayPalClient();
      await params.webhookService.processWebhookEvent(
        data.webhookRecordId,
        data.workspaceId,
        client
      );
      await params.jobRepo.markStatus(data.jobRowId, 'COMPLETED');
    } catch (err) {
      await params.jobRepo.markStatus(
        data.jobRowId,
        'FAILED',
        err instanceof Error ? err.message : 'Background processing error'
      );
      throw err;
    }
  };

  if (params.dbHandle.kind === 'postgres') {
    return {
      mode: 'pg-boss',
      async start() {
        boss = new PgBoss(params.env.DATABASE_URL);
        boss.on('error', (error: Error) => {
          params.logger.error('pg-boss error', { message: error.message });
        });
        await boss.start();
        await boss.createQueue(QUEUE_PAYPAL_WEBHOOK_REFRESH);
        await boss.work(QUEUE_PAYPAL_WEBHOOK_REFRESH, async (jobsList) => {
          for (const job of jobsList) {
            const payload = job.data as {
              jobRowId: string;
              webhookRecordId: string;
              workspaceId: string;
            };
            await processPayload(payload);
          }
        });
        params.logger.info('pg-boss worker started');
      },
      async stop() {
        if (boss) {
          await boss.stop({ graceful: true });
          boss = null;
        }
      },
      async enqueueWebhookDisputeRefresh(input) {
        const jobRow = await params.jobRepo.recordJob({
          workspaceId: input.workspaceId,
          queueName: QUEUE_PAYPAL_WEBHOOK_REFRESH,
          idempotencyKey: `webhook:${input.paypalEventId}`,
          status: 'QUEUED',
          payload: input
        });

        if (boss) {
          const bossId = await boss.send(
            QUEUE_PAYPAL_WEBHOOK_REFRESH,
            {
              jobRowId: jobRow.id,
              webhookRecordId: input.webhookRecordId,
              workspaceId: input.workspaceId
            },
            {
              retryLimit: 3,
              retryDelay: 15,
              singletonKey: input.paypalEventId
            }
          );
          return bossId ?? jobRow.id;
        }
        return jobRow.id;
      }
    };
  }

  // In-process fallback for PGlite integration tests
  return {
    mode: 'in-process',
    async start() {},
    async stop() {},
    async enqueueWebhookDisputeRefresh(input) {
      const jobRow = await params.jobRepo.recordJob({
        workspaceId: input.workspaceId,
        queueName: QUEUE_PAYPAL_WEBHOOK_REFRESH,
        idempotencyKey: `webhook:${input.paypalEventId}`,
        status: 'QUEUED',
        payload: input
      });
      return jobRow.id;
    }
  };
}

