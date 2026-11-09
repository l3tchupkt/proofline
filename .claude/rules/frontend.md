---
paths:
  - "apps/web/**"
  - "packages/ui/**"
---

# Frontend Rules

1. Follow `docs/decisions/UI-DESIGN.md`: editorial financial casework palette, IBM Plex Sans + IBM Plex Mono, minimal hairline borders, zero purple gradients or floating chatbot widgets.
2. Follow `.claude/skills/vercel-react-best-practices` and `.claude/skills/vercel-composition-patterns` (React 19 no `forwardRef`, avoid boolean prop proliferation, parallel fetching, explicit variants).
3. Never call PayPal APIs or database drivers from React components or Next.js route handlers; communicate exclusively through `apps/api`.
4. Always surface explicit error states, loading skeletons, and empty states—never render fake success confirmations.
5. Ensure full keyboard navigation, semantic landmarks, accessible labels, and WCAG AA contrast.

