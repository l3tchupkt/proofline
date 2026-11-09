import { z } from 'zod';
import {
  CLAIM_CATEGORIES,
  DISPUTE_LIFECYCLE_STAGES,
  DISPUTE_WORKFLOW_STATUSES,
  EVIDENCE_STATUSES,
  RECORD_ORIGINS,
  SUBMISSION_STATUSES,
  VERIFICATION_STATUSES
} from '@proofline/domain';

export const SourceLocatorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pdf_page'),
    pageNumber: z.number().int().min(1),
    textStart: z.number().int().min(0),
    textEnd: z.number().int().min(0),
    excerpt: z.string().optional()
  }),
  z.object({
    type: z.literal('email_message'),
    messageId: z.string().min(1),
    sender: z.string().optional(),
    recipient: z.string().optional(),
    subject: z.string().optional(),
    sentAt: z.string().optional(),
    textStart: z.number().int().min(0),
    textEnd: z.number().int().min(0),
    excerpt: z.string().optional()
  }),
  z.object({
    type: z.literal('csv_row'),
    rowIndex: z.number().int().min(0),
    columnNames: z.array(z.string()),
    excerpt: z.string().optional()
  }),
  z.object({
    type: z.literal('json_path'),
    jsonPath: z.string().min(1),
    timestamp: z.string().optional(),
    excerpt: z.string().optional()
  }),
  z.object({
    type: z.literal('text_range'),
    lineStart: z.number().int().min(1),
    lineEnd: z.number().int().min(1),
    textStart: z.number().int().min(0),
    textEnd: z.number().int().min(0),
    excerpt: z.string().optional()
  }),
  z.object({
    type: z.literal('image_ocr'),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    extractionMethod: z.enum(['ocr', 'vision', 'metadata']),
    excerpt: z.string().optional()
  })
]);

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

export const AuthUserDtoSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: z.enum(['OWNER', 'OPERATOR', 'REVIEWER']),
  csrfToken: z.string()
});

export const DisputeQuerySchema = z.object({
  origin: z.enum(RECORD_ORIGINS).optional(),
  status: z.enum(DISPUTE_WORKFLOW_STATUSES).optional(),
  reason: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export const DisputeSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  recordOrigin: z.enum(RECORD_ORIGINS),
  paypalDisputeId: z.string(),
  paypalTransactionId: z.string().nullable(),
  reason: z.string(),
  rawStatus: z.string(),
  workflowStatus: z.enum(DISPUTE_WORKFLOW_STATUSES),
  rawLifecycleStage: z.string().nullable(),
  lifecycleStage: z.enum(DISPUTE_LIFECYCLE_STAGES),
  amountMinor: z.number().int(),
  currencyCode: z.string().length(3),
  formattedAmount: z.string(),
  buyerDisplayLabel: z.string().nullable(),
  sellerResponseDueAt: z.string().nullable(),
  disputeCreatedAt: z.string().nullable(),
  outcomeCode: z.string().nullable(),
  lastSyncedAt: z.string().nullable()
});

export const CreateDraftInputSchema = z.object({
  actionType: z
    .enum(['PROVIDE_EVIDENCE', 'PROVIDE_SUPPORTING_INFO', 'SEND_MESSAGE'])
    .default('PROVIDE_EVIDENCE'),
  evidenceType: z.string().min(1).max(128),
  responseNotes: z.string().min(1).max(12000),
  trackingNumber: z.string().max(128).nullable().optional(),
  carrierName: z.string().max(128).nullable().optional(),
  refundId: z.string().max(128).nullable().optional(),
  attachmentAssetIds: z.array(z.string().uuid()).max(25).default([])
});

export const ApproveSubmissionInputSchema = z.object({
  confirmExactContent: z.literal(true),
  approvalNotes: z.string().max(500).optional()
});

export const SubmitSubmissionInputSchema = z.object({
  idempotencyKey: z.string().min(8).max(128).optional()
});

export const InvestigationOutputSchema = z.object({
  summary: z.string(),
  facts: z.array(
    z.object({
      fact: z.string(),
      factType: z.string(),
      sourceAssetId: z.string().uuid(),
      locator: SourceLocatorSchema,
      confidence: z.number().min(0).max(1),
      verificationStatus: z.enum(VERIFICATION_STATUSES),
      isOcrDerived: z.boolean().default(false)
    })
  ),
  timeline: z.array(
    z.object({
      eventTimestamp: z.string().nullable(),
      timestampPrecision: z.enum(['EXACT', 'DATE_ONLY', 'UNKNOWN']),
      eventType: z.string(),
      title: z.string(),
      description: z.string(),
      sourceAssetId: z.string().uuid().nullable(),
      locator: SourceLocatorSchema.nullable(),
      verificationStatus: z.enum(VERIFICATION_STATUSES)
    })
  ),
  supportedClaims: z.array(
    z.object({
      claimText: z.string(),
      category: z.enum(CLAIM_CATEGORIES),
      mappedEvidenceType: z.string().nullable(),
      sources: z
        .array(
          z.object({
            sourceAssetId: z.string().uuid(),
            locator: SourceLocatorSchema
          })
        )
        .min(1)
    })
  ),
  unsupportedClaims: z.array(
    z.object({
      claimText: z.string(),
      reason: z.string()
    })
  ),
  contradictions: z.array(
    z.object({
      description: z.string(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      conflictingAssetIds: z.array(z.string().uuid()).min(1)
    })
  ),
  missingEvidence: z.array(
    z.object({
      evidenceType: z.string(),
      description: z.string(),
      priority: z.enum(['REQUIRED', 'RECOMMENDED'])
    })
  ),
  recommendedEvidenceTypes: z.array(z.string()),
  draftNotes: z.string()
});

export type InvestigationOutput = z.infer<typeof InvestigationOutputSchema>;
export type CreateDraftInput = z.infer<typeof CreateDraftInputSchema>;
export type DisputeQuery = z.infer<typeof DisputeQuerySchema>;

export const EvidenceStatusEnumSchema = z.enum(EVIDENCE_STATUSES);
export const SubmissionStatusEnumSchema = z.enum(SUBMISSION_STATUSES);

