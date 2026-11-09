---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Standards

1. Strict mode (`strict: true`, `noUncheckedIndexedAccess: true`) is mandatory across all tsconfig files.
2. Never use `any` to silence compiler diagnostics; prefer `unknown` with Zod validation or explicit discriminated unions.
3. Use `NodeNext` explicit `.js` relative import specifiers inside backend and workspace packages (`packages/*`, `apps/api`).
4. Represent money using integer minor units (`amountMinor: number` + `currencyCode: string`) or validated decimal strings from PayPal, never IEEE-754 floating-point arithmetic.
5. External PayPal identifiers (`dispute_id`, `transaction_id`, `webhook_event_id`) must remain distinct typed fields from internal UUID primary keys.

