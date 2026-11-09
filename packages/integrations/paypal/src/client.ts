import { randomUUID } from 'node:crypto';
import { ConfigurationError } from '@proofline/config';
import {
  assertDisputeAcceptsAction,
  validatePayPalAttachments,
  type SubmissionAttachmentCandidate
} from '@proofline/domain';
import { PayPalApiError } from './errors.js';
import {
  mapPayPalDisputeToDomain,
  PayPalDisputeDetailSchema,
  PayPalDisputeListResponseSchema,
  PayPalWebhookVerifyResponseSchema,
  type PayPalDisputeDetail,
  type PayPalDisputeListResponse
} from './types.js';

export const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

export interface PayPalLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface PayPalClientOptions {
  environment: 'sandbox';
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  logger?: PayPalLogger;
  now?: () => number;
}

export interface PayPalEvidenceFilePart {
  candidate: SubmissionAttachmentCandidate;
  mimeType: string;
  content: Uint8Array;
}

export interface ProvideEvidenceRequest {
  disputeId: string;
  evidenceType: string;
  notes?: string;
  trackingInfo?: Array<{
    carrierName: string;
    trackingNumber: string;
  }>;
  refundIds?: string[];
  files?: PayPalEvidenceFilePart[];
}

export interface VerifyWebhookParams {
  headers: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
  };
  webhookId?: string;
  webhookEvent: Record<string, unknown>;
}

