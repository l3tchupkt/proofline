# PROOFLINE — 3-Minute Demo Storyboard

## 0:00 – 0:25 | Product Positioning & Case Intake
- Show `/login` -> sign in -> `/dashboard` KPI overview and deadlines table.
- Highlight provenance focus: "Evidence you can trace. Disputes you can defend."
- Show strict separation between PayPal Sandbox synced disputes and clearly badged `DEMO DATA` simulations.

## 0:25 – 0:55 | Guided Dispute & Cryptographic Evidence Ingestion
- Open `/demo` and click into the USD 850.00 `MERCHANDISE_OR_SERVICE_NOT_RECEIVED` freelance website dispute (`PP-D-DEMO-850-WEBDEV`).
- Switch to the **Evidence Library** tab showing the 5 preserved files (contract PDF, delivery email `.eml`, buyer approval `.eml`, JSON deployment log, completion gap note).
- Click **Inspect Source** to open `<EvidenceInspectorDrawer />` displaying SHA-256 checksum, parser version, separated `documentCreatedAt` vs. `receivedAt`, and download control.

## 0:55 – 1:35 | Provenance-Grounded Investigation & Timeline
- Show **Investigation & Provenance** tab:
  - Supported claims with `<ProvenancePill />` links (`pdf_page`, `email_message`, `json_path`).
  - Explicit **Evidence Gaps** callout flagging that physical courier tracking does not apply to digital software delivery and avoiding hallucinated tracking IDs.
- Show **Timeline** tab comparing embedded document timestamps against system ingestion timestamps.

## 1:35 – 2:20 | Response Studio, PDF Bundling & Merchant Approval Digest
- Switch to **Response Studio**.
- Select `PROOF_OF_FULFILLMENT`, review factual notes referencing uploaded artifacts, and click **Compile Provenance PDF Bundle** (`pdf-lib`) to convert `.eml`/`.json`/`.txt` citations + SHA-256 digests into a PayPal-compatible PDF attachment.
- Check the explicit confirmation checkbox and click **Approve Exact Submission** to record the SHA-256 `approvalDigest`.
- Edit a character in response notes to show the approval invalidation safeguard resetting the draft status.

## 2:20 – 3:00 | Live Sandbox Isolation, Audit Ledger & Security Boundaries
- Show `/disputes/[id]` Response Studio demonstrating that `DEMO_FIXTURE` refuses live PayPal submission (`DEMO_SUBMISSION_BLOCKED`).
- Explain PayPal Sandbox execution path (`multipart/form-data` `provide-evidence` + follow-up `GET /v1/customer/disputes/:id` verification) and `/settings/paypal` webhook signature status.
- End on `/activity` showing chronological audit entries across `MERCHANT_USER`, `AI_ASSISTANT`, and `SYSTEM_WORKER`.

