# PROOFLINE Engineering Instructions

PROOFLINE ("Evidence you can trace. Disputes you can defend.") is an evidence-provenance PayPal dispute investigation and preparation platform built as a pnpm + Turborepo TypeScript monorepo.

## Core Architecture Boundaries

1. `@proofline/domain` — Pure entities, value objects (`Money`), state machines (`SubmissionApprovalStateMachine`), and invariant rules. Zero I/O, zero database or SDK imports.
2. `@proofline/contracts` — Shared Zod v4 DTOs and API/tool contracts.
3. `@proofline/authorization` — Workspace isolation and actor capability enforcement (`MERCHANT_USER`, `SYSTEM_WORKER`, `AI_ASSISTANT`).
4. `@proofline/database` — PostgreSQL + Drizzle ORM schema, SQL migrations, and repository adapters (`pg` and `pglite`).
5. `@proofline/evidence` — Secure file validation, SHA-256 hashing, private storage, typed parsers (PDF/EML/CSV/JSON/TXT/image), prompt-injection tagging, and PDF bundling.
6. `@proofline/integration-paypal` — PayPal Sandbox REST client, OAuth2 token cache, HATEOAS action checks, webhook signature verification, and `multipart/form-data` evidence submission.
7. `@proofline/integration-anthropic` — Anthropic SDK tool-calling investigation orchestrator (`ANTHROPIC_MODEL` via env). Never owns PayPal mutation tools.
8. `@proofline/application` — Use-case orchestration, transactional submission workflow, webhook processing, and demo fixture seeding.
9. `apps/api` — Fastify 5 API, OpenAPI spec, cookie/CSRF auth, rate limiting, and `pg-boss` worker.
10. `apps/web` — Next.js App Router editorial casework UI. Zero direct PayPal API calls or SQL queries.

## Non-Negotiable Invariants

- Never fabricate evidence, dates, client approvals, or dispute outcomes.
- Never claim a dispute was won because PayPal accepted an evidence API submission.
- Every AI claim must cite an existing `sourceAssetId` and verifiable locator, or be flagged as unsupported.
- Modifying submission text or documents after approval invalidates approval (`approvalDigest` mismatch).
- Demo records (`DEMO_FIXTURE`) must never mix with live PayPal sandbox records (`PAYPAL_SANDBOX`).
- Sandbox-only mode is enforced for PayPal endpoints in this build.
- Never commit `.env` files or secrets.

## Commands

- `pnpm typecheck` — TypeScript strict compilation check across workspaces.
- `pnpm lint` — ESLint checks across packages and apps.
- `pnpm test` — Vitest unit, integration, and security test suites.
- `pnpm build` — Full Turborepo production build.

