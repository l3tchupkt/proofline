import { randomUUID } from 'node:crypto';
import { assertAuthorized, type ActorContext } from '@proofline/authorization';
import type { CreateDraftInput } from '@proofline/contracts';
import {
  assertDisputeAcceptsAction,
  assertSubmissionReadyForExecution,
  computeApprovalDigest,
  DomainError,
  normalizePayPalLifecycleStage,
  normalizePayPalStatus,
  validatePayPalAttachments,
  type Dispute,
  type EvidenceSubmission,
  type HateoasLink,
  type SubmissionAttachmentCandidate,
  type SubmissionStatus
} from '@proofline/domain';
import {
  AuditRepository,
  DisputeRepository,
  EvidenceRepository,
  SubmissionRepository,
  type DisputeRow,
  type EvidenceAssetRow,
  type SubmissionWithDocuments
} from '@proofline/database';
import {
  buildEvidenceBundlePdf,
  type EvidenceStorage
} from '@proofline/evidence';
import {
  mapPayPalDisputeToDomain,
  type PayPalEvidenceFilePart,
  type PayPalSandboxClient
} from '@proofline/integration-paypal';
import type { EvidenceService } from './evidenceService.js';

function mapDisputeRowToDomainCheck(row: DisputeRow): Pick<
  Dispute,
  | 'id'
  | 'recordOrigin'
  | 'workflowStatus'
  | 'rawStatus'
  | 'lifecycleStage'
  | 'rawLifecycleStage'
  | 'sellerResponseDueAt'
  | 'links'
> {
  return {
    id: row.id,
    recordOrigin: row.recordOrigin,
    workflowStatus: normalizePayPalStatus(row.rawStatus),
    rawStatus: row.rawStatus,
    lifecycleStage: normalizePayPalLifecycleStage(row.rawLifecycleStage),
    rawLifecycleStage: row.rawLifecycleStage,
    sellerResponseDueAt: row.sellerResponseDueAt,
    links: row.links as HateoasLink[]
  };
}

