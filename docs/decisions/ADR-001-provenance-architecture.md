# ADR-001: Evidence Provenance Architecture & Grounded AI Investigation

- **Status**: Accepted
- **Author**: Lakshmikanthan K

## Context

Merchants defending digital service disputes need clear summaries of contracts, emails, deployment logs, and buyer acknowledgements mapped to PayPal's requested `evidence_type` categories. Standard LLM summarization risks fabricating dates, misstating tracking numbers for intangible deliverables, or obeying adversarial prompt injections embedded inside buyer-supplied text.

## Decision

1. **Deterministic Ingestion First**: All uploaded evidence is validated via magic bytes, hashed with SHA-256, stored privately, and parsed by deterministic format-specific extractors (`pdfjs-dist`, `mailparser`, `csv-parse`, JSON walker) that emit structured `SourceLocator` coordinates before the LLM ever inspects a case.
2. **Untrusted Content Delimitation**: Document text is flagged for prompt-injection regex patterns and wrapped inside `<untrusted_evidence>` containers before entering Anthropic Messages tool results.
3. **Closed Tool Loop with Server-Side Grounding**: Anthropic receives 7 strictly scoped Zod tools (`@proofline/integration-anthropic`) returning read-only dispute facts and evidence excerpts. Structured outputs (`InvestigationOutputSchema`) are validated through `groundInvestigationOutput()`, which removes or downgrades any claim lacking an existing workspace `sourceAssetId` and `SourceLocator`.
4. **Human Approval Digest Gate**: Even when Anthropic prepares draft notes, `AI_ASSISTANT` cannot approve or submit. Only a `MERCHANT_USER` computes and confirms the immutable `approvalDigest` prior to executing `provide-evidence`.

## Consequences

- Every verified claim displayed in the UI links directly to an original SHA-256 preserved source file and locator via `<ProvenancePill />`.
- Missing evidence (such as absent carrier tracking for digital services) is surfaced explicitly rather than invented.
- Slight latency at upload time for PDF/EML parsing is offset by fast, verifiable investigation runs and complete auditability.

