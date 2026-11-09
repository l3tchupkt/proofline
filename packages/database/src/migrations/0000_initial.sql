CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "paypal_merchant_payer_id" varchar(64),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_uidx" ON "workspaces" ("slug");

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "display_name" varchar(120) NOT NULL,
  "role" varchar(32) NOT NULL,
  "password_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uidx" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_workspace_idx" ON "users" ("workspace_id");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "csrf_token" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_uidx" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" ("expires_at");

CREATE TABLE IF NOT EXISTS "disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "record_origin" varchar(32) NOT NULL,
  "paypal_dispute_id" varchar(128) NOT NULL,
  "paypal_transaction_id" varchar(128),
  "reason" varchar(128) NOT NULL,
  "raw_status" varchar(64) NOT NULL,
  "workflow_status" varchar(48) NOT NULL,
  "raw_lifecycle_stage" varchar(64),
  "lifecycle_stage" varchar(32) NOT NULL,
  "channel" varchar(64),
  "amount_minor" integer NOT NULL,
  "currency_code" varchar(3) NOT NULL,
  "buyer_display_label" varchar(160),
  "seller_response_due_at" timestamptz,
  "dispute_created_at" timestamptz,
  "dispute_updated_at" timestamptz,
  "outcome_code" varchar(64),
  "links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "disputes_workspace_paypal_id_uidx" ON "disputes" ("workspace_id", "paypal_dispute_id");
CREATE INDEX IF NOT EXISTS "disputes_workspace_origin_idx" ON "disputes" ("workspace_id", "record_origin");
CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "disputes" ("workspace_id", "workflow_status");
CREATE INDEX IF NOT EXISTS "disputes_due_date_idx" ON "disputes" ("workspace_id", "seller_response_due_at");

CREATE TABLE IF NOT EXISTS "evidence_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid REFERENCES "disputes"("id") ON DELETE SET NULL,
  "record_origin" varchar(32) NOT NULL,
  "uploaded_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "original_filename" varchar(255) NOT NULL,
  "extension" varchar(16) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256_hash" varchar(64) NOT NULL,
  "storage_driver" varchar(16) NOT NULL,
  "storage_key" text NOT NULL,
  "status" varchar(32) NOT NULL,
  "parser_version" varchar(64),
  "extracted_text" text,
  "extracted_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prompt_injection_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "document_created_at" timestamptz,
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "evidence_assets_workspace_idx" ON "evidence_assets" ("workspace_id", "record_origin");
CREATE INDEX IF NOT EXISTS "evidence_assets_dispute_idx" ON "evidence_assets" ("dispute_id");
CREATE INDEX IF NOT EXISTS "evidence_assets_hash_idx" ON "evidence_assets" ("workspace_id", "sha256_hash");

CREATE TABLE IF NOT EXISTS "ai_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "record_origin" varchar(32) NOT NULL,
  "initiated_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "provider" varchar(32) NOT NULL,
  "model_id" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL,
  "tool_call_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "structured_output" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" varchar(64),
  "error_message" text,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ai_runs_dispute_idx" ON "ai_runs" ("workspace_id", "dispute_id");
CREATE INDEX IF NOT EXISTS "ai_runs_started_idx" ON "ai_runs" ("started_at");

CREATE TABLE IF NOT EXISTS "extracted_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "source_asset_id" uuid NOT NULL REFERENCES "evidence_assets"("id") ON DELETE CASCADE,
  "fact_type" varchar(64) NOT NULL,
  "fact_text" text NOT NULL,
  "locator" jsonb NOT NULL,
  "confidence" real NOT NULL,
  "verification_status" varchar(32) NOT NULL,
  "extraction_version" varchar(64) NOT NULL,
  "is_ocr_derived" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "extracted_facts_dispute_idx" ON "extracted_facts" ("workspace_id", "dispute_id");
CREATE INDEX IF NOT EXISTS "extracted_facts_asset_idx" ON "extracted_facts" ("source_asset_id");

CREATE TABLE IF NOT EXISTS "timeline_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "source_asset_id" uuid REFERENCES "evidence_assets"("id") ON DELETE SET NULL,
  "event_timestamp" timestamptz,
  "timestamp_precision" varchar(24) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "locator" jsonb,
  "verification_status" varchar(32) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "timeline_events_dispute_idx" ON "timeline_events" ("workspace_id", "dispute_id");
