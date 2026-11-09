# Security Policy

## Supported Versions

PROOFLINE is currently in active pre-1.0 development under `l3tchupkt/proofline`. Security fixes are applied to the `main` branch.

## Reporting a Vulnerability

Do **not** open a public GitHub issue for suspected security vulnerabilities, credential exposure, authorization bypasses, webhook signature flaws, or file-ingestion exploits.

Please report vulnerabilities privately using GitHub Security Advisories:

- https://github.com/l3tchupkt/proofline/security/advisories/new

Include:

1. Affected endpoint, package, or workflow.
2. Clear reproduction steps or proof-of-concept payload.
3. Expected vs. actual security boundary behavior.
4. Potential impact on workspace isolation, evidence integrity, or external PayPal execution.

## Security Architecture Commitments

PROOFLINE enforces the following invariants by design:

- **No browser credentials**: PayPal and Anthropic secrets stay exclusively on the backend.
- **Merchant-confirmed submission**: AI tools cannot invoke PayPal evidence submission, refunds, or claim acceptance.
- **Content-bound approval**: Modifying submission text or attached evidence invalidates prior approval.
- **Untrusted document isolation**: Uploaded files are SHA-256 hashed, validated by file signature, stored privately, and treated as untrusted data against prompt injection.
- **Verified webhooks**: Incoming PayPal webhooks require valid signature verification via PayPal's official `/v1/notifications/verify-webhook-signature` endpoint.
- **Workspace isolation**: Every query and asset download is scoped server-side to the authenticated session's workspace.

