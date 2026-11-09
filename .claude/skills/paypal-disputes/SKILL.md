---
name: paypal-disputes
description: Repeatable procedure for integrating, debugging, and testing PayPal Sandbox Disputes API workflows safely.
---

# PayPal Disputes Integration Skill

## Endpoints (Sandbox Only)
- Base URL: `https://api-m.sandbox.paypal.com`
- OAuth token: `POST /v1/oauth2/token` (cached until `expires_in - 60s`)
- List disputes: `GET /v1/customer/disputes`
- Show dispute details: `GET /v1/customer/disputes/{id}`
- Provide evidence: `POST /v1/customer/disputes/{id}/provide-evidence` (`multipart/form-data`)
- Provide supporting info: `POST /v1/customer/disputes/{id}/provide-supporting-info`
- Send message: `POST /v1/customer/disputes/{id}/send-message`
- Verify webhook: `POST /v1/notifications/verify-webhook-signature`

## Mandatory Procedure
1. Reject any attempt to run against `live` in this hackathon release.
2. Fetch fresh dispute details (`GET /v1/customer/disputes/{id}`) before building a submission.
3. Inspect HATEOAS `links` (`rel`) to confirm which action PayPal currently allows for `dispute_life_cycle_stage` and `status`.
4. Match `evidence_type` strictly against PayPal's requested evidence types (`PROOF_OF_FULFILLMENT`, `PROOF_OF_REFUND`, `PROOF_OF_DELIVERY_SIGNATURE`, `PROOF_OF_RECEIPT_OF_MERCHANDISE`, etc., preserving unknown strings verbatim).
5. Validate every attachment: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`; `< 10 MB` each; `<= 50 MB` total.
6. After submission, re-fetch `GET /v1/customer/disputes/{id}` and record PayPal's actual returned state without claiming the dispute is won.