CREATE INDEX IF NOT EXISTS "timeline_events_ts_idx" ON "timeline_events" ("event_timestamp");

CREATE TABLE IF NOT EXISTS "evidence_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "evidence_type" varchar(128) NOT NULL,
  "source" varchar(64) NOT NULL,
  "is_required" boolean DEFAULT true NOT NULL,
  "satisfied" boolean DEFAULT false NOT NULL,
  "raw_requirement" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_requirements_dispute_type_uidx" ON "evidence_requirements" ("dispute_id", "evidence_type", "source");

CREATE TABLE IF NOT EXISTS "evidence_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "ai_run_id" uuid REFERENCES "ai_runs"("id") ON DELETE SET NULL,
  "claim_text" text NOT NULL,
  "category" varchar(32) NOT NULL,
  "verification_status" varchar(32) NOT NULL,
  "mapped_evidence_type" varchar(128),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "evidence_claims_dispute_idx" ON "evidence_claims" ("workspace_id", "dispute_id");

CREATE TABLE IF NOT EXISTS "claim_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_id" uuid NOT NULL REFERENCES "evidence_claims"("id") ON DELETE CASCADE,
  "source_asset_id" uuid NOT NULL REFERENCES "evidence_assets"("id") ON DELETE CASCADE,
  "fact_id" uuid REFERENCES "extracted_facts"("id") ON DELETE SET NULL,
  "locator" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "claim_sources_claim_idx" ON "claim_sources" ("claim_id");

CREATE TABLE IF NOT EXISTS "evidence_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "record_origin" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL,
  "action_type" varchar(32) NOT NULL,
  "evidence_type" varchar(128) NOT NULL,
  "response_notes" text NOT NULL,
  "tracking_number" varchar(128),
  "carrier_name" varchar(128),
  "refund_id" varchar(128),
  "approval_digest" varchar(64),
  "approved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "idempotency_key" varchar(128) NOT NULL,
  "paypal_correlation_id" varchar(128),
  "paypal_response_payload" jsonb,
  "post_submit_verification_payload" jsonb,
  "error_code" varchar(64),
  "error_message" text,
  "submitted_at" timestamptz,
  "verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_submissions_idempotency_uidx" ON "evidence_submissions" ("workspace_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "evidence_submissions_dispute_idx" ON "evidence_submissions" ("workspace_id", "dispute_id");
CREATE INDEX IF NOT EXISTS "evidence_submissions_status_idx" ON "evidence_submissions" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "submission_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL REFERENCES "evidence_submissions"("id") ON DELETE CASCADE,
  "evidence_asset_id" uuid NOT NULL REFERENCES "evidence_assets"("id") ON DELETE RESTRICT,
  "asset_sha256_hash" varchar(64) NOT NULL,
  "attachment_order" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "submission_documents_pair_uidx" ON "submission_documents" ("submission_id", "evidence_asset_id");

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
  "paypal_event_id" varchar(128) NOT NULL,
  "event_type" varchar(128) NOT NULL,
  "resource_id" varchar(128),
  "signature_verified" boolean DEFAULT false NOT NULL,
  "verification_status" varchar(32) NOT NULL,
  "processing_status" varchar(32) NOT NULL,
  "payload" jsonb NOT NULL,
  "headers" jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "processed_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_event_id_uidx" ON "webhook_events" ("paypal_event_id");
CREATE INDEX IF NOT EXISTS "webhook_events_status_idx" ON "webhook_events" ("processing_status", "received_at");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "dispute_id" uuid REFERENCES "disputes"("id") ON DELETE SET NULL,
  "actor_type" varchar(32) NOT NULL,
  "actor_id" varchar(128) NOT NULL,
  "action" varchar(128) NOT NULL,
  "resource_type" varchar(64) NOT NULL,
  "resource_id" varchar(128),
  "result" varchar(24) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_events_workspace_time_idx" ON "audit_events" ("workspace_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "audit_events_dispute_idx" ON "audit_events" ("dispute_id");

CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "queue_name" varchar(128) NOT NULL,
  "external_job_id" varchar(128),
  "idempotency_key" varchar(128),
  "status" varchar(32) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "scheduled_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "jobs_queue_status_idx" ON "jobs" ("queue_name", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_queue_idempotency_uidx" ON "jobs" ("queue_name", "idempotency_key");