function mapSubmissionRowToDomain(row: SubmissionWithDocuments): EvidenceSubmission {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    disputeId: row.disputeId,
    recordOrigin: row.recordOrigin,
    status: row.status as SubmissionStatus,
    actionType: row.actionType as EvidenceSubmission['actionType'],
    evidenceType: row.evidenceType,
    responseNotes: row.responseNotes,
    trackingNumber: row.trackingNumber,
    carrierName: row.carrierName,
    refundId: row.refundId,
    approvalDigest: row.approvalDigest,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    idempotencyKey: row.idempotencyKey,
    paypalCorrelationId: row.paypalCorrelationId,
    paypalResponsePayload: row.paypalResponsePayload,
    postSubmitVerificationPayload: row.postSubmitVerificationPayload,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    submittedAt: row.submittedAt,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class SubmissionService {
  constructor(
    private readonly disputeRepo: DisputeRepository,
    private readonly evidenceRepo: EvidenceRepository,
    private readonly submissionRepo: SubmissionRepository,
    private readonly auditRepo: AuditRepository,
    private readonly storage: EvidenceStorage,
    private readonly evidenceService: EvidenceService
  ) {}

  private toAttachmentCandidates(assets: EvidenceAssetRow[]): SubmissionAttachmentCandidate[] {
    return assets.map((asset) => ({
      assetId: asset.id,
      filename: asset.originalFilename,
      extension: asset.extension,
      byteSize: asset.byteSize,
      sha256Hash: asset.sha256Hash
    }));
  }

  private async resolveValidatedAttachments(
    workspaceId: string,
    dispute: DisputeRow,
    attachmentAssetIds: string[]
  ): Promise<EvidenceAssetRow[]> {
    if (attachmentAssetIds.length === 0) return [];
    const uniqueIds = [...new Set(attachmentAssetIds)];
    const assets = await this.evidenceRepo.findManyByIds(workspaceId, uniqueIds);
    if (assets.length !== uniqueIds.length) {
      throw new DomainError(
        'EVIDENCE_NOT_FOUND',
        'One or more selected evidence assets do not exist in this workspace.',
        404
      );
    }

    for (const asset of assets) {
      if (asset.recordOrigin !== dispute.recordOrigin) {
        throw new DomainError(
          'RECORD_ORIGIN_MISMATCH',
          'Cannot attach demo fixture evidence to a live PayPal sandbox dispute or vice versa.',
          409
        );
      }
      if (asset.disputeId && asset.disputeId !== dispute.id) {
        throw new DomainError(
          'EVIDENCE_DISPUTE_MISMATCH',
          `Asset "${asset.originalFilename}" belongs to a different dispute.`,
          409
        );
      }
    }

    const byId = new Map(assets.map((a) => [a.id, a]));
    const ordered = attachmentAssetIds.map((id) => byId.get(id)!);
    const validation = validatePayPalAttachments(this.toAttachmentCandidates(ordered));
    if (!validation.valid) {
      throw new DomainError(
        'PAYPAL_ATTACHMENT_CONSTRAINTS_FAILED',
        validation.errors.join(' '),
        400,
        { errors: validation.errors }
      );
    }

    return ordered;
  }

  async createDraft(
    actor: ActorContext,
    disputeId: string,
    input: CreateDraftInput
  ): Promise<SubmissionWithDocuments> {
    assertAuthorized(actor, 'submission:draft', actor.workspaceId);

    const dispute = await this.disputeRepo.findById(actor.workspaceId, disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found in this workspace.', 404);
    }

    const orderedAssets = await this.resolveValidatedAttachments(
      actor.workspaceId,
      dispute,
      input.attachmentAssetIds
    );

    const submission = await this.submissionRepo.createDraft({
      workspaceId: actor.workspaceId,
      disputeId: dispute.id,
      recordOrigin: dispute.recordOrigin,
      actionType: input.actionType,
      evidenceType: input.evidenceType,
      responseNotes: input.responseNotes,
      trackingNumber: input.trackingNumber ?? null,
      carrierName: input.carrierName ?? null,
      refundId: input.refundId ?? null,
      idempotencyKey: randomUUID(),
      documents: orderedAssets.map((a, idx) => ({
        evidenceAssetId: a.id,
        assetSha256Hash: a.sha256Hash,
        attachmentOrder: idx
      }))
    });

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      disputeId: dispute.id,
      actorType: actor.type,
      actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
      action: 'submission.draft_created',
      resourceType: 'evidence_submission',
      resourceId: submission.id,
      result: 'SUCCESS',
      metadata: {
        evidenceType: input.evidenceType,
        documentCount: orderedAssets.length
      }
    });

    return submission;
  }

  async updateDraft(
    actor: ActorContext,
    submissionId: string,
    input: CreateDraftInput,
    expectedDisputeId?: string
  ): Promise<SubmissionWithDocuments> {
    assertAuthorized(actor, 'submission:draft', actor.workspaceId);

    const existing = await this.submissionRepo.findById(actor.workspaceId, submissionId);
    if (!existing) {
      throw new DomainError('SUBMISSION_NOT_FOUND', 'Submission not found in this workspace.', 404);
    }

    if (expectedDisputeId && existing.disputeId !== expectedDisputeId) {
      throw new DomainError(
        'SUBMISSION_DISPUTE_MISMATCH',
        'Submission does not belong to the specified dispute.',
        404
      );
    }

    const dispute = await this.disputeRepo.findById(actor.workspaceId, existing.disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found in this workspace.', 404);
    }

    const orderedAssets = await this.resolveValidatedAttachments(
      actor.workspaceId,
      dispute,
      input.attachmentAssetIds
    );

    const wasApproved = existing.status === 'APPROVED';
    const updated = await this.submissionRepo.updateDraftAndInvalidateApproval(
      actor.workspaceId,
      submissionId,
      {
        actionType: input.actionType,
        evidenceType: input.evidenceType,
        responseNotes: input.responseNotes,
        trackingNumber: input.trackingNumber ?? null,
        carrierName: input.carrierName ?? null,
        refundId: input.refundId ?? null,
        documents: orderedAssets.map((a, idx) => ({
          evidenceAssetId: a.id,
          assetSha256Hash: a.sha256Hash,
          attachmentOrder: idx
        }))
      }
    );

    if (!updated) {
      throw new DomainError('SUBMISSION_NOT_FOUND', 'Submission not found.', 404);
    }

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      disputeId: dispute.id,
      actorType: actor.type,
      actorId: actor.type === 'MERCHANT_USER' ? actor.userId : actor.type,
      action: wasApproved ? 'submission.edited_approval_invalidated' : 'submission.draft_updated',
      resourceType: 'evidence_submission',
      resourceId: submissionId,
      result: 'SUCCESS',
      metadata: {
        wasApproved,
        documentCount: orderedAssets.length
      }
    });

    return updated;
  }

  async generateEvidenceSummaryPdf(
    actor: ActorContext,
    disputeId: string,
    params: {
      evidenceType: string;
      responseNotes: string;
      assetIds: string[];
    }
  ): Promise<EvidenceAssetRow> {
    assertAuthorized(actor, 'evidence:upload', actor.workspaceId);

    const dispute = await this.disputeRepo.findById(actor.workspaceId, disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found in this workspace.', 404);
    }

    const uniqueAssetIds = [...new Set(params.assetIds)];
    const assets = uniqueAssetIds.length
      ? await this.evidenceRepo.findManyByIds(actor.workspaceId, uniqueAssetIds)
      : await this.evidenceRepo.listByWorkspace(actor.workspaceId, { disputeId: dispute.id });

    if (uniqueAssetIds.length && assets.length !== uniqueAssetIds.length) {
      throw new DomainError(
        'EVIDENCE_NOT_FOUND',
        'One or more selected evidence assets do not exist in this workspace.',
        404
      );
    }

    for (const asset of assets) {
      if (asset.recordOrigin !== dispute.recordOrigin) {
        throw new DomainError(
          'RECORD_ORIGIN_MISMATCH',
          'Cannot compile demo fixture evidence into a live PayPal sandbox dossier or vice versa.',
          409
        );
      }
      if (asset.disputeId && asset.disputeId !== dispute.id) {
        throw new DomainError(
          'EVIDENCE_DISPUTE_MISMATCH',
          `Asset "${asset.originalFilename}" belongs to a different dispute.`,
          409
        );
      }
    }

    const pdfBytes = await buildEvidenceBundlePdf({
      paypalDisputeId: dispute.paypalDisputeId,
      reason: dispute.reason,
      evidenceType: params.evidenceType,
      responseNotes: params.responseNotes,
      entries: assets.map((a) => ({
        filename: a.originalFilename,
        sha256Hash: a.sha256Hash,
        receivedAtIso: a.receivedAt.toISOString(),
        documentCreatedAtIso: a.documentCreatedAt?.toISOString() ?? null,
        excerpt: (a.extractedText ?? '').slice(0, 480)
      }))
    });

    const uploadResult = await this.evidenceService.uploadEvidence(actor, {
      disputeId: dispute.id,
      recordOrigin: dispute.recordOrigin,
      filename: `${dispute.paypalDisputeId}-evidence-dossier.pdf`,
      declaredMimeType: 'application/pdf',
      bytes: pdfBytes
    });

    return uploadResult.asset;
  }

  async approveSubmission(
    actor: ActorContext,
    submissionId: string,
    confirmExactContent: boolean
  ): Promise<SubmissionWithDocuments> {
    assertAuthorized(actor, 'submission:approve', actor.workspaceId);
    if (!confirmExactContent) {
      throw new DomainError(
        'EXPLICIT_APPROVAL_REQUIRED',
        'Merchant must explicitly confirm the exact response text and attached documents.',
        400
      );
    }

    const existing = await this.submissionRepo.findById(actor.workspaceId, submissionId);
    if (!existing) {
      throw new DomainError('SUBMISSION_NOT_FOUND', 'Submission not found in this workspace.', 404);
    }

    const dispute = await this.disputeRepo.findById(actor.workspaceId, existing.disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found.', 404);
    }

    assertDisputeAcceptsAction(
      mapDisputeRowToDomainCheck(dispute),
      existing.actionType as EvidenceSubmission['actionType']
    );

    const assets = await this.evidenceRepo.findManyByIds(
      actor.workspaceId,
      existing.documents.map((d) => d.evidenceAssetId)
    );
    const validation = validatePayPalAttachments(this.toAttachmentCandidates(assets));
    if (!validation.valid) {
      throw new DomainError(
        'PAYPAL_ATTACHMENT_CONSTRAINTS_FAILED',
        validation.errors.join(' '),
        400,
        { errors: validation.errors }
      );
    }

    const approvalDigest = computeApprovalDigest({
      disputeId: existing.disputeId,
      actionType: existing.actionType as EvidenceSubmission['actionType'],
      evidenceType: existing.evidenceType,
      responseNotes: existing.responseNotes,
      trackingNumber: existing.trackingNumber,
      carrierName: existing.carrierName,
      refundId: existing.refundId,
      documentHashes: existing.documents.map((d) => d.assetSha256Hash)
    });

    const userId = actor.type === 'MERCHANT_USER' ? actor.userId : 'system';
    const approvedRow = await this.submissionRepo.approveSubmission(actor.workspaceId, submissionId, {
      approvedByUserId: userId,
      approvalDigest,
      approvedAt: new Date()
    });

    if (!approvedRow) {
      throw new DomainError('APPROVAL_FAILED', 'Unable to approve submission.', 409);
    }

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      disputeId: dispute.id,
      actorType: actor.type,
      actorId: userId,
      action: 'submission.approved',
      resourceType: 'evidence_submission',
      resourceId: submissionId,
      result: 'SUCCESS',
      metadata: {
        approvalDigest,
        documentCount: existing.documents.length
      }
    });

    return { ...approvedRow, documents: existing.documents };
  }

  async submitApprovedSubmission(
    actor: ActorContext,
    submissionId: string,
    paypalClient: PayPalSandboxClient
  ): Promise<SubmissionWithDocuments> {
    assertAuthorized(actor, 'submission:submit', actor.workspaceId);

    const existing = await this.submissionRepo.findById(actor.workspaceId, submissionId);
    if (!existing) {
      throw new DomainError('SUBMISSION_NOT_FOUND', 'Submission not found in this workspace.', 404);
    }

    // Prevent duplicate submission on double-clicks / retries
    if (
      existing.status === 'SUBMITTED' ||
      existing.status === 'VERIFICATION_PENDING' ||
      existing.status === 'VERIFIED' ||
      existing.status === 'SUBMITTING'
    ) {
      throw new DomainError(
        'DUPLICATE_SUBMISSION_PREVENTED',
        `Submission is already in "${existing.status}" state and cannot be re-submitted.`,
        409
      );
    }

    const dispute = await this.disputeRepo.findById(actor.workspaceId, existing.disputeId);
    if (!dispute) {
      throw new DomainError('DISPUTE_NOT_FOUND', 'Dispute not found.', 404);
    }

    // Never allow fake PayPal success for demo fixtures
    if (dispute.recordOrigin === 'DEMO_FIXTURE') {
      throw new DomainError(
        'DEMO_SUBMISSION_BLOCKED',
        'Demo fixture disputes cannot be submitted to PayPal. Configure Sandbox credentials and sync a live Sandbox dispute to test PayPal evidence submission.',
        409
      );
    }

    const currentDigest = computeApprovalDigest({
      disputeId: existing.disputeId,
      actionType: existing.actionType as EvidenceSubmission['actionType'],
      evidenceType: existing.evidenceType,
      responseNotes: existing.responseNotes,
      trackingNumber: existing.trackingNumber,
      carrierName: existing.carrierName,
      refundId: existing.refundId,
      documentHashes: existing.documents.map((d) => d.assetSha256Hash)
    });

    assertSubmissionReadyForExecution(mapSubmissionRowToDomain(existing), currentDigest);

    // Atomically lock submission in SUBMITTING state so concurrent clicks fail cleanly
    const locked = await this.submissionRepo.transitionStatus(
      actor.workspaceId,
      submissionId,
      'APPROVED',
      'SUBMITTING'
    );
    if (!locked) {
      throw new DomainError(
        'DUPLICATE_SUBMISSION_PREVENTED',
        'Submission state changed concurrently; duplicate submission aborted.',
        409
      );
    }

    const assets = await this.evidenceRepo.findManyByIds(
      actor.workspaceId,
      existing.documents.map((d) => d.evidenceAssetId)
    );
    const assetById = new Map(assets.map((a) => [a.id, a]));
    const orderedAssets = existing.documents.map((d) => {
      const found = assetById.get(d.evidenceAssetId);
      if (!found) {
        throw new DomainError(
          'EVIDENCE_NOT_FOUND',
          'Attached evidence asset is no longer available.',
          404
        );
      }
      return found;
    });

    const fileParts: PayPalEvidenceFilePart[] = [];
    for (const asset of orderedAssets) {
      const content = await this.storage.getObject(asset.storageKey);
      fileParts.push({
        candidate: {
          assetId: asset.id,
          filename: asset.originalFilename,
          extension: asset.extension,
          byteSize: asset.byteSize,
          sha256Hash: asset.sha256Hash
        },
        mimeType: asset.mimeType,
        content
      });
    }

    const actorId = actor.type === 'MERCHANT_USER' ? actor.userId : actor.type;

    try {
      let correlationId = '';
      let apiResponse: Record<string, unknown> = {};
      let verifiedDispute: Awaited<ReturnType<PayPalSandboxClient['getDispute']>> | null = null;
      let postSubmitVerifyError: string | null = null;

      if (existing.actionType === 'PROVIDE_EVIDENCE') {
        // Call provide-evidence and retrieve updated dispute to verify PayPal state.
        const filesValidation = validatePayPalAttachments(fileParts.map((f) => f.candidate));
        if (!filesValidation.valid) {
          throw new DomainError(
            'PAYPAL_ATTACHMENT_CONSTRAINTS_FAILED',
            filesValidation.errors.join(' '),
            400
          );
        }

        const result = await paypalClient.provideEvidence({
          disputeId: dispute.paypalDisputeId,
          evidenceType: existing.evidenceType,
          notes: existing.responseNotes,
          trackingInfo:
            existing.carrierName && existing.trackingNumber
              ? [
                  {
                    carrierName: existing.carrierName,
                    trackingNumber: existing.trackingNumber
                  }
                ]
              : undefined,
          refundIds: existing.refundId ? [existing.refundId] : undefined,
          files: fileParts
        });
        correlationId = result.correlationId;
        apiResponse = result.response;
        verifiedDispute = result.verifiedDispute;
        postSubmitVerifyError = result.verificationError ?? null;
      } else if (existing.actionType === 'PROVIDE_SUPPORTING_INFO') {
        const result = await paypalClient.provideSupportingInfo({
          disputeId: dispute.paypalDisputeId,
          notes: existing.responseNotes,
          files: fileParts
        });
        correlationId = result.correlationId;
        apiResponse = result.response;
        try {
          verifiedDispute = await paypalClient.getDispute(dispute.paypalDisputeId);
        } catch (verifyErr) {
          postSubmitVerifyError =
            verifyErr instanceof Error ? verifyErr.message : 'Post-submission verification failed';
        }
      } else {
        const result = await paypalClient.sendMessage({
          disputeId: dispute.paypalDisputeId,
          message: existing.responseNotes
        });
        correlationId = result.correlationId;
        apiResponse = result.response;
        try {
          verifiedDispute = await paypalClient.getDispute(dispute.paypalDisputeId);
        } catch (verifyErr) {
          postSubmitVerifyError =
            verifyErr instanceof Error ? verifyErr.message : 'Post-submission verification failed';
        }
      }

      const submittedRow = await this.submissionRepo.transitionStatus(
        actor.workspaceId,
        submissionId,
        'SUBMITTING',
        'SUBMITTED',
        {
          paypalCorrelationId: correlationId,
          paypalResponsePayload: apiResponse,
          submittedAt: new Date()
        }
      );

      if (!submittedRow) {
        throw new DomainError('SUBMISSION_STATE_ERROR', 'Failed to persist SUBMITTED state.', 500);
      }

      if (verifiedDispute) {
        const mappedAfter = mapPayPalDisputeToDomain(verifiedDispute);
        await this.disputeRepo.upsertDispute({
          workspaceId: actor.workspaceId,
          recordOrigin: 'PAYPAL_SANDBOX',
          paypalDisputeId: mappedAfter.paypalDisputeId,
          paypalTransactionId: mappedAfter.paypalTransactionId,
          reason: mappedAfter.reason,
          rawStatus: mappedAfter.rawStatus,
          workflowStatus: mappedAfter.workflowStatus,
          rawLifecycleStage: mappedAfter.rawLifecycleStage,
          lifecycleStage: mappedAfter.lifecycleStage,
          channel: mappedAfter.channel,
          amountMinor: mappedAfter.amountMinor,
          currencyCode: mappedAfter.currencyCode,
          buyerDisplayLabel: mappedAfter.buyerDisplayLabel,
          sellerResponseDueAt: mappedAfter.sellerResponseDueAt,
          disputeCreatedAt: mappedAfter.disputeCreatedAt,
          disputeUpdatedAt: mappedAfter.disputeUpdatedAt,
          outcomeCode: mappedAfter.outcomeCode,
          links: mappedAfter.links,
          rawPayload: mappedAfter.rawPayload,
          lastSyncedAt: new Date()
        });
        await this.disputeRepo.replaceRequirements(
          actor.workspaceId,
          dispute.id,
          mappedAfter.requirements
        );

        const verifiedRow = await this.submissionRepo.transitionStatus(
          actor.workspaceId,
          submissionId,
          'SUBMITTED',
          'VERIFIED',
          {
            postSubmitVerificationPayload: verifiedDispute as unknown as Record<string, unknown>,
            verifiedAt: new Date()
          }
        );

        await this.auditRepo.append({
          workspaceId: actor.workspaceId,
          disputeId: dispute.id,
          actorType: actor.type,
          actorId,
          action: 'submission.paypal_verified',
          resourceType: 'evidence_submission',
          resourceId: submissionId,
          result: 'SUCCESS',
          metadata: {
            correlationId,
            paypalStatusAfterSubmission: mappedAfter.rawStatus,
            note: 'API acceptance verified by retrieving PayPal dispute; dispute outcome remains under PayPal review.'
          }
        });

        return { ...(verifiedRow ?? submittedRow), documents: existing.documents };
      }

      const pendingRow = await this.submissionRepo.transitionStatus(
        actor.workspaceId,
        submissionId,
        'SUBMITTED',
        'VERIFICATION_PENDING',
        {
          errorCode: 'POST_SUBMIT_VERIFICATION_FAILED',
          errorMessage:
            postSubmitVerifyError ?? 'PayPal accepted submission, but follow-up GET dispute failed.'
        }
      );

      await this.auditRepo.append({
        workspaceId: actor.workspaceId,
        disputeId: dispute.id,
        actorType: actor.type,
        actorId,
        action: 'submission.verification_pending',
        resourceType: 'evidence_submission',
        resourceId: submissionId,
        result: 'FAILURE',
        metadata: {
          correlationId,
          errorMessage: postSubmitVerifyError
        }
      });

      return { ...(pendingRow ?? submittedRow), documents: existing.documents };
    } catch (error) {
      const errCode = error instanceof DomainError ? error.code : 'PAYPAL_SUBMISSION_FAILED';
      const errMsg = error instanceof Error ? error.message : 'PayPal evidence submission failed';
      await this.submissionRepo.transitionStatus(
        actor.workspaceId,
        submissionId,
        'SUBMITTING',
        'FAILED',
        {
          errorCode: errCode,
          errorMessage: errMsg
        }
      );

      await this.auditRepo.append({
        workspaceId: actor.workspaceId,
        disputeId: dispute.id,
        actorType: actor.type,
        actorId,
        action: 'submission.failed',
        resourceType: 'evidence_submission',
        resourceId: submissionId,
        result: 'FAILURE',
        metadata: { errorCode: errCode, errorMessage: errMsg }
      });

      throw error;
    }
  }
}
