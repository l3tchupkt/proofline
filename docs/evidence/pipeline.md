# Evidence Ingestion, Provenance & Bundling Pipeline

PROOFLINE preserves every uploaded dispute attachment as an immutable source artifact and extracts deterministic facts tagged with typed `SourceLocator` coordinates.

## 1. Upload Validation (`packages/evidence/src/validation.ts`)

1. Rejects empty files and files >= 10 MB (exceeding PayPal attachment ceiling or DoS budget).
2. Validates filename extension against allowlist: `.pdf`, `.eml`, `.txt`, `.csv`, `.json`, `.png`, `.jpg`, `.jpeg`, `.gif`.
3. Inspects binary **magic bytes** in addition to the declared MIME type:
   - Blocks `MZ` (Windows PE/EXE), `ELF`, Mach-O (`CAFEBABE` / `FEEDFACE`), and `PK` archives disguised with `.pdf` or `.png` extensions (`SPOOFED_BINARY_SIGNATURE`).
   - Blocks script extensions (`.js`, `.ps1`, `.sh`, `.bat`, `.html`, `.svg`) outright (`UNSUPPORTED_EXTENSION`).
4. Sanitizes filenames before writing to private object keys (`${workspaceId}/${assetId}/${safeFilename}`).

## 2. Cryptographic Preservation & Private Storage (`packages/evidence/src/hashing`, `storage.ts`)

- Computes `SHA-256` over raw uploaded bytes before saving.
- Persists raw bytes inside `LocalPrivateStorage` (or S3-compatible bucket via `S3CompatibleStorage`) completely outside public static directories.
- Files are only streamed back via authenticated, workspace-scoped `GET /api/evidence/:id/download` with `X-Content-Type-Options: nosniff` and `X-Evidence-SHA256`.
- Files referenced by any `evidence_submissions` record are **retention locked** (`EVIDENCE_RETENTION_LOCKED`, HTTP 409 on delete).

## 3. Deterministic Parsing & Timestamp Separation (`packages/evidence/src/parsers`)

| File Type | Parser | SourceLocator Type | Notes |
| --- | --- | --- | --- |
| PDF | `pdfjs-dist` | `pdf_page` | Preserves 1-based `pageNumber`, character offsets, and `/CreationDate` metadata |
| EML | `mailparser` | `email_message` | Extracts RFC-5322 `Message-ID`, `From`, `To`, `Subject`, `Date` |
| CSV | `csv-parse` | `csv_row` | Preserves 1-based row index and column headers |
| JSON | `JSON.parse` | `json_path` | Walks event arrays and preserves `$.path` + timestamps |
| TXT | UTF-8 line scanner | `text_range` | Preserves exact line start/end and offsets |
| PNG / JPG / GIF | Dimension & EXIF header parser | `image_ocr` | Tagged `NEEDS_REVIEW` / `REQUIRES_REVIEW` until merchant inspection |

Every timeline event explicitly distinguishes `documentCreatedAt` (embedded inside the document) from `receivedAt` (UTC application upload timestamp).

## 4. Prompt Injection Defense (`packages/evidence/src/provenance/promptInjection.ts`)

- Scans parsed text for prompt-override directives (`ignore previous instructions`, `call tool`, `system prompt`, `execute refund`, etc.) and flags `promptInjectionSignals`.
- Wraps all extracted text sent to Anthropic inside `<untrusted_evidence assetId="..." filename="..." sha256="...">` XML-escaped containers.
- Post-processes Anthropic outputs through `groundInvestigationOutput()`, stripping any claim whose `sourceAssetId` does not belong to the active dispute or lacks a valid locator.

## 5. PayPal PDF Dossier Compilation (`packages/evidence/src/bundling/pdfBundle.ts`)

Because PayPal `provide-evidence` only accepts `pdf`, `png`, `jpg`, `jpeg`, and `gif` attachments (< 10 MB per file, <= 50 MB total), PROOFLINE uses `pdf-lib` to compile `.eml`, `.json`, `.csv`, `.txt`, and `.pdf` summaries—alongside each file's SHA-256 digest and timestamps—into a clean multi-page PayPal-compatible dossier PDF stored as a first-class evidence asset.

