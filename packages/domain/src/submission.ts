import { createHash } from 'node:crypto';
import {
  type Dispute,
  type EvidenceSubmission,
  type HateoasLink,
  type SubmissionStatus
} from './entities.js';
import { DomainError } from './errors.js';

export const PAYPAL_SUPPORTED_EVIDENCE_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif'
] as const;

export const PAYPAL_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024; // PayPal requires strictly < 10 MB
export const PAYPAL_MAX_TOTAL_PAYLOAD_BYTES = 50 * 1024 * 1024; // PayPal requires <= 50 MB

export interface SubmissionAttachmentCandidate {
  assetId: string;
  filename: string;
  extension: string;
  byteSize: number;
  sha256Hash: string;
}

export function validatePayPalAttachments(files: SubmissionAttachmentCandidate[]): {
  valid: boolean;
  totalBytes: number;
  errors: string[];
} {
  const errors: string[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const ext = file.extension.toLowerCase().replace(/^\./, '');
    if (!(PAYPAL_SUPPORTED_EVIDENCE_EXTENSIONS as readonly string[]).includes(ext)) {
      errors.push(
        `Attachment "${file.filename}" has unsupported PayPal evidence type ".${ext}". Allowed: pdf, jpg, jpeg, png, gif.`
      );
    }
    if (file.byteSize <= 0) {
      errors.push(`Attachment "${file.filename}" is empty.`);
    }
    if (file.byteSize >= PAYPAL_MAX_SINGLE_FILE_BYTES) {
      errors.push(
        `Attachment "${file.filename}" (${file.byteSize} bytes) must be strictly under 10 MB (${PAYPAL_MAX_SINGLE_FILE_BYTES} bytes).`
      );
    }
    totalBytes += file.byteSize;
  }

  if (totalBytes > PAYPAL_MAX_TOTAL_PAYLOAD_BYTES) {
    errors.push(
      `Combined attachments (${totalBytes} bytes) exceed PayPal 50 MB total request limit (${PAYPAL_MAX_TOTAL_PAYLOAD_BYTES} bytes).`
    );
  }

  return {
    valid: errors.length === 0,
    totalBytes,
    errors
  };
}

export interface ApprovalDigestInput {
  disputeId: string;
  actionType: EvidenceSubmission['actionType'];
  evidenceType: string;
  responseNotes: string;
  trackingNumber: string | null;
  carrierName: string | null;
  refundId: string | null;
  documentHashes: string[];
}

