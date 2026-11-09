---
name: security-review
description: Security verification checklist covering authentication, workspace isolation, webhook authenticity, prompt injection, and submission approval binding.
---

# Security Review Skill

## Audit Procedure
1. Verify Argon2id password hashing and HttpOnly + SameSite cookie flags on session endpoints.
2. Inspect every repository query for mandatory `workspaceId` scoping; verify cross-workspace tests assert HTTP 403/404 denial.
3. Verify `/api/webhooks/paypal` uses raw body verification through PayPal's signature API and rejects unverified payloads.
4. Confirm `AIActor` is structurally blocked from calling `approveSubmission`, `submitToPayPal`, or mutating external dispute state.
5. Confirm `approvalDigest` SHA-256 covers response notes, evidence type, tracking/refund metadata, and ordered document SHA-256 hashes; verify any mutation transitions status out of `APPROVED`.
6. Check logger redaction lists and scan git index for secrets or `.env` files.
