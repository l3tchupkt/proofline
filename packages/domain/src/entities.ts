export const RECORD_ORIGINS = ['PAYPAL_SANDBOX', 'DEMO_FIXTURE'] as const;
export type RecordOrigin = (typeof RECORD_ORIGINS)[number];

export const DISPUTE_WORKFLOW_STATUSES = [
  'OPEN',
  'WAITING_FOR_SELLER_RESPONSE',
  'WAITING_FOR_BUYER_RESPONSE',
  'UNDER_REVIEW',
  'RESOLVED',
  'UNKNOWN'
] as const;
export type DisputeWorkflowStatus = (typeof DISPUTE_WORKFLOW_STATUSES)[number];

export const DISPUTE_LIFECYCLE_STAGES = [
  'INQUIRY',
  'CHARGEBACK',
  'PRE_ARBITRATION',
  'ARBITRATION',
  'UNKNOWN'
] as const;
export type DisputeLifecycleStage = (typeof DISPUTE_LIFECYCLE_STAGES)[number];

export const EVIDENCE_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'PROCESSED',
  'NEEDS_REVIEW',
  'FAILED'
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  'DRAFT',
  'VALIDATING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTING',
  'SUBMITTED',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'FAILED'
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const CLAIM_CATEGORIES = [
  'VERIFIED_FACT',
  'AI_INTERPRETATION',
  'MERCHANT_ASSERTION',
  'MISSING_EVIDENCE',
  'CONFLICTING_EVIDENCE'
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const VERIFICATION_STATUSES = [
  'VERIFIED',
  'REQUIRES_REVIEW',
  'CONFLICTING',
  'UNSUPPORTED'
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type SourceLocator =
  | {
      type: 'pdf_page';
      pageNumber: number;
      textStart: number;
      textEnd: number;
      excerpt?: string;
    }
  | {
      type: 'email_message';
      messageId: string;
      sender?: string;
      recipient?: string;
      subject?: string;
      sentAt?: string;
      textStart: number;
      textEnd: number;
      excerpt?: string;
    }
  | {
      type: 'csv_row';
      rowIndex: number;
      columnNames: string[];
      excerpt?: string;
    }
  | {
      type: 'json_path';
      jsonPath: string;
      timestamp?: string;
      excerpt?: string;
    }
  | {
      type: 'text_range';
      lineStart: number;
      lineEnd: number;
      textStart: number;
      textEnd: number;
      excerpt?: string;
    }
  | {
      type: 'image_ocr';
      width?: number;
      height?: number;
      extractionMethod: 'ocr' | 'vision' | 'metadata';
      excerpt?: string;
    };

export interface HateoasLink {
  href: string;
  rel: string;
  method?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  paypalMerchantPayerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'OPERATOR' | 'REVIEWER';
  createdAt: Date;
}

export interface Dispute {
  id: string;
  workspaceId: string;
  recordOrigin: RecordOrigin;
  paypalDisputeId: string;
  paypalTransactionId: string | null;
  reason: string;
  rawStatus: string;
  workflowStatus: DisputeWorkflowStatus;
  rawLifecycleStage: string | null;
  lifecycleStage: DisputeLifecycleStage;
  channel: string | null;
  amountMinor: number;
  currencyCode: string;
  buyerDisplayLabel: string | null;
  sellerResponseDueAt: Date | null;
  disputeCreatedAt: Date | null;
  disputeUpdatedAt: Date | null;
  outcomeCode: string | null;
  links: HateoasLink[];
  rawPayload: Record<string, unknown>;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvidenceAsset {
  id: string;
  workspaceId: string;
  disputeId: string | null;
  recordOrigin: RecordOrigin;
  uploadedByUserId: string;
  originalFilename: string;
  extension: string;
  mimeType: string;
  byteSize: number;
  sha256Hash: string;
  storageDriver: 'local' | 's3';
  storageKey: string;
  status: EvidenceStatus;
  parserVersion: string | null;
  extractedText: string | null;
  extractedMetadata: Record<string, unknown>;
  promptInjectionSignals: string[];
  documentCreatedAt: Date | null;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractedFact {
  id: string;
  workspaceId: string;
  disputeId: string;
  sourceAssetId: string;
  factType: string;
  factText: string;
  locator: SourceLocator;
  confidence: number;
  verificationStatus: VerificationStatus;
  extractionVersion: string;
  isOcrDerived: boolean;
  createdAt: Date;
}

export interface TimelineEvent {
  id: string;
  workspaceId: string;
  disputeId: string;
  sourceAssetId: string | null;
  eventTimestamp: Date | null;
  timestampPrecision: 'EXACT' | 'DATE_ONLY' | 'UNKNOWN';
  eventType: string;
  title: string;
  description: string;
  locator: SourceLocator | null;
  verificationStatus: VerificationStatus;
  createdAt: Date;
}

export interface EvidenceRequirement {
  id: string;
  workspaceId: string;
  disputeId: string;
  evidenceType: string;
  source: string;
  isRequired: boolean;
  satisfied: boolean;
  rawRequirement: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvidenceClaim {
  id: string;
  workspaceId: string;
  disputeId: string;
  aiRunId: string | null;
  claimText: string;
  category: ClaimCategory;
  verificationStatus: VerificationStatus;
  mappedEvidenceType: string | null;
  createdAt: Date;
}

export interface ClaimSource {
  id: string;
  claimId: string;
  sourceAssetId: string;
  factId: string | null;
  locator: SourceLocator;
}

export interface EvidenceSubmission {
  id: string;
  workspaceId: string;
  disputeId: string;
  recordOrigin: RecordOrigin;
  status: SubmissionStatus;
  actionType: 'PROVIDE_EVIDENCE' | 'PROVIDE_SUPPORTING_INFO' | 'SEND_MESSAGE';
  evidenceType: string;
  responseNotes: string;
  trackingNumber: string | null;
  carrierName: string | null;
  refundId: string | null;
  approvalDigest: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  idempotencyKey: string;
  paypalCorrelationId: string | null;
  paypalResponsePayload: Record<string, unknown> | null;
  postSubmitVerificationPayload: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  submittedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizePayPalStatus(rawStatus: string | null | undefined): DisputeWorkflowStatus {
  if (!rawStatus) return 'UNKNOWN';
  const normalized = rawStatus.trim().toUpperCase();
  switch (normalized) {
    case 'OPEN':
      return 'OPEN';
    case 'WAITING_FOR_SELLER_RESPONSE':
      return 'WAITING_FOR_SELLER_RESPONSE';
    case 'WAITING_FOR_BUYER_RESPONSE':
      return 'WAITING_FOR_BUYER_RESPONSE';
    case 'UNDER_REVIEW':
      return 'UNDER_REVIEW';
    case 'RESOLVED':
      return 'RESOLVED';
    default:
      return 'UNKNOWN';
  }
}

export function normalizePayPalLifecycleStage(
  rawStage: string | null | undefined
): DisputeLifecycleStage {
  if (!rawStage) return 'UNKNOWN';
  const normalized = rawStage.trim().toUpperCase();
  switch (normalized) {
    case 'INQUIRY':
      return 'INQUIRY';
    case 'CHARGEBACK':
      return 'CHARGEBACK';
    case 'PRE_ARBITRATION':
      return 'PRE_ARBITRATION';
    case 'ARBITRATION':
      return 'ARBITRATION';
    default:
      return 'UNKNOWN';
  }
}

