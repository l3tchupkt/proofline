import { randomUUID } from 'node:crypto';
import { assertAuthorized, type ActorContext } from '@proofline/authorization';
import { DomainError, type RecordOrigin } from '@proofline/domain';
import {
  AuditRepository,
  DisputeRepository,
  EvidenceRepository,
  type EvidenceAssetRow
} from '@proofline/database';
import {
  computeSha256Hex,
  detectPromptInjectionSignals,
  EvidenceParserRegistry,
  extractCandidateFacts,
  validateEvidenceUpload,
  type EvidenceStorage
} from '@proofline/evidence';

export class EvidenceService {
  constructor(
    private readonly evidenceRepo: EvidenceRepository,
    private readonly disputeRepo: DisputeRepository,
    private readonly auditRepo: AuditRepository,
    private readonly storage: EvidenceStorage,
    private readonly parserRegistry: EvidenceParserRegistry
  ) {}

  async uploadEvidence(
    actor: ActorContext,
    input: {
      disputeId: string | null;
      recordOrigin?: RecordOrigin;
      filename: string;
      declaredMimeType: string;
      bytes: Uint8Array;
      receivedAt?: Date;
    }
  ): Promise<{
    asset: EvidenceAssetRow;
    factCount: number;
    promptInjectionSignals: string[];
  }> {
    assertAuthorized(actor, 'evidence:upload', actor.workspaceId);
    const uploaderId = actor.type === 'MERCHANT_USER' ? actor.userId : 'system';

    let resolvedOrigin: RecordOrigin = input.recordOrigin ?? 'PAYPAL_SANDBOX';
    if (input.disputeId) {
      const dispute = await this.disputeRepo.findById(actor.workspaceId, input.disputeId);
      if (!dispute) {
        throw new DomainError(
          'DISPUTE_NOT_FOUND',
          'Target dispute does not exist in this workspace.',
          404
        );
      }
      resolvedOrigin = dispute.recordOrigin;
    }

    const validated = validateEvidenceUpload({
      filename: input.filename,
      declaredMimeType: input.declaredMimeType,
      bytes: input.bytes
    });

    const sha256Hash = computeSha256Hex(input.bytes);
    const assetId = randomUUID();
    const storageKey = `${actor.workspaceId}/${assetId}/${validated.safeFilename}`;

    await this.storage.putObject(storageKey, input.bytes, validated.normalizedMimeType);

    const createdAsset = await this.evidenceRepo.createAsset({
      id: assetId,
      workspaceId: actor.workspaceId,
      disputeId: input.disputeId,
      recordOrigin: resolvedOrigin,
      uploadedByUserId: uploaderId,
      originalFilename: validated.safeFilename,
      extension: validated.extension,
      mimeType: validated.normalizedMimeType,
      byteSize: validated.byteSize,
      sha256Hash,
      storageDriver: this.storage.driver,
      storageKey,
      status: 'PROCESSING',
      receivedAt: input.receivedAt ?? new Date()
    });

    try {
      const parsed = await this.parserRegistry.parseEvidence({
        buffer: input.bytes,
        filename: validated.safeFilename,
        mimeType: validated.normalizedMimeType,
        extension: validated.extension
      });

      const promptInjectionSignals = detectPromptInjectionSignals(parsed.extractedText);
      const status = parsed.needsReview ? 'NEEDS_REVIEW' : 'PROCESSED';

      const updated = await this.evidenceRepo.updateExtractionResult(actor.workspaceId, assetId, {
        status,
        parserVersion: parsed.parserVersion,
        extractedText: parsed.extractedText,
        extractedMetadata: parsed.metadata,
        promptInjectionSignals,
        documentCreatedAt: parsed.documentCreatedAt
      });

      let factCount = 0;
      if (input.disputeId) {
        const candidateFacts = extractCandidateFacts(parsed);
        const insertedFacts = await this.disputeRepo.replaceExtractedFactsForAsset(
          actor.workspaceId,
          input.disputeId,
          assetId,
          candidateFacts.map((f) => ({
            factType: f.factType,
            factText: f.factText,
            locator: f.locator,
            confidence: f.confidence,
            verificationStatus: f.verificationStatus,
            extractionVersion: f.extractionVersion,
            isOcrDerived: f.isOcrDerived
          }))
        );
        factCount = insertedFacts.length;
        await this.rebuildDeterministicTimeline(actor.workspaceId, input.disputeId);
      }

      await this.auditRepo.append({
        workspaceId: actor.workspaceId,
        disputeId: input.disputeId,
        actorType: actor.type,
        actorId: uploaderId,
        action: 'evidence.uploaded_and_parsed',
        resourceType: 'evidence_asset',
        resourceId: assetId,
        result: 'SUCCESS',
        metadata: {
          filename: validated.safeFilename,
          sha256Hash,
          byteSize: validated.byteSize,
          parserVersion: parsed.parserVersion,
          factCount,
          promptInjectionSignals
        }
      });

      if (promptInjectionSignals.length > 0) {
        await this.auditRepo.append({
          workspaceId: actor.workspaceId,
          disputeId: input.disputeId,
          actorType: 'SYSTEM_WORKER',
          actorId: 'evidence-guard',
          action: 'security.prompt_injection_signals_detected',
          resourceType: 'evidence_asset',
          resourceId: assetId,
          result: 'SUCCESS',
          metadata: { signals: promptInjectionSignals }
        });
      }

      return {
        asset: updated ?? createdAsset,
        factCount,
        promptInjectionSignals
      };
    } catch (error) {
      await this.evidenceRepo.updateExtractionResult(actor.workspaceId, assetId, {
        status: 'FAILED',
        parserVersion: 'failed',
        extractedText: null,
        extractedMetadata: {
          parseError: error instanceof Error ? error.message : 'Unknown parser failure'
        },
        promptInjectionSignals: [],
        documentCreatedAt: null
      });
      throw error;
    }
  }

