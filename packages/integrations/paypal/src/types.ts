import { z } from 'zod';
import {
  Money,
  normalizePayPalLifecycleStage,
  normalizePayPalStatus,
  type HateoasLink
} from '@proofline/domain';

export const PayPalAmountSchema = z.object({
  currency_code: z.string().length(3),
  value: z.string()
});

export const PayPalHateoasLinkSchema = z.object({
  href: z.string(),
  rel: z.string(),
  method: z.string().optional()
});

export const PayPalEvidenceItemSchema = z
  .object({
    evidence_type: z.string(),
    evidence_info: z.record(z.string(), z.unknown()).optional(),
    documents: z.array(z.record(z.string(), z.unknown())).optional(),
    notes: z.string().optional(),
    source: z.string().optional(),
    date: z.string().optional()
  })
  .passthrough();

export const PayPalDisputedTransactionSchema = z
  .object({
    buyer_transaction_id: z.string().optional(),
    seller_transaction_id: z.string().optional(),
    create_time: z.string().optional(),
    transaction_status: z.string().optional(),
    gross_amount: PayPalAmountSchema.optional(),
    buyer: z
      .object({
        name: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export const PayPalDisputeDetailSchema = z
  .object({
    dispute_id: z.string(),
    create_time: z.string().optional(),
    update_time: z.string().optional(),
    disputed_transactions: z.array(PayPalDisputedTransactionSchema).optional(),
    reason: z.string().default('UNKNOWN'),
    status: z.string().default('UNKNOWN'),
    dispute_amount: PayPalAmountSchema.optional(),
    dispute_outcome: z
      .object({
        outcome_code: z.string().optional(),
        amount_refunded: PayPalAmountSchema.optional()
      })
      .passthrough()
      .optional(),
    dispute_life_cycle_stage: z.string().optional(),
    dispute_channel: z.string().optional(),
    seller_response_due_date: z.string().optional(),
    evidences: z.array(PayPalEvidenceItemSchema).optional(),
    supporting_info: z.array(z.record(z.string(), z.unknown())).optional(),
    messages: z.array(z.record(z.string(), z.unknown())).optional(),
    links: z.array(PayPalHateoasLinkSchema).optional()
  })
  .passthrough();

export const PayPalDisputeListResponseSchema = z
  .object({
    items: z.array(PayPalDisputeDetailSchema).default([]),
    links: z.array(PayPalHateoasLinkSchema).optional()
  })
  .passthrough();

export const PayPalWebhookVerifyResponseSchema = z.object({
  verification_status: z.enum(['SUCCESS', 'FAILURE'])
});

export type PayPalDisputeDetail = z.infer<typeof PayPalDisputeDetailSchema>;
export type PayPalDisputeListResponse = z.infer<typeof PayPalDisputeListResponseSchema>;

export interface NormalizedPayPalDispute {
  paypalDisputeId: string;
  paypalTransactionId: string | null;
  reason: string;
  rawStatus: string;
  workflowStatus: ReturnType<typeof normalizePayPalStatus>;
  rawLifecycleStage: string | null;
  lifecycleStage: ReturnType<typeof normalizePayPalLifecycleStage>;
  channel: string | null;
  amountMinor: number;
  currencyCode: string;
  buyerDisplayLabel: string | null;
  sellerResponseDueAt: Date | null;
  disputeCreatedAt: Date | null;
  disputeUpdatedAt: Date | null;
  outcomeCode: string | null;
  links: HateoasLink[];
  requirements: Array<{
    evidenceType: string;
    source: string;
    isRequired: boolean;
    satisfied: boolean;
    rawRequirement: Record<string, unknown>;
  }>;
  rawPayload: Record<string, unknown>;
}

const DEFAULT_EVIDENCE_BY_REASON: Record<string, string[]> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: ['PROOF_OF_FULFILLMENT', 'PROOF_OF_REFUND'],
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: [
    'PROOF_OF_FULFILLMENT',
    'PROOF_OF_REFUND',
    'OTHER'
  ],
  UNAUTHORIZED: ['PROOF_OF_FULFILLMENT', 'PROOF_OF_DELIVERY_SIGNATURE', 'OTHER'],
  CREDIT_NOT_PROCESSED: ['PROOF_OF_REFUND', 'OTHER'],
  DUPLICATE_TRANSACTION: ['PROOF_OF_REFUND', 'OTHER'],
  INCORRECT_AMOUNT: ['PROOF_OF_REFUND', 'OTHER']
};

function safeParseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapPayPalDisputeToDomain(detail: PayPalDisputeDetail): NormalizedPayPalDispute {
  const firstTxn = detail.disputed_transactions?.[0];
  const amountSource = detail.dispute_amount ?? firstTxn?.gross_amount;
  const money = amountSource
    ? Money.fromDecimalString(amountSource.value, amountSource.currency_code)
    : Money.fromMinorUnits(0, 'USD');

  const requirementsMap = new Map<
    string,
    {
      evidenceType: string;
      source: string;
      isRequired: boolean;
      satisfied: boolean;
      rawRequirement: Record<string, unknown>;
    }
  >();

  // Preserve actual PayPal returned evidence entries verbatim, including unknown evidence types.
  for (const ev of detail.evidences ?? []) {
    const source = ev.source ?? 'SUBMITTED_TO_PAYPAL';
    const key = `${ev.evidence_type}::${source}`;
    const hasDocs = Boolean(ev.documents?.length) || Boolean(ev.notes) || Boolean(ev.evidence_info);
    requirementsMap.set(key, {
      evidenceType: ev.evidence_type,
      source,
      isRequired: true,
      satisfied: source === 'SUBMITTED_BY_SELLER' && hasDocs,
      rawRequirement: ev as Record<string, unknown>
    });
  }

  // Also include PayPal documented requested evidence types for this reason if none listed yet.
  const defaultTypes = DEFAULT_EVIDENCE_BY_REASON[detail.reason] ?? ['OTHER'];
  if (requirementsMap.size === 0) {
    for (const evidenceType of defaultTypes) {
      requirementsMap.set(`${evidenceType}::PAYPAL_REASON_GUIDANCE`, {
        evidenceType,
        source: 'PAYPAL_REASON_GUIDANCE',
        isRequired: true,
        satisfied: false,
        rawRequirement: { reason: detail.reason, evidence_type: evidenceType }
      });
    }
  }

  return {
    paypalDisputeId: detail.dispute_id,
    paypalTransactionId:
      firstTxn?.seller_transaction_id ?? firstTxn?.buyer_transaction_id ?? null,
    reason: detail.reason,
    rawStatus: detail.status,
    workflowStatus: normalizePayPalStatus(detail.status),
    rawLifecycleStage: detail.dispute_life_cycle_stage ?? null,
    lifecycleStage: normalizePayPalLifecycleStage(detail.dispute_life_cycle_stage),
    channel: detail.dispute_channel ?? null,
    amountMinor: money.amountMinor,
    currencyCode: money.currencyCode,
    buyerDisplayLabel: firstTxn?.buyer?.name ?? null,
    sellerResponseDueAt: safeParseDate(detail.seller_response_due_date),
    disputeCreatedAt: safeParseDate(detail.create_time),
    disputeUpdatedAt: safeParseDate(detail.update_time),
    outcomeCode: detail.dispute_outcome?.outcome_code ?? null,
    links: (detail.links ?? []).map((l) => ({
      href: l.href,
      rel: l.rel,
      method: l.method
    })),
    requirements: Array.from(requirementsMap.values()),
    rawPayload: detail as Record<string, unknown>
  };
}

