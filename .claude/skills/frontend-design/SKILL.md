---
name: frontend-design
description: Project-specific visual direction and UI review standard for PROOFLINE's editorial financial casework interface.
---

# PROOFLINE Frontend Design Skill

## Visual Identity: Editorial Financial Casework

PROOFLINE must read like a serious institutional dispute operations ledger—similar to Stripe Sigma, Ramp audit logs, or a litigation evidence binder.

### Color Tokens
- Canvas background: `#F7F6F2` (warm alabaster paper)
- Elevated surface: `#FFFFFF` (crisp card/table cell)
- Subtle recess / header tint: `#F0EEE8`
- Primary ink: `#14181F`
- Secondary ink: `#4A5568`
- Muted / metadata ink: `#6B7280`
- Hairline border: `#DFDCD4`
- Strong border: `#C5C0B4`
- Primary accent (restrained navy): `#1B3B6F` (`#142C54` hover)
- Evidence verified / green: `#156F48` (surface `#EAF6EF`)
- Warning / deadline amber: `#9A5B06` (surface `#FEF5E4`)
- Critical / contradiction / expired red: `#A82424` (surface `#FDECEC`)

### Typography
- Primary UI font: `IBM Plex Sans`
- Identifiers, SHA-256 prefixes, dispute IDs, transaction IDs, amounts, timestamps: `IBM Plex Mono` with `tabular-nums`.

### Signature Visual Element: The Provenance Spine
Every extracted fact, timeline node, and response claim renders an interactive **Provenance Pill** showing:
- Epistemic tag (`VERIFIED FACT` / `REQUIRES REVIEW` / `AI INTERPRETATION` / `CONFLICT`)
- Short monospace asset badge + locator (`contract.pdf · p.2` or `delivery.eml · msg-01`)
- Clicking opens the Evidence Source Inspector directly at the cited page/offset/message.

### Explicit Anti-Patterns (Reject on Review)
- Purple or neon gradients, glassmorphism, floating AI chat bubbles, decorative placeholder charts, emoji icons, rounded-3xl consumer cards, fake "AI thinking" theater.

### Review Procedure
1. Audit every new route/component against `docs/decisions/UI-DESIGN.md`.
2. Verify all tables/grids use crisp 1px borders and `tabular-nums` alignment.
3. Run the `web-design-guidelines` accessibility and UX checklist before sign-off.
