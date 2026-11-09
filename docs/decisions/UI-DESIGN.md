# PROOFLINE UI Design Specification

## 1. Design Principles

PROOFLINE uses an **evidence-first editorial casework** visual language built for financial operations, legal/compliance analysts, and independent digital merchants defending PayPal disputes.

1. **Provenance over decoration**: Every factual claim, timeline entry, and response paragraph surfaces its underlying file name, page/message/row locator, and SHA-256 verification metadata.
2. **Calm operational precision**: High information density without clutter. Hairline borders, structured grids, and aligned monospace numerals prevent cognitive fatigue during case investigation.
3. **Strict separation of truth states**: Visually distinguish `VERIFIED FACT`, `REQUIRES REVIEW` (OCR or uncertain extraction), `AI INTERPRETATION`, `MERCHANT ASSERTION`, `CONFLICTING`, and `MISSING EVIDENCE`.
4. **No false certainty**: Submission confirmation badges explicitly read `SUBMITTED TO PAYPAL — VERIFIED VIA API` (or `VERIFICATION PENDING`), never implying a dispute has been won.
5. **Strict origin separation**: Demo fixtures display an unmistakable top-bar & casework banner (`DEMO DATA — NOT A LIVE CUSTOMER RECORD`) and are never interleaved with Sandbox disputes.

## 2. Color Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| `--bg-canvas` | `#F7F6F2` | Primary application canvas (warm alabaster paper) |
| `--bg-surface` | `#FFFFFF` | Cards, panels, grid rows, drawers |
| `--bg-recessed` | `#F0EEE8` | Table headers, rail chrome, code/locator strips |
| `--ink-primary` | `#14181F` | Headings, case titles, primary body text |
| `--ink-secondary` | `#4A5568` | Descriptions, secondary metadata |
| `--ink-muted` | `#6B7280` | Captions, subtle labels |
| `--border-hairline` | `#DFDCD4` | Default card, row, and rail dividers (1px) |
| `--border-strong` | `#C5C0B4` | Active focus frames, primary action outlines |
| `--accent-navy` | `#1B3B6F` | Primary CTAs, active navigation markers, links |
| `--accent-navy-hover` | `#142C54` | Hover/pressed primary action states |
| `--status-verified-fg` | `#156F48` | Verified facts, API verification success |
| `--status-verified-bg` | `#EAF6EF` | Verified badge surface |
| `--status-warning-fg` | `#9A5B06` | Deadlines approaching, `REQUIRES_REVIEW`, warnings |
| `--status-warning-bg` | `#FEF5E4` | Warning badge & callout surface |
| `--status-danger-fg` | `#A82424` | Expired deadlines, contradictions, API errors |
| `--status-danger-bg` | `#FDECEC` | Error/contradiction badge & banner surface |

## 3. Typography

- **UI & Editorial Sans**: `IBM Plex Sans` (`400`, `500`, `600`)
- **Technical Monospace**: `IBM Plex Mono` (`400`, `500`) with `font-variant-numeric: tabular-nums` for:
  - PayPal Dispute IDs (`PP-D-...`), Transaction IDs, Webhook Event IDs
  - Monetary amounts (`USD 850.00`)
  - SHA-256 digests (`9f2a8c...`)
  - Source locators (`contract.pdf · p.2`, `delivery.eml · msg-01`, `activity.json · $.events[3]`)
  - ISO UTC timestamps

### Type Scale
- Page Title: `20px` (`1.25rem`), weight `600`, tight `-0.015em` tracking
- Section Heading: `14px` (`0.875rem`), weight `600`, uppercase micro-label or crisp sentence case
- Body Copy: `14px` (`0.875rem`), line-height `1.55`
- Dense Table / Grid Cell: `13px` (`0.8125rem`)
- Metadata / Monospace Tag: `11.5px` (`0.71875rem`)

## 4. Spacing Scale & Layout Chrome

