---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
---

# Testing Standards

1. Automated tests must never connect to live PayPal accounts or use real customer PII.
2. Use realistic synthetic fixtures and mock/local HTTP transport adapters or in-process PostgreSQL (`@electric-sql/pglite`) for deterministic integration tests.
3. Every security invariant (cross-workspace denial, AI tool authorization denial, invalid webhook rejection, approval invalidation on edit, magic-byte spoofing rejection) must have dedicated automated assertions.
4. Keep unit tests fast and isolated; verify real SQL migrations, foreign keys, and transaction rollback in integration tests.