  async rebuildDeterministicTimeline(workspaceId: string, disputeId: string): Promise<void> {
    const [assets, facts] = await Promise.all([
      this.evidenceRepo.listByWorkspace(workspaceId, { disputeId }),
      this.disputeRepo.listExtractedFacts(workspaceId, disputeId)
    ]);

    const assetById = new Map(assets.map((a) => [a.id, a]));
    const events: Array<{
      sourceAssetId: string | null;
      eventTimestamp: Date | null;
      timestampPrecision: 'EXACT' | 'DATE_ONLY' | 'UNKNOWN';
      eventType: string;
      title: string;
      description: string;
      locator: EvidenceAssetRow extends never ? never : (typeof facts)[number]['locator'] | null;
      verificationStatus: string;
    }> = [];

    for (const asset of assets) {
      if (asset.documentCreatedAt) {
        events.push({
          sourceAssetId: asset.id,
          eventTimestamp: asset.documentCreatedAt,
          timestampPrecision: 'EXACT',
          eventType: 'DOCUMENT_TIMESTAMP',
          title: `Document timestamp: ${asset.originalFilename}`,
          description: `Embedded document metadata timestamp (distinct from application receipt at ${asset.receivedAt.toISOString()}).`,
          locator: null,
          verificationStatus: asset.status === 'NEEDS_REVIEW' ? 'REQUIRES_REVIEW' : 'VERIFIED'
        });
      }
    }

    for (const fact of facts) {
      const asset = assetById.get(fact.sourceAssetId);
      const locatorTimestamp =
        fact.locator.type === 'email_message' && fact.locator.sentAt
          ? new Date(fact.locator.sentAt)
          : fact.locator.type === 'json_path' && fact.locator.timestamp
            ? new Date(fact.locator.timestamp)
            : asset?.documentCreatedAt ?? null;

      events.push({
        sourceAssetId: fact.sourceAssetId,
        eventTimestamp:
          locatorTimestamp && !Number.isNaN(locatorTimestamp.getTime()) ? locatorTimestamp : null,
        timestampPrecision: locatorTimestamp ? 'EXACT' : 'UNKNOWN',
        eventType: fact.factType,
        title: `${fact.factType.replace(/_/g, ' ')} (${asset?.originalFilename ?? 'asset'})`,
        description: fact.factText,
        locator: fact.locator,
        verificationStatus: fact.verificationStatus
      });
    }

    await this.disputeRepo.replaceTimelineEvents(workspaceId, disputeId, events);
  }

  async listAssets(
    actor: ActorContext,
    filters: { disputeId?: string; origin?: RecordOrigin; search?: string } = {}
  ): Promise<EvidenceAssetRow[]> {
    assertAuthorized(actor, 'evidence:read', actor.workspaceId);
    return this.evidenceRepo.listByWorkspace(actor.workspaceId, filters);
  }

  async getAsset(actor: ActorContext, assetId: string): Promise<EvidenceAssetRow> {
    assertAuthorized(actor, 'evidence:read', actor.workspaceId);
    const asset = await this.evidenceRepo.findById(actor.workspaceId, assetId);
    if (!asset) {
      throw new DomainError(
        'EVIDENCE_NOT_FOUND',
        'Evidence asset not found in this workspace.',
        404
      );
    }
    return asset;
  }

  async downloadAssetBytes(
    actor: ActorContext,
    assetId: string
  ): Promise<{ asset: EvidenceAssetRow; bytes: Buffer }> {
    const asset = await this.getAsset(actor, assetId);
    const bytes = await this.storage.getObject(asset.storageKey);

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      disputeId: asset.disputeId,
      actorType: actor.type,
      actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
      action: 'evidence.downloaded',
      resourceType: 'evidence_asset',
      resourceId: asset.id,
      result: 'SUCCESS'
    });

    return { asset, bytes };
  }

  async deleteAsset(actor: ActorContext, assetId: string): Promise<void> {
    assertAuthorized(actor, 'evidence:delete', actor.workspaceId);
    const asset = await this.getAsset(actor, assetId);

    const referenced = await this.evidenceRepo.isAssetReferencedInSubmissions(asset.id);
    if (referenced) {
      throw new DomainError(
        'EVIDENCE_RETENTION_LOCKED',
        'Cannot delete evidence asset because it is referenced by a PayPal submission record.',
        409
      );
    }

    await this.evidenceRepo.deleteAsset(actor.workspaceId, asset.id);
    await this.storage.deleteObject(asset.storageKey);

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      disputeId: asset.disputeId,
      actorType: actor.type,
      actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
      action: 'evidence.deleted',
      resourceType: 'evidence_asset',
      resourceId: asset.id,
      result: 'SUCCESS',
      metadata: { filename: asset.originalFilename, sha256Hash: asset.sha256Hash }
    });
  }
}

