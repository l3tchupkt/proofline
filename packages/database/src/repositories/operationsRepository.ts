import { and, desc, eq } from 'drizzle-orm';
import type { ProoflineDatabase } from '../client.js';
import { aiRuns, auditEvents, jobs, webhookEvents } from '../schema/index.js';

export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type AiRunRow = typeof aiRuns.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;

export class WebhookRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async findByPayPalEventId(paypalEventId: string): Promise<WebhookEventRow | null> {
    const [row] = await this.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.paypalEventId, paypalEventId))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<WebhookEventRow | null> {
    const [row] = await this.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, id))
      .limit(1);
    return row ?? null;
  }

  async recordIfNew(input: {
    workspaceId?: string | null;
    paypalEventId: string;
    eventType: string;
    resourceId?: string | null;
    signatureVerified: boolean;
    verificationStatus: string;
    processingStatus: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  }): Promise<{ inserted: boolean; event: WebhookEventRow }> {
    const insertedRows = await this.db
      .insert(webhookEvents)
      .values({
        workspaceId: input.workspaceId ?? null,
        paypalEventId: input.paypalEventId,
        eventType: input.eventType,
        resourceId: input.resourceId ?? null,
        signatureVerified: input.signatureVerified,
        verificationStatus: input.verificationStatus,
        processingStatus: input.processingStatus,
        payload: input.payload,
        headers: input.headers
      })
      .onConflictDoNothing({ target: webhookEvents.paypalEventId })
      .returning();

    if (insertedRows[0]) {
      return { inserted: true, event: insertedRows[0] };
    }

    const existing = await this.findByPayPalEventId(input.paypalEventId);
    if (!existing) {
      throw new Error(`Webhook event ${input.paypalEventId} conflict but record missing`);
    }
    return { inserted: false, event: existing };
  }

  async updateProcessingStatus(
    id: string,
    update: {
      processingStatus: string;
      attempts: number;
      lastError?: string | null;
      processedAt?: Date | null;
      workspaceId?: string | null;
    }
  ): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        processingStatus: update.processingStatus,
        attempts: update.attempts,
        lastError: update.lastError ?? null,
        processedAt: update.processedAt ?? null,
        ...(update.workspaceId !== undefined ? { workspaceId: update.workspaceId } : {})
      })
      .where(eq(webhookEvents.id, id));
  }

  async listRecent(limit = 25): Promise<WebhookEventRow[]> {
    return this.db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(limit);
  }

  async listRecentByWorkspace(workspaceId: string, limit = 25): Promise<WebhookEventRow[]> {
    return this.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.workspaceId, workspaceId))
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(limit);
  }
}

export class AuditRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  /**
   * Append-only audit trail. Updates and deletes are intentionally omitted.
   */
  async append(input: {
    workspaceId: string;
    disputeId?: string | null;
    actorType: string;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    result: 'SUCCESS' | 'DENIED' | 'FAILURE';
    metadata?: Record<string, unknown>;
  }): Promise<AuditEventRow> {
    const [row] = await this.db
      .insert(auditEvents)
      .values({
        workspaceId: input.workspaceId,
        disputeId: input.disputeId ?? null,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        result: input.result,
        metadata: input.metadata ?? {}
      })
      .returning();

    if (!row) throw new Error('Failed to append audit event');
    return row;
  }

  async listByWorkspace(workspaceId: string, limit = 100): Promise<AuditEventRow[]> {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit);
  }

  async listByDispute(workspaceId: string, disputeId: string): Promise<AuditEventRow[]> {
    const rows = await this.listByWorkspace(workspaceId, 200);
    return rows.filter((row) => row.disputeId === disputeId);
  }
}

export class AiRunRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async createRun(input: {
    workspaceId: string;
    disputeId: string;
    recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
    initiatedByUserId: string;
    provider: string;
    modelId: string;
  }): Promise<AiRunRow> {
    const [row] = await this.db
      .insert(aiRuns)
      .values({
        ...input,
        status: 'RUNNING',
        toolCallTrace: [],
        structuredOutput: {}
      })
      .returning();
    if (!row) throw new Error('Failed to insert ai_run');
    return row;
  }

  async completeRun(
    id: string,
    update: {
      status: 'COMPLETED' | 'FAILED';
      toolCallTrace: Array<Record<string, unknown>>;
      structuredOutput: Record<string, unknown>;
      errorCode?: string | null;
      errorMessage?: string | null;
    }
  ): Promise<void> {
    await this.db
      .update(aiRuns)
      .set({
        status: update.status,
        toolCallTrace: update.toolCallTrace,
        structuredOutput: update.structuredOutput,
        errorCode: update.errorCode ?? null,
        errorMessage: update.errorMessage ?? null,
        completedAt: new Date()
      })
      .where(eq(aiRuns.id, id));
  }

  async listByDispute(workspaceId: string, disputeId: string): Promise<AiRunRow[]> {
    const rows = await this.db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.disputeId, disputeId))
      .orderBy(desc(aiRuns.startedAt));
    return rows.filter((r) => r.workspaceId === workspaceId);
  }
}

export class JobRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async recordJob(input: {
    workspaceId?: string | null;
    queueName: string;
    externalJobId?: string | null;
    idempotencyKey?: string | null;
    status: string;
    payload?: Record<string, unknown>;
  }): Promise<JobRow> {
    const [row] = await this.db
      .insert(jobs)
      .values({
        workspaceId: input.workspaceId ?? null,
        queueName: input.queueName,
        externalJobId: input.externalJobId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        status: input.status,
        payload: input.payload ?? {}
      })
      .onConflictDoNothing()
      .returning();

    if (row) return row;

    const [existing] = await this.db
      .select()
      .from(jobs)
      .where(
        input.idempotencyKey
          ? and(
              eq(jobs.queueName, input.queueName),
              eq(jobs.idempotencyKey, input.idempotencyKey)
            )
          : eq(jobs.queueName, input.queueName)
      )
      .orderBy(desc(jobs.scheduledAt))
      .limit(1);
    if (!existing) throw new Error('Failed to record job');
    return existing;
  }

  async markStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<void> {
    await this.db
      .update(jobs)
      .set({
        status,
        lastError: error ?? null,
        completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : null
      })
      .where(eq(jobs.id, id));
  }
}

