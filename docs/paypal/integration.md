# PayPal Sandbox Disputes Integration

PROOFLINE integrates with the official PayPal Disputes API (`v1`) and Notification Verification API strictly in **Sandbox mode** (`https://api-m.sandbox.paypal.com`).

## Official Reference Links

- Handle disputes with the Disputes API: https://developer.paypal.com/platforms/disputes/handle-disputes/use-disputes-api/
- Reasons and evidence mapping: https://developer.paypal.com/disputes/reasons-evidence/
- Test and go live: https://developer.paypal.com/platforms/disputes/test-go-live/
- Supported file types and sizes: https://developer.paypal.com/platforms/disputes/reference/supported-file-types-sizes/

## Implemented Endpoints

1. **OAuth 2.0**: `POST /v1/oauth2/token` with token caching and single-retry refresh on `401`.
2. **List Disputes**: `GET /v1/customer/disputes`.
3. **Show Dispute Details**: `GET /v1/customer/disputes/{id}`.
4. **Provide Evidence**: `POST /v1/customer/disputes/{id}/provide-evidence` using `multipart/form-data` (`input` JSON part + `evidence-file` binary parts).
5. **Provide Supporting Info**: `POST /v1/customer/disputes/{id}/provide-supporting-info`.
6. **Send Message**: `POST /v1/customer/disputes/{id}/send-message`.
7. **Verify Webhook Signature**: `POST /v1/notifications/verify-webhook-signature`.
8. **Sandbox-only Buyer Dispute Creation**: `POST /v1/customer/disputes` with `PayPal-Auth-Assertion` (`alg: "none"` JWT), isolated to developer CLI tooling (`scripts/create-sandbox-dispute.ts`).

## Safety Invariants

- HATEOAS links returned by `GET /v1/customer/disputes/{id}` are checked before allowing evidence submission.
- Attachments are verified against `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, strictly `< 10 MB` individually, and `<= 50 MB` total.
- Unknown `status`, `dispute_life_cycle_stage`, or `evidence_type` values are preserved verbatim rather than coerced.
- After `provide-evidence` succeeds, PROOFLINE re-fetches `GET /v1/customer/disputes/{id}` to verify persisted state and explicitly distinguishes **API acceptance** from **dispute resolution**.

## Documented Sandbox End-to-End Test Procedure

1. Configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `PAYPAL_SANDBOX_BUYER_PAYER_ID` in `.env`.
2. From a PayPal Sandbox buyer account, send a payment to your Sandbox business account and capture the buyer transaction ID.
3. Run `pnpm sandbox:create-dispute --transaction=<BUYER_TXN_ID> --amount=85.00 --currency=USD` to open a sandbox dispute as the buyer.
4. Run `pnpm sandbox:sync` (or click **Sync Sandbox Disputes** in PROOFLINE) to retrieve the dispute and its requested `evidence_type`.
5. Upload supporting PDF/image evidence in PROOFLINE, prepare a response draft, review provenance links, and explicitly approve the exact submission digest.
6. Submit evidence and verify the updated dispute status retrieved from PayPal.

