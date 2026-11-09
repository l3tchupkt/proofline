import { and, asc, desc, eq } from 'drizzle-orm';
import {
  assertSubmissionTransition,
  type RecordOrigin,
  type SubmissionStatus
} from '@proofline/domain';
import type { ProoflineDatabase } from '../client.js';
import { evidenceSubmissions, submissionDocuments } from '../schema/index.js';

export type EvidenceSubmissionRow = typeof evidenceSubmissions.$inferSelect;
export type SubmissionDocumentRow = typeof submissionDocuments.$inferSelect;

export interface SubmissionWithDocuments extends EvidenceSubmissionRow {
  documents: SubmissionDocumentRow[];
}

export class SubmissionRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async createDraft(input: {
    workspaceId: string;
    disputeId: string;
    recordOrigin: RecordOrigin;
    actionType: 'PROVIDE_EVIDENCE' | 'PROVIDE_SUPPORTING_INFO' | 'SEND_MESSAGE';
    evidenceType: string;
    responseNotes: string;
    trackingNumber: string | null;
    carrierName: string | null;
    refundId: string | null;
    idempotencyKey: string;
    documents: Array<{
      evidenceAssetId: string;
      assetSha256Hash: string;
      attachmentOrder: number;
    }>;
  }): Promise<SubmissionWithDocuments> {
    return this.db.transaction(async (tx) => {
      const [submission] = await tx
        .insert(evidenceSubmissions)
        .values({
          workspaceId: input.workspaceId,
          disputeId: input.disputeId,
          recordOrigin: input.recordOrigin,
          status: 'AWAITING_APPROVAL',
          actionType: input.actionType,
          evidenceType: input.evidenceType,
          responseNotes: input.responseNotes,
          trackingNumber: input.trackingNumber,
          carrierName: input.carrierName,
          refundId: input.refundId,
          idempotencyKey: input.idempotencyKey
        })
        .returning();

      if (!submission) throw new Error('Failed to create submission draft');

      let docs: SubmissionDocumentRow[] = [];
      if (input.documents.length > 0) {
        docs = await tx
          .insert(submissionDocuments)
          .values(
            input.documents.map((d) => ({
              submissionId: submission.id,
              evidenceAssetId: d.evidenceAssetId,
              assetSha256Hash: d.assetSha256Hash,
              attachmentOrder: d.attachmentOrder
            }))
          )
          .returning();
      }

      return { ...submission, documents: docs };
    });
  }

  async findById(workspaceId: string, submissionId: string): Promise<SubmissionWithDocuments | null> {
    const [submission] = await this.db
      .select()
      .from(evidenceSubmissions)
      .where(
        and(
          eq(evidenceSubmissions.workspaceId, workspaceId),
          eq(evidenceSubmissions.id, submissionId)
        )
      )
      .limit(1);

    if (!submission) return null;

    const docs = await this.db
      .select()
      .from(submissionDocuments)
      .where(eq(submissionDocuments.submissionId, submission.id))
      .orderBy(asc(submissionDocuments.attachmentOrder));

    return { ...submission, documents: docs };
  }

  async listByDispute(
    workspaceId: string,
    disputeId: string
  ): Promise<SubmissionWithDocuments[]> {
    const rows = await this.db
      .select()
      .from(evidenceSubmissions)
      .where(
        and(
          eq(evidenceSubmissions.workspaceId, workspaceId),
          eq(evidenceSubmissions.disputeId, disputeId)
        )
      )
      .orderBy(desc(evidenceSubmissions.createdAt));

    const results: SubmissionWithDocuments[] = [];
    for (const row of rows) {
      const docs = await this.db
        .select()
        .from(submissionDocuments)
        .where(eq(submissionDocuments.submissionId, row.id))
        .orderBy(asc(submissionDocuments.attachmentOrder));
      results.push({ ...row, documents: docs });
    }
    return results;
  }

  async listRecentByWorkspace(workspaceId: string, limit = 15): Promise<EvidenceSubmissionRow[]> {
    return this.db
      .select()
      .from(evidenceSubmissions)
      .where(eq(evidenceSubmissions.workspaceId, workspaceId))
      .orderBy(desc(evidenceSubmissions.updatedAt))
      .limit(limit);
  }

  /**
   * Edits submission content/documents in a single transaction.
   * If previously APPROVED or AWAITING_APPROVAL, resets approval fields and status to DRAFT
   * so the merchant must re-approve the exact updated content.
   */
  async updateDraftAndInvalidateApproval(
    workspaceId: string,
    submissionId: string,
    update: {
      actionType?: 'PROVIDE_EVIDENCE' | 'PROVIDE_SUPPORTING_INFO' | 'SEND_MESSAGE';
      evidenceType: string;
      responseNotes: string;
      trackingNumber: string | null;
      carrierName: string | null;
      refundId: string | null;
      documents: Array<{
        evidenceAssetId: string;
        assetSha256Hash: string;
        attachmentOrder: number;
      }>;
    }
  ): Promise<SubmissionWithDocuments | null> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(evidenceSubmissions)
        .where(
          and(
            eq(evidenceSubmissions.workspaceId, workspaceId),
            eq(evidenceSubmissions.id, submissionId)
          )
        )
        .limit(1);

      if (!existing) return null;

      assertSubmissionTransition(existing.status as SubmissionStatus, 'DRAFT');

      const [updated] = await tx
        .update(evidenceSubmissions)
        .set({
          ...(update.actionType ? { actionType: update.actionType } : {}),
          evidenceType: update.evidenceType,
          responseNotes: update.responseNotes,
          trackingNumber: update.trackingNumber,
          carrierName: update.carrierName,
          refundId: update.refundId,
          status: 'DRAFT',
          approvalDigest: null,
          approvedByUserId: null,
          approvedAt: null,
          updatedAt: new Date()
        })
        .where(eq(evidenceSubmissions.id, existing.id))
        .returning();

      if (!updated) throw new Error('Failed to update submission');

      await tx
        .delete(submissionDocuments)
        .where(eq(submissionDocuments.submissionId, existing.id));

      let docs: SubmissionDocumentRow[] = [];
      if (update.documents.length > 0) {
        docs = await tx
          .insert(submissionDocuments)
          .values(
            update.documents.map((d) => ({
              submissionId: existing.id,
              evidenceAssetId: d.evidenceAssetId,
              assetSha256Hash: d.assetSha256Hash,
              attachmentOrder: d.attachmentOrder
            }))
          )
          .returning();
      }

      return { ...updated, documents: docs };
    });
  }

  async approveSubmission(
    workspaceId: string,
    submissionId: string,
    approval: {
      approvedByUserId: string;
      approvalDigest: string;
      approvedAt: Date;
    }
  ): Promise<EvidenceSubmissionRow | null> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(evidenceSubmissions)
        .where(
          and(
            eq(evidenceSubmissions.workspaceId, workspaceId),
            eq(evidenceSubmissions.id, submissionId)
          )
        )
        .limit(1);

      if (!existing) return null;

      const currentStatus = existing.status as SubmissionStatus;
      assertSubmissionTransition(currentStatus, 'APPROVED');

      const [updated] = await tx
        .update(evidenceSubmissions)
        .set({
          status: 'APPROVED',
          approvedByUserId: approval.approvedByUserId,
          approvalDigest: approval.approvalDigest,
          approvedAt: approval.approvedAt,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date()
        })
        .where(eq(evidenceSubmissions.id, existing.id))
        .returning();

      return updated ?? null;
    });
  }

  async transitionStatus(
    workspaceId: string,
    submissionId: string,
    expectedCurrentStatus: SubmissionStatus,
    nextStatus: SubmissionStatus,
    fields: Partial<{
      paypalCorrelationId: string | null;
      paypalResponsePayload: Record<string, unknown> | null;
      postSubmitVerificationPayload: Record<string, unknown> | null;
      errorCode: string | null;
      errorMessage: string | null;
      submittedAt: Date | null;
      verifiedAt: Date | null;
    }> = {}
  ): Promise<EvidenceSubmissionRow | null> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(evidenceSubmissions)
        .where(
          and(
            eq(evidenceSubmissions.workspaceId, workspaceId),
            eq(evidenceSubmissions.id, submissionId),
            eq(evidenceSubmissions.status, expectedCurrentStatus)
          )
        )
        .limit(1);

      if (!existing) return null;

      assertSubmissionTransition(existing.status as SubmissionStatus, nextStatus);

      const [updated] = await tx
        .update(evidenceSubmissions)
        .set({
          status: nextStatus,
          ...fields,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(evidenceSubmissions.id, existing.id),
            eq(evidenceSubmissions.status, expectedCurrentStatus)
          )
        )
        .returning();

      return updated ?? null;
    });
  }
}

