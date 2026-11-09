import { assertAuthorized, type ActorContext } from '@proofline/authorization';
import { assertAnthropicConfigured, type AppEnv } from '@proofline/config';
import { DomainError, Money } from '@proofline/domain';
import {
  AiRunRepository,
  AuditRepository,
  DisputeRepository,
  EvidenceRepository
} from '@proofline/database';
import {
  runAnthropicInvestigation,
  type AnthropicMessagesClient
} from '@proofline/integration-anthropic';

export class InvestigationService {
  constructor(
    private readonly disputeRepo: DisputeRepository,
    private readonly evidenceRepo: EvidenceRepository,
    private readonly aiRunRepo: AiRunRepository,
    private readonly auditRepo: AuditRepository
  ) {}

  async runInvestigation(
    actor: ActorContext,
    disputeId: string,
    options: {
      env: AppEnv;
      clientOverride?: AnthropicMessagesClient;
      modelOverride?: string;
    }
  ) {
    assertAuthorized(actor, 'investigation:run', actor.workspaceId);

    const aiConfig = options.clientOverride
      ? {
          apiKey: options.env.ANTHROPIC_API_KEY || 'test-override-key',
          model: options.modelOverride ?? (options.env.ANTHROPIC_MODEL || 'test-model')
        }
      : assertAnthropicConfigured(options.env);

    const dispute = await this.disputeRepo.findById(actor.workspaceId, disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found in this workspace.', 404);
    }

    const [assets, extractedFacts, requirements] = await Promise.all([
      this.evidenceRepo.listByWorkspace(actor.workspaceId, { disputeId: dispute.id }),
      this.disputeRepo.listExtractedFacts(actor.workspaceId, dispute.id),
      this.disputeRepo.listRequirements(actor.workspaceId, dispute.id)
    ]);

    const run = await this.aiRunRepo.createRun({
      workspaceId: actor.workspaceId,
      disputeId: dispute.id,
      recordOrigin: dispute.recordOrigin,
      initiatedByUserId: actor.type === 'MERCHANT_USER' ? actor.userId : 'system',
      provider: 'anthropic',
      modelId: aiConfig.model
    });

    const aiActor: ActorContext = {
      type: 'AI_ASSISTANT',
      runId: run.id,
      workspaceId: actor.workspaceId
    };

    try {
      const result = await runAnthropicInvestigation({
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        clientOverride: options.clientOverride,
        context: {
          actor: aiActor,
          workspaceId: actor.workspaceId,
          dispute: {
            id: dispute.id,
            paypalDisputeId: dispute.paypalDisputeId,
            paypalTransactionId: dispute.paypalTransactionId,
            reason: dispute.reason,
            rawStatus: dispute.rawStatus,
            rawLifecycleStage: dispute.rawLifecycleStage,
            amountMinor: dispute.amountMinor,
            currencyCode: dispute.currencyCode,
            formattedAmount: Money.fromMinorUnits(dispute.amountMinor, dispute.currencyCode).format(),
            sellerResponseDueAt: dispute.sellerResponseDueAt?.toISOString() ?? null,
            buyerDisplayLabel: dispute.buyerDisplayLabel
          },
          assets: assets.map((a) => ({
            id: a.id,
            originalFilename: a.originalFilename,
            extension: a.extension,
            mimeType: a.mimeType,
            byteSize: a.byteSize,
            sha256Hash: a.sha256Hash,
            status: a.status,
            extractedText: a.extractedText,
            extractedMetadata: a.extractedMetadata,
            promptInjectionSignals: a.promptInjectionSignals,
            documentCreatedAt: a.documentCreatedAt?.toISOString() ?? null,
            receivedAt: a.receivedAt.toISOString()
          })),
          extractedFacts: extractedFacts.map((f) => ({
            id: f.id,
            sourceAssetId: f.sourceAssetId,
            factType: f.factType,
            factText: f.factText,
            locator: f.locator,
            confidence: f.confidence,
            verificationStatus: f.verificationStatus as
              | 'VERIFIED'
              | 'REQUIRES_REVIEW'
              | 'CONFLICTING'
              | 'UNSUPPORTED',
            isOcrDerived: f.isOcrDerived
          })),
          requirements: requirements.map((r) => ({
            evidenceType: r.evidenceType,
            source: r.source,
            isRequired: r.isRequired,
            satisfied: r.satisfied
          })),
          onAuditToolCall: async (entry) => {
            await this.auditRepo.append({
              workspaceId: actor.workspaceId,
              disputeId: dispute.id,
              actorType: 'AI_ASSISTANT',
              actorId: run.id,
              action: `ai.tool.${entry.toolName}`,
              resourceType: 'ai_run',
              resourceId: run.id,
              result: 'SUCCESS',
              metadata: {
                summary: entry.resultSummary
              }
            });
          }
        }
      });

      const persistedClaims = await this.disputeRepo.replaceClaimsWithSources(
        actor.workspaceId,
        dispute.id,
        run.id,
        [
          ...result.output.supportedClaims.map((c) => ({
            claimText: c.claimText,
            category: c.category,
            verificationStatus: 'VERIFIED',
            mappedEvidenceType: c.mappedEvidenceType,
            sources: c.sources
          })),
          ...result.output.unsupportedClaims.map((u) => ({
            claimText: `${u.claimText} (${u.reason})`,
            category: 'MISSING_EVIDENCE',
            verificationStatus: 'UNSUPPORTED',
            mappedEvidenceType: null,
            sources: []
          }))
        ]
      );

      if (result.output.timeline.length > 0) {
        await this.disputeRepo.replaceTimelineEvents(
          actor.workspaceId,
          dispute.id,
          result.output.timeline.map((item) => ({
            sourceAssetId: item.sourceAssetId,
            eventTimestamp: item.eventTimestamp ? new Date(item.eventTimestamp) : null,
            timestampPrecision: item.timestampPrecision,
            eventType: item.eventType,
            title: item.title,
            description: item.description,
            locator: item.locator,
            verificationStatus: item.verificationStatus
          }))
        );
      }

      await this.aiRunRepo.completeRun(run.id, {
        status: 'COMPLETED',
        toolCallTrace: result.toolCallTrace,
        structuredOutput: result.output as unknown as Record<string, unknown>
      });

      await this.auditRepo.append({
        workspaceId: actor.workspaceId,
        disputeId: dispute.id,
        actorType: actor.type,
        actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
        action: 'investigation.completed',
        resourceType: 'ai_run',
        resourceId: run.id,
        result: 'SUCCESS',
        metadata: {
          modelId: result.modelId,
          supportedClaimsCount: result.output.supportedClaims.length,
          unsupportedClaimsCount: result.output.unsupportedClaims.length,
          missingEvidenceCount: result.output.missingEvidence.length
        }
      });

      return {
        runId: run.id,
        modelId: result.modelId,
        output: result.output,
        claims: persistedClaims
      };
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'AI_INVESTIGATION_FAILED';
      const msg = error instanceof Error ? error.message : 'Investigation failed';
      await this.aiRunRepo.completeRun(run.id, {
        status: 'FAILED',
        toolCallTrace: [],
        structuredOutput: {},
        errorCode: code,
        errorMessage: msg
      });
      await this.auditRepo.append({
        workspaceId: actor.workspaceId,
        disputeId: dispute.id,
        actorType: actor.type,
        actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
        action: 'investigation.failed',
        resourceType: 'ai_run',
        resourceId: run.id,
        result: 'FAILURE',
        metadata: { errorCode: code, errorMessage: msg }
      });
      throw error;
    }
  }
}

