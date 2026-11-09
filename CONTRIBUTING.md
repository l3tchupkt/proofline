# Contributing to PROOFLINE

Thank you for your interest in contributing to PROOFLINE.

## Engineering Standards

1. **Architecture boundaries**: Maintain strict separation across `@proofline/domain`, `@proofline/application`, `@proofline/database`, `@proofline/evidence`, `@proofline/integrations/*`, `@proofline/authorization`, `apps/api`, and `apps/web`.
2. **Evidence integrity**: Never fabricate facts, dates, customer acknowledgements, or PayPal outcomes. Every AI-generated claim must cite a verifiable source asset and locator.
3. **No secrets in source control**: Never commit `.env` files, PayPal sandbox keys, Anthropic keys, or customer PII.
4. **Strict TypeScript**: All packages compile with `strict: true` and zero `any` escape hatches without justification.

## Git Workflow

- `main`: stable branch.
- `feat/<short-name>`: feature branches.
- `fix/<short-name>`: bug fix branches.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
- Open a pull request against `main` using the PR template and ensure CI passes before merge.

## Local Verification

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
