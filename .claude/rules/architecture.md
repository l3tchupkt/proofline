---
paths:
  - "packages/**"
  - "apps/**"
---

# Architecture Boundaries

1. Dependency flow is strictly inward: `apps/*` -> `@proofline/application` -> `@proofline/domain` + `@proofline/authorization` + `@proofline/contracts`.
2. `@proofline/domain` MUST NOT import Drizzle, Fastify, React, Next.js, `@anthropic-ai/sdk`, or `node:fs`.
3. `apps/web` MUST NOT import `@proofline/database`, `@proofline/integration-paypal`, `@proofline/integration-anthropic`, or execute PayPal/database logic directly.
4. `@proofline/integration-anthropic` MUST NOT receive or invoke any tool capable of mutating PayPal disputes, approving submissions, or issuing refunds.
5. Simulated demo records (`DEMO_FIXTURE`) and live sandbox records (`PAYPAL_SANDBOX`) must stay strictly isolated in persistence and queries.

