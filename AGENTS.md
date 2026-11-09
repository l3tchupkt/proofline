# Cross-Agent Engineering Conventions

This repository uses specialized engineering roles defined in `.claude/agents/`, path-scoped rules in `.claude/rules/`, and repeatable procedures in `.claude/skills/`.

## Collaboration Protocol

- **Main Integrator**: Owns cross-package wiring, database schema consistency, milestone verification, and commits.
- **Specialist Agents**: Perform focused audits, design reviews, and isolated investigations without producing competing implementations of the same files.
- **Documentation Integrity**: Preserve existing comments and docstrings unrelated to a targeted edit. Update `docs/decisions/BUILD-STATUS.md` if work pauses mid-milestone.

## Path Conventions

- Domain & application business rules: `packages/domain`, `packages/application`, `packages/authorization`
- Database schema & migrations: `packages/database`
- Evidence parsers & hashing: `packages/evidence`
- External adapters: `packages/integrations/paypal`, `packages/integrations/anthropic`
- API server & background worker: `apps/api`
- Frontend application: `apps/web`, `packages/ui`
- Verification suites: `tests/unit`, `tests/integration`, `tests/security`, `tests/e2e`

## Quality Gates Before Every Commit

1. `pnpm typecheck` passes with zero errors.
2. `pnpm lint` passes with zero errors.
3. `pnpm test` passes with zero skipped critical security/provenance tests.
4. No real secrets, tokens, or `.env` files are staged (`git status` verified).
