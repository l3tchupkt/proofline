# PROOFLINE Architecture Overview

PROOFLINE is structured as a modular pnpm + Turborepo TypeScript monorepo enforcing strict inward dependencies and evidence provenance invariants.

## Dependency Graph

```
apps/web (Next.js App Router) ──▶ apps/api (Fastify + OpenAPI + pg-boss)
                                         │
                                         ▼
                              @proofline/application
                                         │
        ┌────────────────┬───────────────┼───────────────┬────────────────┐
        ▼                ▼               ▼               ▼                ▼
@proofline/domain  @proofline/     @proofline/     @proofline/      @proofline/
                   authorization   database        evidence         integrations/*
```

## Module Responsibilities

- **`@proofline/config`**: Validates startup configuration with Zod v4, locks PayPal integration strictly to Sandbox mode, and prevents unconfigured external adapters from disguising failures.
- **`@proofline/domain`**: Pure domain entities (`Dispute`, `EvidenceAsset`, `EvidenceSubmission`, `ExtractedFact`, `EvidenceClaim`), exact integer minor-unit `Money`, PayPal document constraint validation, HATEOAS link evaluation, and content-bound `SubmissionApprovalStateMachine`.
- **`@proofline/contracts`**: Shared Zod v4 DTOs and tool output schemas consumed across the API, AI engine, and Next.js frontend.
- **`@proofline/authorization`**: Enforces workspace isolation and actor permission boundaries (`MERCHANT_USER`, `SYSTEM_WORKER`, `AI_ASSISTANT`). `AI_ASSISTANT` actors cannot execute submissions, approvals, refunds, or cross-workspace queries.
- **`@proofline/database`**: PostgreSQL Drizzle ORM schema across 16 relational tables, SQL migrations, transactional submission mutations, and append-only audit history. Supports both `node-postgres` and in-process `@electric-sql/pglite` for deterministic integration testing.
- **`@proofline/evidence`**: Secure upload validation (extension + MIME + magic-byte inspection), SHA-256 hashing, private file storage, typed parsers (`pdfjs-dist`, `mailparser`, `csv-parse`, JSON, UTF-8 text, image inspection), prompt-injection tagging, and PDF bundling (`pdf-lib`).
- **`@proofline/integration-paypal`**: Typed PayPal Sandbox Disputes API client with OAuth2 token caching, timeouts, bounded retries, HATEOAS action verification, `multipart/form-data` evidence upload, and webhook signature verification.
- **`@proofline/integration-anthropic`**: Official `@anthropic-ai/sdk` tool-calling orchestrator using `ANTHROPIC_MODEL`, isolated from PayPal mutation tools and grounded by post-validation of `sourceAssetId` citations.
- **`apps/api`**: Fastify 5 HTTP API, Swagger OpenAPI schema generation, Argon2id session cookies + CSRF validation, raw webhook handling, and `pg-boss` background jobs.
- **`apps/web`**: Next.js 16 App Router editorial financial casework interface with AG Grid Community and zero direct PayPal or SQL access.

