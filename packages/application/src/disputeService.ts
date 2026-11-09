import { assertAuthorized, type ActorContext } from '@proofline/authorization';
import type { DisputeQuery } from '@proofline/contracts';
import { DomainError, Money } from '@proofline/domain';
import {
  AiRunRepository,
  AuditRepository,
  DisputeRepository,
  EvidenceRepository,
  SubmissionRepository
} from '@proofline/database';
import { mapPayPalDisputeToDomain, type PayPalSandboxClient } from '@proofline/integration-paypal';

export class DisputeService {
  constructor(
    private readonly disputeRepo: DisputeRepository,
    private readonly evidenceRepo: EvidenceRepository,
    private readonly submissionRepo: SubmissionRepository,
    private readonly aiRunRepo: AiRunRepository,
    private readonly auditRepo: AuditRepository
  ) {}

  async syncFromPayPalSandbox(
    actor: ActorContext,
    paypalClient: PayPalSandboxClient
  ): Promise<{ syncedCount: number; disputeIds: string[] }> {
    assertAuthorized(actor, 'dispute:sync', actor.workspaceId);

    const listResp = await paypalClient.listDisputes({ pageSize: 50 });
    const syncedIds: string[] = [];

    for (const summary of listResp.items) {
      const fullDetail = await paypalClient.getDispute(summary.dispute_id);
      const mapped = mapPayPalDisputeToDomain(fullDetail);

      const dispute = await this.disputeRepo.upsertDispute({
        workspaceId: actor.workspaceId,
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

      await this.disputeRepo.replaceRequirements(
        actor.workspaceId,
        dispute.id,
        mapped.requirements
      );
      syncedIds.push(dispute.id);
    }

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      actorType: actor.type,
      actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
      action: 'disputes.sandbox_synced',
      resourceType: 'dispute_batch',
      result: 'SUCCESS',
      metadata: { syncedCount: syncedIds.length }
    });

    return { syncedCount: syncedIds.length, disputeIds: syncedIds };
  }

  async refreshSinglePayPalDispute(
    actor: ActorContext,
    paypalDisputeId: string,
    paypalClient: PayPalSandboxClient
  ) {
    assertAuthorized(actor, 'dispute:sync', actor.workspaceId);
    const fullDetail = await paypalClient.getDispute(paypalDisputeId);
    const mapped = mapPayPalDisputeToDomain(fullDetail);

    const dispute = await this.disputeRepo.upsertDispute({
      workspaceId: actor.workspaceId,
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

    await this.disputeRepo.replaceRequirements(actor.workspaceId, dispute.id, mapped.requirements);
    return dispute;
  }

  async listDisputes(actor: ActorContext, query: DisputeQuery) {
    assertAuthorized(actor, 'dispute:read', actor.workspaceId);
    const result = await this.disputeRepo.listByWorkspace(actor.workspaceId, {
      origin: query.origin,
      status: query.status,
      reason: query.reason,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    });

    return {
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      items: result.items.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        recordOrigin: row.recordOrigin,
        paypalDisputeId: row.paypalDisputeId,
        paypalTransactionId: row.paypalTransactionId,
        reason: row.reason,
        rawStatus: row.rawStatus,
        workflowStatus: row.workflowStatus,
        rawLifecycleStage: row.rawLifecycleStage,
        lifecycleStage: row.lifecycleStage,
        amountMinor: row.amountMinor,
        currencyCode: row.currencyCode,
        formattedAmount: Money.fromMinorUnits(row.amountMinor, row.currencyCode).format(),
        buyerDisplayLabel: row.buyerDisplayLabel,
        sellerResponseDueAt: row.sellerResponseDueAt?.toISOString() ?? null,
        disputeCreatedAt: row.disputeCreatedAt?.toISOString() ?? null,
        outcomeCode: row.outcomeCode,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null
      }))
    };
  }

  async getDisputeDetail(actor: ActorContext, disputeId: string) {
    assertAuthorized(actor, 'dispute:read', actor.workspaceId);
    const dispute = await this.disputeRepo.findById(actor.workspaceId, disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found in this workspace.', 404);
    }

    const [requirements, assets, facts, timeline, claims, submissions, aiRuns, auditEvents] =
      await Promise.all([
        this.disputeRepo.listRequirements(actor.workspaceId, dispute.id),
        this.evidenceRepo.listByWorkspace(actor.workspaceId, { disputeId: dispute.id }),
        this.disputeRepo.listExtractedFacts(actor.workspaceId, dispute.id),
        this.disputeRepo.listTimelineEvents(actor.workspaceId, dispute.id),
        this.disputeRepo.listClaimsWithSources(actor.workspaceId, dispute.id),
        this.submissionRepo.listByDispute(actor.workspaceId, dispute.id),
        this.aiRunRepo.listByDispute(actor.workspaceId, dispute.id),
        this.auditRepo.listByDispute(actor.workspaceId, dispute.id)
      ]);

    return {
      dispute: {
        ...dispute,
        formattedAmount: Money.fromMinorUnits(dispute.amountMinor, dispute.currencyCode).format()
      },
      requirements,
      assets,
      facts,
      timeline,
      claims,
      submissions,
      aiRuns,
      auditEvents
    };
  }
}

