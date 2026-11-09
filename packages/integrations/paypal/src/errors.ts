import { DomainError } from '@proofline/domain';

export class PayPalApiError extends DomainError {
  public readonly paypalStatus: number;
  public readonly debugId: string | null;
  public readonly issueName: string | null;
  public readonly retryable: boolean;

  constructor(params: {
    code: string;
    message: string;
    paypalStatus: number;
    debugId?: string | null;
    issueName?: string | null;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    const httpStatus =
      params.paypalStatus >= 500 || params.paypalStatus === 429 || params.paypalStatus === 0
        ? 502
        : params.paypalStatus >= 400
          ? params.paypalStatus
          : 502;

    super(params.code, params.message, httpStatus, {
      paypalStatus: params.paypalStatus,
      debugId: params.debugId ?? null,
      issueName: params.issueName ?? null,
      retryable: Boolean(params.retryable),
      ...params.details
    });
    this.name = 'PayPalApiError';
    this.paypalStatus = params.paypalStatus;
    this.debugId = params.debugId ?? null;
    this.issueName = params.issueName ?? null;
    this.retryable = Boolean(params.retryable);
  }
}