const noopLogger: PayPalLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64UrlEncode(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/**
 * Generates an unsigned PayPal-Auth-Assertion JWT (`alg: "none"`) as specified by PayPal
 * for Sandbox buyer-side testing workflows. Never used for merchant production routes.
 */
export function buildPayPalAuthAssertionJwt(clientId: string, payerIdOrEmail: string): string {
  const header = base64UrlEncode({ alg: 'none', typ: 'JWT' });
  const isEmail = payerIdOrEmail.includes('@');
  const payload = base64UrlEncode(
    isEmail
      ? { iss: clientId, email: payerIdOrEmail }
      : { iss: clientId, payer_id: payerIdOrEmail }
  );
  return `${header}.${payload}.`;
}

export class PayPalSandboxClient {
  private readonly baseUrl = PAYPAL_SANDBOX_BASE_URL;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: PayPalLogger;
  private readonly now: () => number;

  private cachedToken: { accessToken: string; expiresAtMs: number } | null = null;
  private inflightTokenPromise: Promise<string> | null = null;

  constructor(options: PayPalClientOptions) {
    if (options.environment !== 'sandbox') {
      throw new ConfigurationError(
        'PAYPAL_SANDBOX_ONLY',
        'PayPalSandboxClient strictly rejects non-sandbox environments.'
      );
    }
    if (!options.clientId.trim() || !options.clientSecret.trim()) {
      throw new ConfigurationError(
        'PAYPAL_NOT_CONFIGURED',
        'PayPalSandboxClient requires clientId and clientSecret.'
      );
    }

    this.clientId = options.clientId.trim();
    this.clientSecret = options.clientSecret.trim();
    this.webhookId = (options.webhookId ?? '').trim();
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? noopLogger;
    this.now = options.now ?? (() => Date.now());
  }

  public clearTokenCache(): void {
    this.cachedToken = null;
  }

  public async getAccessToken(forceRefresh = false): Promise<string> {
    const currentMs = this.now();
    if (!forceRefresh && this.cachedToken && currentMs < this.cachedToken.expiresAtMs - 60_000) {
      return this.cachedToken.accessToken;
    }

    if (this.inflightTokenPromise) {
      return this.inflightTokenPromise;
    }

    this.inflightTokenPromise = this.fetchAccessToken().finally(() => {
      this.inflightTokenPromise = null;
    });

    return this.inflightTokenPromise;
  }

  private async fetchAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`, 'utf8').toString(
      'base64'
    );
    const correlationId = randomUUID();

    const response = await this.executeWithRetries(async () => {
      return this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'PayPal-Request-Id': correlationId
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    }, 'oauth_token');

    if (!response.ok) {
      throw await this.buildApiError(response, 'PAYPAL_AUTH_FAILED', 'PayPal OAuth authentication failed.');
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      throw new PayPalApiError({
        code: 'PAYPAL_AUTH_INVALID_RESPONSE',
        message: 'PayPal OAuth response omitted access_token.',
        paypalStatus: response.status
      });
    }

    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAtMs: this.now() + expiresInSec * 1000
    };

    this.logger.info('Refreshed PayPal Sandbox OAuth access token', {
      correlationId,
      expiresInSec
    });
    return data.access_token;
  }

  public async listDisputes(params: {
    disputeState?: string;
    startTime?: string;
    pageSize?: number;
    nextPageToken?: string;
  } = {}): Promise<PayPalDisputeListResponse> {
    const search = new URLSearchParams();
    if (params.disputeState) search.set('dispute_state', params.disputeState);
    if (params.startTime) search.set('start_time', params.startTime);
    if (params.pageSize) search.set('page_size', String(params.pageSize));
    if (params.nextPageToken) search.set('next_page_token', params.nextPageToken);

    const qs = search.toString();
    const path = `/v1/customer/disputes${qs ? `?${qs}` : ''}`;

    const json = await this.requestJson('GET', path, undefined, 'list_disputes');
    return PayPalDisputeListResponseSchema.parse(json);
  }

  public async getDispute(disputeId: string): Promise<PayPalDisputeDetail> {
    const encodedId = encodeURIComponent(disputeId);
    const json = await this.requestJson(
      'GET',
      `/v1/customer/disputes/${encodedId}`,
      undefined,
      'get_dispute'
    );
    return PayPalDisputeDetailSchema.parse(json);
  }

  /**
   * Always fetches fresh dispute state to verify HATEOAS links before submitting evidence.
   */
  public async provideEvidence(request: ProvideEvidenceRequest): Promise<{
    correlationId: string;
    response: Record<string, unknown>;
    verifiedDispute: PayPalDisputeDetail | null;
    verificationError?: string;
  }> {
    const files = request.files ?? [];
    const validation = validatePayPalAttachments(files.map((f) => f.candidate));
    if (!validation.valid) {
      throw new PayPalApiError({
        code: 'PAYPAL_INVALID_EVIDENCE_ATTACHMENTS',
        message: validation.errors.join(' '),
        paypalStatus: 400,
        details: { errors: validation.errors }
      });
    }

    // Retrieve current dispute before evaluating HATEOAS links.
    const freshDispute = await this.getDispute(request.disputeId);
    const mappedFresh = mapPayPalDisputeToDomain(freshDispute);
    assertDisputeAcceptsAction(
      {
        id: mappedFresh.paypalDisputeId,
        recordOrigin: 'PAYPAL_SANDBOX',
        workflowStatus: mappedFresh.workflowStatus,
        rawStatus: mappedFresh.rawStatus,
        lifecycleStage: mappedFresh.lifecycleStage,
        rawLifecycleStage: mappedFresh.rawLifecycleStage,
        sellerResponseDueAt: mappedFresh.sellerResponseDueAt,
        links: mappedFresh.links
      },
      'PROVIDE_EVIDENCE'
    );

    const evidenceEntry: Record<string, unknown> = {
      evidence_type: request.evidenceType
    };
    if (request.notes) {
      evidenceEntry.notes = request.notes;
    }
    if (request.trackingInfo && request.trackingInfo.length > 0) {
      evidenceEntry.evidence_info = {
        tracking_info: request.trackingInfo.map((t) => ({
          carrier_name: t.carrierName,
          tracking_number: t.trackingNumber
        }))
      };
    } else if (request.refundIds && request.refundIds.length > 0) {
      evidenceEntry.evidence_info = {
        refund_ids: request.refundIds
      };
    }

    const inputPayload = {
      evidences: [evidenceEntry]
    };

    const formData = new FormData();
    formData.append(
      'input',
      new Blob([JSON.stringify(inputPayload)], { type: 'application/json' })
    );

    for (const file of files) {
      const arrayBuffer = file.content.buffer.slice(
        file.content.byteOffset,
        file.content.byteOffset + file.content.byteLength
      ) as ArrayBuffer;
      formData.append(
        'evidence-file',
        new Blob([arrayBuffer], { type: file.mimeType }),
        file.candidate.filename
      );
    }

    const correlationId = randomUUID();
    const encodedId = encodeURIComponent(request.disputeId);
    const responseJson = await this.requestMultipart(
      `/v1/customer/disputes/${encodedId}/provide-evidence`,
      formData,
      correlationId
    );

    // Retrieve updated dispute to verify PayPal's persisted response without discarding correlationId on transient GET errors.
    let verifiedDispute: PayPalDisputeDetail | null = null;
    let verificationError: string | undefined;
    try {
      verifiedDispute = await this.getDispute(request.disputeId);
    } catch (verifyErr) {
      verificationError =
        verifyErr instanceof Error ? verifyErr.message : 'Post-submission PayPal dispute verification failed.';
    }

    return {
      correlationId,
      response: responseJson,
      verifiedDispute,
      ...(verificationError ? { verificationError } : {})
    };
  }

  public async provideSupportingInfo(params: {
    disputeId: string;
    notes: string;
    files?: PayPalEvidenceFilePart[];
  }): Promise<{ correlationId: string; response: Record<string, unknown> }> {
    const files = params.files ?? [];
    const validation = validatePayPalAttachments(files.map((f) => f.candidate));
    if (!validation.valid) {
      throw new PayPalApiError({
        code: 'PAYPAL_INVALID_EVIDENCE_ATTACHMENTS',
        message: validation.errors.join(' '),
        paypalStatus: 400
      });
    }

    const freshDispute = await this.getDispute(params.disputeId);
    const mappedFresh = mapPayPalDisputeToDomain(freshDispute);
    assertDisputeAcceptsAction(
      {
        id: mappedFresh.paypalDisputeId,
        recordOrigin: 'PAYPAL_SANDBOX',
        workflowStatus: mappedFresh.workflowStatus,
        rawStatus: mappedFresh.rawStatus,
        lifecycleStage: mappedFresh.lifecycleStage,
        rawLifecycleStage: mappedFresh.rawLifecycleStage,
        sellerResponseDueAt: mappedFresh.sellerResponseDueAt,
        links: mappedFresh.links
      },
      'PROVIDE_SUPPORTING_INFO'
    );

    const formData = new FormData();
    formData.append(
      'input',
      new Blob([JSON.stringify({ notes: params.notes })], { type: 'application/json' })
    );
    for (const file of files) {
      const arrayBuffer = file.content.buffer.slice(
        file.content.byteOffset,
        file.content.byteOffset + file.content.byteLength
      ) as ArrayBuffer;
      formData.append(
        'supporting-info-file',
        new Blob([arrayBuffer], { type: file.mimeType }),
        file.candidate.filename
      );
    }

    const correlationId = randomUUID();
    const encodedId = encodeURIComponent(params.disputeId);
    const response = await this.requestMultipart(
      `/v1/customer/disputes/${encodedId}/provide-supporting-info`,
      formData,
      correlationId
    );
    return { correlationId, response };
  }

  public async sendMessage(params: {
    disputeId: string;
    message: string;
  }): Promise<{ correlationId: string; response: Record<string, unknown> }> {
    const freshDispute = await this.getDispute(params.disputeId);
    const mappedFresh = mapPayPalDisputeToDomain(freshDispute);
    assertDisputeAcceptsAction(
      {
        id: mappedFresh.paypalDisputeId,
        recordOrigin: 'PAYPAL_SANDBOX',
        workflowStatus: mappedFresh.workflowStatus,
        rawStatus: mappedFresh.rawStatus,
        lifecycleStage: mappedFresh.lifecycleStage,
        rawLifecycleStage: mappedFresh.rawLifecycleStage,
        sellerResponseDueAt: mappedFresh.sellerResponseDueAt,
        links: mappedFresh.links
      },
      'SEND_MESSAGE'
    );

    const correlationId = randomUUID();
    const encodedId = encodeURIComponent(params.disputeId);
    const response = await this.requestJson(
      'POST',
      `/v1/customer/disputes/${encodedId}/send-message`,
      { message: params.message },
      'send_message',
      correlationId
    );
    return { correlationId, response };
  }

  public async verifyWebhookSignature(params: VerifyWebhookParams): Promise<{
    verified: boolean;
    verificationStatus: 'SUCCESS' | 'FAILURE';
  }> {
    const webhookId = (params.webhookId ?? this.webhookId).trim();
    if (!webhookId) {
      throw new ConfigurationError(
        'PAYPAL_WEBHOOK_ID_NOT_CONFIGURED',
        'PAYPAL_WEBHOOK_ID is required to verify PayPal webhook signatures.'
      );
    }

    const body = {
      auth_algo: params.headers.authAlgo,
      cert_url: params.headers.certUrl,
      transmission_id: params.headers.transmissionId,
      transmission_sig: params.headers.transmissionSig,
      transmission_time: params.headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: params.webhookEvent
    };

    const json = await this.requestJson(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      body,
      'verify_webhook_signature'
    );

    const parsed = PayPalWebhookVerifyResponseSchema.parse(json);
    return {
      verified: parsed.verification_status === 'SUCCESS',
      verificationStatus: parsed.verification_status
    };
  }

  /**
   * Sandbox-only buyer dispute creation endpoint (`POST /v1/customer/disputes`).
   * Strictly for local/sandbox verification scripts; never exposed as a merchant production endpoint.
   */
  public async createSandboxBuyerDispute(params: {
    buyerPayerIdOrEmail: string;
    buyerTransactionId: string;
    currencyCode: string;
    amountValue: string;
    reason: string;
    note?: string;
  }): Promise<Record<string, unknown>> {
    const authAssertion = buildPayPalAuthAssertionJwt(this.clientId, params.buyerPayerIdOrEmail);
    const correlationId = randomUUID();
    const token = await this.getAccessToken();

    const response = await this.executeWithRetries(async () => {
      return this.fetchImpl(`${this.baseUrl}/v1/customer/disputes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'PayPal-Auth-Assertion': authAssertion,
          'PayPal-Request-Id': correlationId
        },
        body: JSON.stringify({
          disputed_transactions: [
            {
              buyer_transaction_id: params.buyerTransactionId,
              amount: {
                currency_code: params.currencyCode,
                value: params.amountValue
              }
            }
          ],
          reason: params.reason,
          ...(params.note ? { messages: [{ content: params.note }] } : {})
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    }, 'create_sandbox_buyer_dispute');

    if (!response.ok) {
      throw await this.buildApiError(
        response,
        'PAYPAL_SANDBOX_CREATE_DISPUTE_FAILED',
        'Failed to create sandbox dispute.'
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    operation = 'api_call',
    correlationId = randomUUID()
  ): Promise<Record<string, unknown>> {
    let token = await this.getAccessToken();

    const doFetch = async (bearerToken: string) => {
      return this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
          'PayPal-Request-Id': correlationId,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    };

    let response = await this.executeWithRetries(() => doFetch(token), operation);

    if (response.status === 401) {
      this.clearTokenCache();
      token = await this.getAccessToken(true);
      response = await this.executeWithRetries(() => doFetch(token), operation);
    }

    if (!response.ok) {
      throw await this.buildApiError(response, 'PAYPAL_API_ERROR', `PayPal ${operation} failed.`);
    }

    const text = await response.text();
    return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  private async requestMultipart(
    path: string,
    formData: FormData,
    correlationId: string
  ): Promise<Record<string, unknown>> {
    let token = await this.getAccessToken();

    const doFetch = async (bearerToken: string) => {
      return this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
          'PayPal-Request-Id': correlationId
        },
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    };

    let response = await this.executeWithRetries(() => doFetch(token), 'provide_evidence');

    if (response.status === 401) {
      this.clearTokenCache();
      token = await this.getAccessToken(true);
      response = await this.executeWithRetries(() => doFetch(token), 'provide_evidence');
    }

    if (!response.ok) {
      throw await this.buildApiError(
        response,
        'PAYPAL_PROVIDE_EVIDENCE_FAILED',
        'PayPal evidence submission failed.'
      );
    }

    const text = await response.text();
    return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  private async executeWithRetries(
    fn: () => Promise<Response>,
    operation: string
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fn();
        if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
          if (attempt < this.maxRetries) {
            const retryAfterSec = Number(response.headers.get('retry-after') ?? '0');
            const delayMs =
              retryAfterSec > 0
                ? Math.min(retryAfterSec * 1000, 5000)
                : Math.min(200 * 2 ** attempt, 2000);
            this.logger.warn('Retryable PayPal response received', {
              operation,
              status: response.status,
              attempt: attempt + 1,
              delayMs
            });
            await sleep(delayMs);
            continue;
          }
          if (response.status === 429) {
            throw await this.buildApiError(
              response,
              'PAYPAL_RATE_LIMITED',
              'PayPal API rate limit exceeded.',
              true
            );
          }
        }
        return response;
      } catch (err) {
        if (err instanceof PayPalApiError) {
          throw err;
        }
        lastError = err;
        const isTimeout =
          err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        if (attempt < this.maxRetries) {
          const delayMs = Math.min(200 * 2 ** attempt, 2000);
          this.logger.warn('Retrying PayPal request after transport error', {
            operation,
            attempt: attempt + 1,
            isTimeout
          });
          await sleep(delayMs);
          continue;
        }
        throw new PayPalApiError({
          code: isTimeout ? 'PAYPAL_TIMEOUT' : 'PAYPAL_NETWORK_ERROR',
          message: isTimeout
            ? `PayPal ${operation} timed out after ${this.timeoutMs}ms.`
            : `PayPal ${operation} failed due to a network error.`,
          paypalStatus: 0,
          retryable: true,
          details: { cause: err instanceof Error ? err.message : 'unknown' }
        });
      }
    }

    throw new PayPalApiError({
      code: 'PAYPAL_EXHAUSTED_RETRIES',
      message: `PayPal ${operation} failed after retries.`,
      paypalStatus: 0,
      retryable: true,
      details: { cause: lastError instanceof Error ? lastError.message : 'unknown' }
    });
  }

  private async buildApiError(
    response: Response,
    fallbackCode: string,
    fallbackMessage: string,
    retryableOverride?: boolean
  ): Promise<PayPalApiError> {
    const debugId = response.headers.get('paypal-debug-id');
    let issueName: string | null = null;
    let message = fallbackMessage;
    let details: Record<string, unknown> | undefined;

    try {
      const text = await response.text();
      if (text.trim()) {
        const parsed = JSON.parse(text) as {
          name?: string;
          message?: string;
          details?: Array<{ issue?: string; description?: string }>;
        };
        issueName = parsed.details?.[0]?.issue ?? parsed.name ?? null;
        if (parsed.message) {
          message = `${fallbackMessage} (${parsed.message})`;
        }
        details = { paypalBody: parsed };
      }
    } catch {
      // Keep fallback message when response body is non-JSON.
    }

    return new PayPalApiError({
      code: response.status === 429 ? 'PAYPAL_RATE_LIMITED' : fallbackCode,
      message,
      paypalStatus: response.status,
      debugId,
      issueName,
      retryable: retryableOverride ?? (response.status === 429 || response.status >= 500),
      details
    });
  }
}