- Base unit: `4px` (`4`, `8`, `12`, `16`, `24`, `32`, `48`)
- Left navigation rail: `232px` fixed width on desktop (`>= 1024px`), collapsible drawer on mobile (`< 1024px`).
- Top environment bar: `44px` height showing `SANDBOX ONLY` indicator, workspace slug, and Demo Mode toggle/indicator when active.
- Content max-width: `1440px` fluid workspace grid (`24px` horizontal padding).
- Border radius: `4px` (`rounded-sm`) for buttons, badges, inputs; `6px` (`rounded-md`) for panels. Zero pill-bloated `rounded-3xl` cards.
- Shadows: None by default; `0 1px 2px rgba(20, 24, 31, 0.05)` only on floating drawers/menus.

## 5. Signature Visual Element: The Provenance Spine

Every extracted fact, timeline event, and draft claim attaches a clickable **Provenance Pill**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [VERIFIED FACT]  Client acknowledged staging deployment delivery        │
│ ↳ client_approval.eml · msg-002 · chars 142–268 · sha256:4a91c8...      │
└─────────────────────────────────────────────────────────────────────────┘
```

Selecting any Provenance Pill opens the slide-over **Source Evidence Inspector** scrolled/focused to that asset's extracted text, metadata, receipt timestamp vs. document timestamp, and raw SHA-256 checksum.

## 6. Desktop Wireframes

### Case Investigation & Response Studio (`/disputes/[id]`)
```
+------------------+------------------------------------------------------------------+
| PROOFLINE        | Top Bar: [SANDBOX]  Case PP-D-... | Due 2026-11-20 | USD 850.00  |
|                  +------------------------------------------------------------------+
| - Dashboard      | Case Header: Reason, PayPal Status, Lifecycle Stage, HATEOAS     |
| - Disputes       +-----------------------------------------+------------------------+
| - Evidence       | Tabs:                                   | Right Evidence Rail    |
| - Activity       | [Overview] [Investigation] [Timeline]   | - Requested Types      |
| - Demo           | [Response Studio] [Audit]               | - Uploaded Assets      |
| - Settings       |                                         | - Hash & Status        |
|                  | Response Studio:                        | - Quick Upload         |
|                  |  1. Evidence Type + Attachment Picker   |                        |
|                  |  2. Draft Editor (invalidates approval) |                        |
|                  |  3. Claim -> Source Verification Matrix |                        |
|                  |  4. Explicit Merchant Approval Checkbox |                        |
|                  |  5. Submit to PayPal Sandbox + Verify   |                        |
+------------------+-----------------------------------------+------------------------+
```

### Disputes Operations Grid (`/disputes`)
```
+------------------+------------------------------------------------------------------+
| Nav Rail         | Header: Sandbox Disputes | [Sync Sandbox Disputes]             |
|                  +------------------------------------------------------------------+
|                  | Filters: [Search ID/Txn] [Status v] [Reason v] [Origin]          |
|                  +------------------------------------------------------------------+
|                  | AG Grid Community Table:                                         |
|                  | Dispute ID | Reason | Status | Stage | Amount | Due Date | Action |
|                  +------------------------------------------------------------------+
```

## 7. Mobile Behavior (`< 1024px`)

- Left navigation rail collapses into an accessible top-left slide-over drawer trigger (`aria-label="Open navigation"`).
- Two-column case studio stacks vertically: Case Header -> Primary Tabs -> Evidence Rail accordion.
- Tables horizontally scroll cleanly inside bordered containers with sticky first column where applicable.
- Touch targets meet `>= 40px` minimum height on mobile controls.

## 8. Accessibility Requirements (WCAG AA)

- Color contrast >= `4.5:1` for normal text and >= `3:1` for UI borders/icons.
- Never convey status by color alone: every status badge pairs color with crisp text labels and distinct Lucide icons (`CheckCircle2`, `AlertTriangle`, `XCircle`, `Clock`).
- Full keyboard accessibility (`Tab`, `Enter`, `Space`, `Escape` on drawers/dialogs) with visible `2px solid #1B3B6F` focus rings (`focus-visible:outline-2`).
- Semantic HTML landmarks (`<nav>`, `<main>`, `<header>`), proper `<label htmlFor>`, `aria-live="polite"` status announcements on uploads, investigations, and submissions.
- Respect `prefers-reduced-motion: reduce`.

