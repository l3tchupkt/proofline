import { describe, expect, it } from 'vitest';
import {
  assertDisputeAcceptsAction,
  assertSubmissionReadyForExecution,
  assertSubmissionTransition,
  computeApprovalDigest,
  DomainError,
  evaluateHateoasActionAvailability,
  Money,
  normalizePayPalLifecycleStage,
  normalizePayPalStatus,
  PAYPAL_MAX_SINGLE_FILE_BYTES,
  validatePayPalAttachments,
  type EvidenceSubmission
} from '@proofline/domain';

describe('Domain: Money precision, PayPal normalization, attachments & approval state machine', () => {
  it('parses and formats exact minor units without floating-point drift', () => {
    const m1 = Money.fromDecimalString('850.00', 'usd');
    expect(m1.amountMinor).toBe(85000);
    expect(m1.currencyCode).toBe('USD');
    expect(m1.toDecimalString()).toBe('850.00');
    expect(m1.format()).toBe('USD 850.00');

    const jpy = Money.fromDecimalString('12500', 'JPY');
    expect(jpy.amountMinor).toBe(12500);
    expect(jpy.toDecimalString()).toBe('12500');

    const kwd = Money.fromDecimalString('42.125', 'KWD');
    expect(kwd.amountMinor).toBe(42125);
    expect(kwd.toDecimalString()).toBe('42.125');

    expect(() => Money.fromDecimalString('10.999', 'USD')).toThrow(DomainError);
  });

  it('maps known PayPal statuses and preserves UNKNOWN safely', () => {
    expect(normalizePayPalStatus('WAITING_FOR_SELLER_RESPONSE')).toBe(
      'WAITING_FOR_SELLER_RESPONSE'
    );
    expect(normalizePayPalStatus('SOME_FUTURE_PAYPAL_STATE')).toBe('UNKNOWN');
    expect(normalizePayPalLifecycleStage('CHARGEBACK')).toBe('CHARGEBACK');
    expect(normalizePayPalLifecycleStage('UNLISTED_STAGE')).toBe('UNKNOWN');
  });

  it('enforces PayPal attachment extensions and < 10 MB / <= 50 MB limits', () => {
    const ok = validatePayPalAttachments([
      {
        assetId: 'a1',
        filename: 'contract.pdf',
        extension: 'pdf',
        byteSize: 2048,
        sha256Hash: 'abc'
      }
    ]);
    expect(ok.valid).toBe(true);

    const unsupported = validatePayPalAttachments([
      {
        assetId: 'a2',
        filename: 'thread.eml',
        extension: 'eml',
        byteSize: 1024,
        sha256Hash: 'def'
      }
    ]);
    expect(unsupported.valid).toBe(false);
    expect(unsupported.errors[0]).toContain('unsupported PayPal evidence type');

    const tooLargeSingle = validatePayPalAttachments([
      {
        assetId: 'a3',
        filename: 'huge.pdf',
        extension: 'pdf',
        byteSize: PAYPAL_MAX_SINGLE_FILE_BYTES, // strictly < 10 MB required
        sha256Hash: 'ghi'
      }
    ]);
    expect(tooLargeSingle.valid).toBe(false);
    expect(tooLargeSingle.errors[0]).toContain('strictly under 10 MB');

    const tooLargeCombined = validatePayPalAttachments(
      Array.from({ length: 6 }, (_, idx) => ({
        assetId: `f-${idx}`,
        filename: `part-${idx}.pdf`,
        extension: 'pdf',
        byteSize: 9 * 1024 * 1024,
        sha256Hash: `h-${idx}`
      }))
    );
    expect(tooLargeCombined.valid).toBe(false);
    expect(tooLargeCombined.errors[0]).toContain('exceed PayPal 50 MB total');
  });

  it('rejects expired seller response deadlines, invalid statuses, and missing HATEOAS links', () => {
    const baseDispute = {
      id: 'd1',
      recordOrigin: 'PAYPAL_SANDBOX' as const,
      workflowStatus: 'WAITING_FOR_SELLER_RESPONSE' as const,
      rawStatus: 'WAITING_FOR_SELLER_RESPONSE',
      lifecycleStage: 'CHARGEBACK' as const,
      rawLifecycleStage: 'CHARGEBACK',
      sellerResponseDueAt: new Date('2026-10-01T00:00:00Z'),
      links: [{ href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/D1/provide-evidence', rel: 'provide_evidence', method: 'POST' }]
    };

    // Expired deadline
    expect(() =>
      assertDisputeAcceptsAction(baseDispute, 'PROVIDE_EVIDENCE', new Date('2026-10-05T00:00:00Z'))
    ).toThrow(/deadline/i);

    // Invalid lifecycle / status
    expect(() =>
      assertDisputeAcceptsAction(
        {
          ...baseDispute,
          workflowStatus: 'WAITING_FOR_BUYER_RESPONSE',
          rawStatus: 'WAITING_FOR_BUYER_RESPONSE'
        },
        'PROVIDE_EVIDENCE',
        new Date('2026-09-25T00:00:00Z')
      )
    ).toThrow(/does not allow seller evidence submission/i);

    // Missing HATEOAS action link
    expect(evaluateHateoasActionAvailability([], 'PROVIDE_EVIDENCE').available).toBe(false);
    expect(() =>
      assertDisputeAcceptsAction(
        {
          ...baseDispute,
          links: [{ href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/D1', rel: 'self' }]
        },
        'PROVIDE_EVIDENCE',
        new Date('2026-09-25T00:00:00Z')
      )
    ).toThrow(/HATEOAS/i);
  });

  it('invalidates approval digest if notes or document hashes change and enforces valid transitions', () => {
    const initialInput = {
      disputeId: 'dispute-1',
      actionType: 'PROVIDE_EVIDENCE' as const,
      evidenceType: 'PROOF_OF_FULFILLMENT',
      responseNotes: 'Website milestone delivered electronically on 2026-10-14.',
      trackingNumber: null,
      carrierName: null,
      refundId: null,
      documentHashes: ['hash_a', 'hash_b']
    };
    const digest = computeApprovalDigest(initialInput);

    const submission: EvidenceSubmission = {
      id: 'sub-1',
      workspaceId: 'ws-1',
      disputeId: 'dispute-1',
      recordOrigin: 'PAYPAL_SANDBOX',
      status: 'APPROVED',
      actionType: 'PROVIDE_EVIDENCE',
      evidenceType: 'PROOF_OF_FULFILLMENT',
      responseNotes: initialInput.responseNotes,
      trackingNumber: null,
      carrierName: null,
      refundId: null,
      approvalDigest: digest,
      approvedByUserId: 'user-1',
      approvedAt: new Date(),
      idempotencyKey: 'idem-1',
      paypalCorrelationId: null,
      paypalResponsePayload: null,
      postSubmitVerificationPayload: null,
      errorCode: null,
      errorMessage: null,
      submittedAt: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(() => assertSubmissionReadyForExecution(submission, digest)).not.toThrow();

    // Mutate notes -> digest mismatch must throw
    const modifiedDigest = computeApprovalDigest({
      ...initialInput,
      responseNotes: 'Slightly altered text after approval'
    });
    expect(() => assertSubmissionReadyForExecution(submission, modifiedDigest)).toThrow(
      /Re-approval is required/i
    );

    // State machine enforcement
    expect(() => assertSubmissionTransition('DRAFT', 'SUBMITTED')).toThrow(DomainError);
    expect(() => assertSubmissionTransition('APPROVED', 'DRAFT')).not.toThrow();
    expect(() => assertSubmissionTransition('DRAFT', 'DRAFT')).not.toThrow();
    expect(() => assertSubmissionTransition('DRAFT', 'APPROVED')).not.toThrow();
    expect(() => assertSubmissionTransition('APPROVED', 'APPROVED')).not.toThrow();
  });
});

