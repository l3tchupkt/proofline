import type { SourceLocator } from '@proofline/domain';
import type { EvidenceGridRow } from '../../components/EvidenceGrid';

export interface DisputeRequirementDto {
  id: string;
  evidenceType: string;
  source: string;
  isRequired: boolean;
  satisfied: boolean;
  rawRequirement: Record<string, unknown>;
}

export interface ExtractedFactDto {
  id: string;
  sourceAssetId: string;
  factType: string;
  factText: string;
  locator: SourceLocator;
  confidence: number;
  verificationStatus: string;
  extractionVersion: string;
  isOcrDerived: boolean;
  createdAt: string;
}

export interface TimelineEventDto {
  id: string;
  sourceAssetId: string | null;
  eventTimestamp: string | null;
  timestampPrecision: 'EXACT' | 'DATE_ONLY' | 'UNKNOWN';
  eventType: string;
  title: string;
  description: string;
  locator: SourceLocator | null;
  verificationStatus: string;
}

export interface ClaimSourceDto {
  id: string;
  claimId: string;
  sourceAssetId: string;
  factId: string | null;
  locator: SourceLocator;
}

export interface EvidenceClaimDto {
  id: string;
  claimText: string;
  category: string;
  verificationStatus: string;
  mappedEvidenceType: string | null;
  sources: ClaimSourceDto[];
}

export interface SubmissionDocumentDto {
  id: string;
  submissionId: string;
  evidenceAssetId: string;
  assetSha256Hash: string;
  attachmentOrder: number;
}

export interface EvidenceSubmissionDto {
  id: string;
  disputeId: string;
  recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
  status: string;
  actionType: 'PROVIDE_EVIDENCE' | 'PROVIDE_SUPPORTING_INFO' | 'SEND_MESSAGE';
  evidenceType: string;
  responseNotes: string;
  trackingNumber: string | null;
  carrierName: string | null;
  refundId: string | null;
  approvalDigest: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  idempotencyKey: string;
  paypalCorrelationId: string | null;
  paypalResponsePayload: Record<string, unknown> | null;
  postSubmitVerificationPayload: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents: SubmissionDocumentDto[];
}

export interface AiRunDto {
  id: string;
  modelId: string;
  status: string;
  structuredOutput: {
    summary?: string;
    contradictions?: Array<{
      description: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      conflictingAssetIds: string[];
    }>;
    missingEvidence?: Array<{
      evidenceType: string;
      description: string;
      priority: 'REQUIRED' | 'RECOMMENDED';
    }>;
    recommendedEvidenceTypes?: string[];
    draftNotes?: string;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DisputeAuditEventDto {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  result: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface DisputeDetailResponse {
  dispute: {
    id: string;
    workspaceId: string;
    recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
    paypalDisputeId: string;
    paypalTransactionId: string | null;
    reason: string;
    rawStatus: string;
    workflowStatus: string;
    rawLifecycleStage: string | null;
    lifecycleStage: string;
    channel: string | null;
    amountMinor: number;
    currencyCode: string;
    formattedAmount: string;
    buyerDisplayLabel: string | null;
    sellerResponseDueAt: string | null;
    disputeCreatedAt: string | null;
    disputeUpdatedAt: string | null;
    outcomeCode: string | null;
    links: Array<{ href: string; rel: string; method?: string }>;
    lastSyncedAt: string | null;
  };
  requirements: DisputeRequirementDto[];
  assets: EvidenceGridRow[];
  facts: ExtractedFactDto[];
  timeline: TimelineEventDto[];
  claims: EvidenceClaimDto[];
  submissions: EvidenceSubmissionDto[];
  aiRuns: AiRunDto[];
  auditEvents: DisputeAuditEventDto[];
}

