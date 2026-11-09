import { DomainError } from '@proofline/domain';
import { AuditRepository, DisputeRepository, WebhookRepository } from '@proofline/database';
import { mapPayPalDisputeToDomain, type PayPalSandboxClient } from '@proofline/integration-paypal';

export interface IncomingPayPalWebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export class WebhookService {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly disputeRepo: DisputeRepository,
    private readonly auditRepo: AuditRepository
  ) {}

  async ingestPayPalWebhook(params: {
    headers: IncomingPayPalWebhookHeaders;
    rawBodyText: string;
    paypalClient: PayPalSandboxClient;
    workspaceIdForSync: string | null;
    enqueueJob?: (eventId: string, disputeId: string | null) => Promise<void>;
  }): Promise<{
    accepted: boolean;
    duplicate: boolean;
    webhookRecordId: string;
    paypalEventId: string;
  }> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(params.rawBodyText) as Record<string, unknown>;
    } catch {
      throw new DomainError('INVALID_WEBHOOK_JSON', 'Webhook body is not valid JSON.', 400);
    }

    const paypalEventId = typeof payload.id === 'string' ? payload.id : '';
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : 'UNKNOWN';
    const resource = (payload.resource ?? {}) as Record<string, unknown>;
    const resourceDisputeId =
      typeof resource.dispute_id === 'string' ? resource.dispute_id : null;

    if (!paypalEventId) {
      throw new DomainError('MISSING_WEBHOOK_EVENT_ID', 'PayPal webhook payload omitted event id.', 400);
    }

    // Always verify webhook signature via PayPal before trusting payload contents.
    const verification = await params.paypalClient.verifyWebhookSignature({
      headers: params.headers,
      webhookEvent: payload
    });

    if (!verification.verified) {
      throw new DomainError(
        'WEBHOOK_SIGNATURE_INVALID',
        `PayPal rejected webhook signature (${verification.verificationStatus}).`,
        401
      );
    }

    const { inserted, event } = await this.webhookRepo.recordIfNew({
      workspaceId: params.workspaceIdForSync,
      paypalEventId,
      eventType,
      resourceId: resourceDisputeId,
      signatureVerified: true,
      verificationStatus: verification.verificationStatus,
      processingStatus: 'QUEUED',
      payload,
      headers: { ...params.headers }
    });

    if (!inserted) {
      return {
        accepted: true,
        duplicate: true,
        webhookRecordId: event.id,
        paypalEventId
      };
    }

    if (params.workspaceIdForSync) {
      await this.auditRepo.append({
        workspaceId: params.workspaceIdForSync,
        actorType: 'SYSTEM_WORKER',
        actorId: 'paypal-webhook-receiver',
        action: 'webhook.paypal_received',
        resourceType: 'webhook_event',
        resourceId: event.id,
        result: 'SUCCESS',
        metadata: {
          paypalEventId,
          eventType,
          resourceDisputeId
        }
      });
    }

    if (params.enqueueJob) {
      await params.enqueueJob(event.id, resourceDisputeId);
    } else if (params.workspaceIdForSync && resourceDisputeId) {
      await this.processWebhookEvent(event.id, params.workspaceIdForSync, params.paypalClient);
    }

    return {
      accepted: true,
      duplicate: false,
      webhookRecordId: event.id,
      paypalEventId
    };
  }

  async processWebhookEvent(
    webhookRecordId: string,
    workspaceId: string,
    paypalClient: PayPalSandboxClient
  ): Promise<void> {
    const event = await this.webhookRepo.findById(webhookRecordId);
    if (!event) return;
    if (event.workspaceId && event.workspaceId !== workspaceId) {
      return;
    }

    if (event.processingStatus === 'PROCESSED') {
      return;
    }

    try {
      const resourceId = event.resourceId;
      if (resourceId) {
        // Fetch authoritative dispute details from PayPal rather than trusting webhook payload blindly.
        const freshDispute = await paypalClient.getDispute(resourceId);
        const mapped = mapPayPalDisputeToDomain(freshDispute);
        const saved = await this.disputeRepo.upsertDispute({
          workspaceId,
          recordOrigin: 'PAYPAL_SANDBOX',
          paypalDisputeId: mapped.paypalDisputeId,
          paypalTransactionId: mapped.paypalTransactionId,
          reason: mapped.reason,
          rawStatus: mapped.rawStatus,
          workflowStatus: mapped.workflowStatus,
          rawLifecycleStage: mapped.rawLifecycleStage,
          lifecycleStage: mapped.lifecycleStage,
          channel: mapped.channel,
          amountMinor: mapped.amountMinor,
          currencyCode: mapped.currencyCode,
          buyerDisplayLabel: mapped.buyerDisplayLabel,
          sellerResponseDueAt: mapped.sellerResponseDueAt,
          disputeCreatedAt: mapped.disputeCreatedAt,
          disputeUpdatedAt: mapped.disputeUpdatedAt,
          outcomeCode: mapped.outcomeCode,
          links: mapped.links,
          rawPayload: mapped.rawPayload,
          lastSyncedAt: new Date()
        });
        await this.disputeRepo.replaceRequirements(workspaceId, saved.id, mapped.requirements);
      }

      await this.webhookRepo.updateProcessingStatus(event.id, {
        processingStatus: 'PROCESSED',
        attempts: event.attempts + 1,
        processedAt: new Date(),
        workspaceId
      });
    } catch (error) {
      await this.webhookRepo.updateProcessingStatus(event.id, {
        processingStatus: 'RETRY_PENDING',
        attempts: event.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Webhook refresh failed'
      });
      throw error;
    }
  }
}

