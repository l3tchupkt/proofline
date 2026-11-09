---
paths:
  - "apps/api/**"
  - "packages/authorization/**"
  - "packages/integrations/paypal/**"
---

# API Security Rules

1. Every protected API route must verify the authenticated session cookie and scope queries by `session.workspaceId`.
2. State-changing routes (excluding `/api/auth/login` and `/api/webhooks/paypal`) must validate the CSRF header against the session CSRF token.
3. Webhook route `/api/webhooks/paypal` must preserve raw body bytes and verify the signature via PayPal's `/v1/notifications/verify-webhook-signature` before trusting payload contents.
4. Never log `PAYPAL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, OAuth bearer tokens, session tokens, or cookie headers.
5. Rate-limit login, evidence uploads, AI investigation runs, and external submission endpoints.
6. Evidence downloads must stream from private storage after server-side workspace ownership verification; never expose public bucket or static upload URLs.

