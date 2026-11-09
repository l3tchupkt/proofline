---
name: release-validation
description: Pre-release validation procedure verifying build, tests, docs, Render deployment config, and repository hygiene.
---

# Release Validation Skill

## Validation Checklist
1. Clean install / lockfile check (`pnpm install --frozen-lockfile` or updated `pnpm-lock.yaml`).
2. `pnpm typecheck` passes across all packages and apps.
3. `pnpm lint` passes with zero errors.
4. `pnpm test` passes all unit, PostgreSQL integration, and security suites.
5. `pnpm build` compiles all packages, Fastify API, and Next.js production bundle.
6. `pnpm test:e2e` passes Playwright checks against the running application.
7. Verify `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `render.yaml`, and `.env.example` contain zero fabricated credentials, fake metrics, or non-existent features.
8. Verify `git status` shows no `.env` files or unignored build/storage artifacts.

