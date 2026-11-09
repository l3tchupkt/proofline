# PROOFLINE Security Architecture & Trust Boundaries

## 1. Threat Model & Core Invariants

1. **Merchant Credentials Never Reach the Browser**: PayPal OAuth2 Client ID/Secret, Webhook ID, Anthropic API Key, and Session signing secrets live exclusively in Fastify server config (`@proofline/config`). Next.js frontend communicates strictly with PROOFLINE API endpoints.
2. **Untrusted Evidence Assumption**: Every dispute document (buyer messages, `.eml` threads, PDFs, JSON webhook logs, screenshots) is treated as adversarial untrusted input that may contain malicious binaries or indirect prompt-injection payloads.
3. **Zero Autonomous AI Financial Execution**: The Anthropic investigation agent (`AI_ASSISTANT` actor) runs strictly inside `@proofline/authorization` with read-only dispute/evidence tools plus draft preparation. It cannot invoke PayPal mutations (`provide-evidence`, `provide-supporting-info`, refunds, claim acceptance), approve submissions, or read another workspace.
4. **Explicit Merchant Approval Digest**: Before PayPal submission can execute, the merchant must explicitly confirm exact response notes and attached file SHA-256 checksums (`approvalDigest = SHA-256(...)`). Any edit to text, evidence type, tracking/refund fields, or attachments transitions the record back to `DRAFT` and clears `approvalDigest`, forcing re-approval.

## 2. Authentication, Sessions & CSRF

- Password hashing uses **Argon2id** (`argon2.argon2id`).
- Session tokens use `crypto.randomBytes(32)` stored only as **SHA-256** hashes in `sessions` (`sessionTokenHash`).
- Cookies are issued `HttpOnly; SameSite=Lax; Path=/` (and `Secure` in production / HTTPS).
- All state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`, excluding login and PayPal signed webhook receiver) verify an `x-csrf-token` header matching the database session's CSRF token using constant-time comparison (`crypto.timingSafeEqual`).

## 3. Workspace Multi-Tenancy Isolation

- Every business table (`disputes`, `evidence_assets`, `extracted_facts`, `timeline_events`, `evidence_requirements`, `evidence_claims`, `evidence_submissions`, `ai_runs`, `audit_events`) contains `workspace_id` foreign-keyed to `workspaces.id`.
- Repositories take `workspaceId` from the verified server session (`request.actorContext!.workspaceId`) — never trusting client-supplied workspace IDs.
- `@proofline/authorization` enforces resource workspace checks across every service method and records `DENIED` attempts into `audit_events`.

## 4. Webhook Integrity & Replay Protection

- `POST /api/webhooks/paypal` reads the unparsed raw JSON body string alongside all five required `paypal-*` signature headers (`paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`).
- PayPal's `/v1/notifications/verify-webhook-signature` endpoint is called synchronously before enqueuing background dispute refreshes.
- Duplicate `paypal_event_id` values are deduplicated idempotently in PostgreSQL via unique index (`webhook_events_paypal_event_id_uq`).

## 5. Demo vs. PayPal Sandbox Isolation

- Every dispute, evidence asset, AI run, and submission carries an explicit `record_origin` (`'PAYPAL_SANDBOX' | 'DEMO_FIXTURE'`).
- `SubmissionService` blocks mixing origins (`RECORD_ORIGIN_MISMATCH`) and refuses PayPal transmission on `DEMO_FIXTURE` disputes (`DEMO_SUBMISSION_BLOCKED`).