export function computeApprovalDigest(input: ApprovalDigestInput): string {
  const canonicalPayload = JSON.stringify({
    disputeId: input.disputeId,
    actionType: input.actionType,
    evidenceType: input.evidenceType,
    responseNotes: input.responseNotes,
    trackingNumber: input.trackingNumber ?? '',
    carrierName: input.carrierName ?? '',
    refundId: input.refundId ?? '',
    documentHashes: [...input.documentHashes].sort()
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

const ALLOWED_SUBMISSION_TRANSITIONS: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  DRAFT: ['DRAFT', 'VALIDATING', 'AWAITING_APPROVAL', 'APPROVED', 'FAILED'],
  VALIDATING: ['AWAITING_APPROVAL', 'DRAFT', 'FAILED'],
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT', 'FAILED'],
  APPROVED: ['SUBMITTING', 'APPROVED', 'DRAFT', 'FAILED'],
  SUBMITTING: ['SUBMITTED', 'FAILED'],
  SUBMITTED: ['VERIFICATION_PENDING', 'VERIFIED', 'FAILED'],
  VERIFICATION_PENDING: ['VERIFIED', 'FAILED'],
  VERIFIED: [],
  FAILED: ['DRAFT', 'AWAITING_APPROVAL']
};

export function canTransitionSubmissionStatus(
  from: SubmissionStatus,
  to: SubmissionStatus
): boolean {
  return ALLOWED_SUBMISSION_TRANSITIONS[from].includes(to);
}

export function assertSubmissionTransition(
  from: SubmissionStatus,
  to: SubmissionStatus
): void {
  if (!canTransitionSubmissionStatus(from, to)) {
    throw new DomainError(
      'INVALID_SUBMISSION_STATE_TRANSITION',
      `Cannot transition submission from "${from}" to "${to}"`,
      409,
      { from, to }
    );
  }
}

export function evaluateHateoasActionAvailability(
  links: HateoasLink[],
  actionType: EvidenceSubmission['actionType']
): { available: boolean; matchingRel: string | null } {
  const targetRels: Record<EvidenceSubmission['actionType'], string[]> = {
    PROVIDE_EVIDENCE: ['provide_evidence', 'provide-evidence'],
    PROVIDE_SUPPORTING_INFO: ['provide_supporting_info', 'provide-supporting-info'],
    SEND_MESSAGE: ['send_message', 'send-message']
  };

  const candidates = targetRels[actionType];
  for (const link of links) {
    const rel = link.rel.toLowerCase();
    if (candidates.includes(rel)) {
      return { available: true, matchingRel: link.rel };
    }
  }
  return { available: false, matchingRel: null };
}

export function assertDisputeAcceptsAction(
  dispute: Pick<
    Dispute,
    | 'id'
    | 'recordOrigin'
    | 'workflowStatus'
    | 'rawStatus'
    | 'lifecycleStage'
    | 'rawLifecycleStage'
    | 'sellerResponseDueAt'
    | 'links'
  >,
  actionType: EvidenceSubmission['actionType'],
  now: Date = new Date()
): void {
  if (dispute.workflowStatus === 'RESOLVED') {
    throw new DomainError(
      'DISPUTE_ALREADY_RESOLVED',
      `Dispute is already in RESOLVED status (${dispute.rawStatus}); cannot submit new evidence.`,
      409
    );
  }

  if (dispute.workflowStatus === 'UNKNOWN') {
    throw new DomainError(
      'INVALID_DISPUTE_LIFECYCLE_STATE',
      `Dispute has unrecognized PayPal status "${dispute.rawStatus}". Refresh dispute details before submitting.`,
      409
    );
  }

  if (
    actionType === 'PROVIDE_EVIDENCE' &&
    dispute.workflowStatus !== 'WAITING_FOR_SELLER_RESPONSE' &&
    dispute.workflowStatus !== 'OPEN'
  ) {
    throw new DomainError(
      'DISPUTE_NOT_AWAITING_SELLER_RESPONSE',
      `PayPal dispute status "${dispute.rawStatus}" does not allow seller evidence submission.`,
      409
    );
  }

  if (dispute.sellerResponseDueAt && dispute.sellerResponseDueAt.getTime() < now.getTime()) {
    throw new DomainError(
      'DISPUTE_DEADLINE_EXPIRED',
      `Seller response deadline (${dispute.sellerResponseDueAt.toISOString()}) has already passed.`,
      409
    );
  }

  if (dispute.recordOrigin === 'PAYPAL_SANDBOX') {
    const availability = evaluateHateoasActionAvailability(dispute.links, actionType);
    if (!availability.available) {
      throw new DomainError(
        'PAYPAL_ACTION_UNAVAILABLE_HATEOAS',
        `PayPal dispute HATEOAS links do not advertise "${actionType}" in stage "${dispute.rawLifecycleStage ?? 'UNKNOWN'}" and status "${dispute.rawStatus}".`,
        409,
        {
          actionType,
          availableRels: dispute.links.map((l) => l.rel)
        }
      );
    }
  }
}

export function assertSubmissionReadyForExecution(
  submission: EvidenceSubmission,
  currentDigest: string
): void {
  if (submission.status !== 'APPROVED') {
    throw new DomainError(
      'MERCHANT_APPROVAL_REQUIRED',
      `Submission status is "${submission.status}". Explicit merchant approval is required before PayPal execution.`,
      409
    );
  }
  if (!submission.approvedByUserId || !submission.approvedAt || !submission.approvalDigest) {
    throw new DomainError(
      'MERCHANT_APPROVAL_INCOMPLETE',
      'Submission approval metadata is incomplete.',
      409
    );
  }
  if (submission.approvalDigest !== currentDigest) {
    throw new DomainError(
      'APPROVAL_INVALIDATED_CONTENT_CHANGED',
      'Submission content or attached evidence changed after approval. Re-approval is required.',
      409
    );
  }
}

