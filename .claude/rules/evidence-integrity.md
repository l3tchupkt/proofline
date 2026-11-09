---
paths:
  - "packages/evidence/**"
  - "packages/integrations/anthropic/**"
  - "packages/application/**"
---

# Evidence Integrity & Provenance Rules

1. Every uploaded file must pass extension, MIME, magic-byte signature, and size validation before private persistence. Reject executables and archives.
2. Compute SHA-256 of raw file bytes immediately upon ingestion and preserve original bytes unaltered.
3. Record application receipt timestamp separately from document-internal timestamps; receipt time never proves creation time.
4. Preserve exact locators (`pageNumber`, `textStart`/`textEnd`, `messageId`, `rowIndex`, `jsonPath`).
5. Wrap all extracted document text inside `<untrusted_evidence>` delimiters and strip/neutralize prompt-injection directives.
6. Every AI claim must reference at least one verified `sourceAssetId` from the current dispute; OCR-derived claims must be marked `REQUIRES_REVIEW`.
7. Modifying submission notes, evidence type, or attached documents after merchant approval must immediately invalidate the approval.

