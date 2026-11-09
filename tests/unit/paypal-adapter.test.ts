import { describe, expect, it } from 'vitest';
import {
  buildPayPalAuthAssertionJwt,
  PayPalApiError,
  PayPalSandboxClient
} from '@proofline/integration-paypal';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

describe('PayPal Sandbox Client Adapter', () => {
  it('caches OAuth access token and automatically refreshes on HTTP 401', async () => {
    let oauthCalls = 0;
    let disputeCalls = 0;

    const client = new PayPalSandboxClient({
      environment: 'sandbox',
      clientId: 'sb-client-id',
      clientSecret: 'sb-client-secret',
      maxRetries: 0,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/v1/oauth2/token')) {
          oauthCalls++;
          return jsonResponse({ access_token: `tok-${oauthCalls}`, expires_in: 3600 });
        }
        if (url.includes('/v1/customer/disputes')) {
          disputeCalls++;
          const authHeader = (init?.headers as Record<string, string>)?.Authorization;
          if (disputeCalls === 1 && authHeader === 'Bearer tok-1') {
            return jsonResponse({ name: 'EXPIRED_TOKEN', message: 'Token expired' }, 401);
          }
          expect(authHeader).toBe('Bearer tok-2');
          return jsonResponse({ items: [] });
        }
        throw new Error(`Unexpected URL ${url}`);
      }
    });

    const list1 = await client.listDisputes();
    expect(list1.items).toEqual([]);
    expect(oauthCalls).toBe(2); // initial fetch + 401 forced refresh
    expect(disputeCalls).toBe(2);

    // Cached token reused without re-authenticating
    await client.listDisputes();
    expect(oauthCalls).toBe(2);
  });

  it('retries transient 429 rate-limits and translates timeout aborts into PAYPAL_TIMEOUT', async () => {
    let attempts = 0;
    const rateClient = new PayPalSandboxClient({
      environment: 'sandbox',
      clientId: 'sb-id',
      clientSecret: 'sb-secret',
      maxRetries: 1,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/v1/oauth2/token')) {
          return jsonResponse({ access_token: 'tok-rate', expires_in: 3600 });
        }
        attempts++;
        if (attempts === 1) {
          return jsonResponse(
            { name: 'RATE_LIMIT_REACHED' },
            429,
            { 'retry-after': '0' }
          );
        }
        return jsonResponse({ items: [] });
      }
    });

    const list = await rateClient.listDisputes();
    expect(list.items).toEqual([]);
    expect(attempts).toBe(2);

    const timeoutClient = new PayPalSandboxClient({
      environment: 'sandbox',
      clientId: 'sb-id',
      clientSecret: 'sb-secret',
      maxRetries: 0,
      fetchImpl: async () => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }
    });

    await expect(timeoutClient.getAccessToken()).rejects.toMatchObject({
      name: 'PayPalApiError',
      code: 'PAYPAL_TIMEOUT'
    });
  });

  it('builds valid multipart/form-data provide-evidence request, verifies HATEOAS links, and re-fetches dispute state', async () => {
    let capturedForm: FormData | null = null;
    let disputeGetCount = 0;

    const sampleDispute = (status: string) => ({
      dispute_id: 'PP-D-TEST-100',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      status,
      dispute_life_cycle_stage: 'INQUIRY',
      seller_response_due_date: '2030-01-15T00:00:00Z',
      dispute_amount: { currency_code: 'USD', value: '850.00' },
      links: [
        {
          href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-D-TEST-100/provide-evidence',
          rel: 'provide_evidence',
          method: 'POST'
        }
      ]
    });

    const client = new PayPalSandboxClient({
      environment: 'sandbox',
      clientId: 'sb-id',
      clientSecret: 'sb-secret',
      maxRetries: 0,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/v1/oauth2/token')) {
          return jsonResponse({ access_token: 'tok-submit', expires_in: 3600 });
        }
        if (url.endsWith('/v1/customer/disputes/PP-D-TEST-100') && init?.method === 'GET') {
          disputeGetCount++;
          return jsonResponse(
            sampleDispute(disputeGetCount === 1 ? 'WAITING_FOR_SELLER_RESPONSE' : 'UNDER_REVIEW')
          );
        }
        if (url.endsWith('/v1/customer/disputes/PP-D-TEST-100/provide-evidence')) {
          capturedForm = init?.body as FormData;
          return jsonResponse({ links: [] }, 200);
        }
        throw new Error(`Unexpected call ${init?.method} ${url}`);
      }
    });

    const pdfBytes = Buffer.from('%PDF-1.7\nMock dossier content');
    const res = await client.provideEvidence({
      disputeId: 'PP-D-TEST-100',
      evidenceType: 'PROOF_OF_FULFILLMENT',
      notes: 'Website SOW and delivery email dossier.',
      files: [
        {
          candidate: {
            assetId: 'asset-1',
            filename: 'dossier.pdf',
            extension: 'pdf',
            byteSize: pdfBytes.length,
            sha256Hash: 'abc123'
          },
          mimeType: 'application/pdf',
          content: pdfBytes
        }
      ]
    });

    expect(disputeGetCount).toBe(2);
    expect(res.verifiedDispute?.status).toBe('UNDER_REVIEW');
    expect(capturedForm).toBeInstanceOf(FormData);
    const inputPart = capturedForm!.get('input') as File;
    expect(JSON.parse(await inputPart.text())).toEqual({
      evidences: [
        {
          evidence_type: 'PROOF_OF_FULFILLMENT',
          notes: 'Website SOW and delivery email dossier.'
        }
      ]
    });
    const filePart = capturedForm!.get('evidence-file') as File;
    expect(filePart.name).toBe('dossier.pdf');
  });

  it('verifies webhook signatures via PayPal verify-webhook-signature and constructs PayPal-Auth-Assertion JWT', async () => {
    const jwt = buildPayPalAuthAssertionJwt('sb-client-123', 'buyer@sandbox.example');
    const [headerB64, payloadB64, sig] = jwt.split('.');
    expect(sig).toBe('');
    expect(JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8'))).toEqual({
      alg: 'none',
      typ: 'JWT'
    });
    expect(JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'))).toEqual({
      iss: 'sb-client-123',
      email: 'buyer@sandbox.example'
    });

    const client = new PayPalSandboxClient({
      environment: 'sandbox',
      clientId: 'sb-id',
      clientSecret: 'sb-secret',
      webhookId: 'WH-12345',
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/v1/oauth2/token')) {
          return jsonResponse({ access_token: 'tok-wh', expires_in: 3600 });
        }
        if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
          const parsed = JSON.parse(String(init?.body)) as { webhook_id: string };
          expect(parsed.webhook_id).toBe('WH-12345');
          return jsonResponse({ verification_status: 'SUCCESS' });
        }
        throw new PayPalApiError({
          code: 'UNEXPECTED',
          message: url,
          paypalStatus: 500
        });
      }
    });

    const verified = await client.verifyWebhookSignature({
      headers: {
        authAlgo: 'SHA256withRSA',
        certUrl: 'https://api.sandbox.paypal.com/cert.pem',
        transmissionId: 'tx-1',
        transmissionSig: 'sig-1',
        transmissionTime: '2026-10-20T00:00:00Z'
      },
      webhookEvent: { id: 'WH-EVT-1', event_type: 'CUSTOMER.DISPUTE.CREATED' }
    });

    expect(verified.verified).toBe(true);
    expect(verified.verificationStatus).toBe('SUCCESS');
  });
});

