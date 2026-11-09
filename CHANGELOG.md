# Changelog

All notable changes to PROOFLINE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Monorepo architecture with 12 pnpm/Turborepo packages enforcing domain, application, authorization, database, evidence, PayPal/Anthropic integration, and UI separation.
- PostgreSQL + Drizzle ORM schema across 16 tables with SQL migrations, `pg` & `PGlite` support, retention locks (`EVIDENCE_RETENTION_LOCKED`), and append-only audit logging.
- Evidence pipeline: extension/MIME/magic-byte inspection, SHA-256 checksums, private local/S3 storage adapters, deterministic parsers (`pdfjs-dist`, `mailparser`, `csv-parse`, JSON, UTF-8 text, image review tagging), `<untrusted_evidence>` XML wrapping, and `pdf-lib` PDF dossier bundling.
- PayPal Sandbox Disputes API v1 adapter: OAuth2 caching/refresh, HATEOAS link verification, attachment ceiling checks, multipart `provide-evidence`, webhook signature verification (`/v1/notifications/verify-webhook-signature`), and post-submit dispute state re-fetching (`VERIFIED` vs `VERIFICATION_PENDING`).
- Anthropic SDK tool-calling investigation engine (`@proofline/integration-anthropic`) with closed read-only tools and server-side citation grounding (`groundInvestigationOutput()`).
- Next.js 16 editorial casework UI (`/login`, `/dashboard`, `/disputes`, `/disputes/[id]`, `/evidence`, `/activity`, `/demo`, `/settings`, `/settings/paypal`, `/settings/ai`), AG Grid Community tables, Recharts ingestion chart, `<ProvenancePill />`, and slide-over `<EvidenceInspectorDrawer />`.
- Comprehensive Vitest unit/integration/security test suites, Playwright Chromium E2E flow suite + visual regression screenshots (`docs/screenshots/`), Render deployment blueprint (`render.yaml`), and full architecture/security documentation (`docs/`, `README.md`).

### Fixed
- Eliminated duplicate pre-flight `getDispute` call in `SubmissionService` during PayPal evidence submission and ensured transient post-submit verification errors preserve correlation IDs as `VERIFICATION_PENDING`.
- Resolved Vitest parallel PGlite hook timeouts (`hookTimeout: 30000`), CORS rejection status handling (`403 CORS_ORIGIN_DENIED`), AG Grid / ledger responsive alignment, and root ESM workspace resolution.
