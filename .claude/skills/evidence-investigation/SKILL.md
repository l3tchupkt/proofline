---
name: evidence-investigation
description: Repeatable procedure for ingesting untrusted evidence files, computing hashes/locators, and executing source-grounded AI investigation.
---

# Evidence Investigation Skill

## Pipeline Steps
1. Validate file extension, MIME header, and binary magic bytes; reject executables and archives.
2. Compute SHA-256 hash of original bytes and write unaltered file to private storage.
3. Run type-specific parser (`pdfjs-dist`, `mailparser`, `csv-parse`, JSON, UTF-8 text, image inspector) preserving page/message/row/path locators.
4. Scan extracted text for prompt-injection patterns and wrap all evidence text in `<untrusted_evidence>` tags.
5. Invoke Anthropic investigation tool loop (`get_dispute_context`, `get_evidence_assets`, `extract_evidence_facts`, `build_delivery_timeline`, `get_paypal_evidence_requirements`, `analyze_evidence_gaps`, `draft_dispute_response`).
6. Post-validate every generated claim: verify `sourceAssetId` belongs to the dispute and locator matches an existing parsed chunk; downgrade uncited claims to `UNSUPPORTED`.
7. Mark all OCR/image-extracted claims `REQUIRES_REVIEW`.

