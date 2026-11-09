import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import type { HateoasLink, RecordOrigin, SourceLocator } from '@proofline/domain';

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    paypalMerchantPayerId: varchar('paypal_merchant_payer_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [uniqueIndex('workspaces_slug_uidx').on(table.slug)]
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    role: varchar('role', { length: 32 }).$type<'OWNER' | 'OPERATOR' | 'REVIEWER'>().notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('users_email_uidx').on(table.email),
    index('users_workspace_idx').on(table.workspaceId)
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    csrfToken: varchar('csrf_token', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uidx').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt)
  ]
);

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    recordOrigin: varchar('record_origin', { length: 32 }).$type<RecordOrigin>().notNull(),
    paypalDisputeId: varchar('paypal_dispute_id', { length: 128 }).notNull(),
    paypalTransactionId: varchar('paypal_transaction_id', { length: 128 }),
    reason: varchar('reason', { length: 128 }).notNull(),
    rawStatus: varchar('raw_status', { length: 64 }).notNull(),
    workflowStatus: varchar('workflow_status', { length: 48 }).notNull(),
    rawLifecycleStage: varchar('raw_lifecycle_stage', { length: 64 }),
    lifecycleStage: varchar('lifecycle_stage', { length: 32 }).notNull(),
    channel: varchar('channel', { length: 64 }),
    amountMinor: integer('amount_minor').notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    buyerDisplayLabel: varchar('buyer_display_label', { length: 160 }),
    sellerResponseDueAt: timestamp('seller_response_due_at', { withTimezone: true, mode: 'date' }),
    disputeCreatedAt: timestamp('dispute_created_at', { withTimezone: true, mode: 'date' }),
    disputeUpdatedAt: timestamp('dispute_updated_at', { withTimezone: true, mode: 'date' }),
    outcomeCode: varchar('outcome_code', { length: 64 }),
    links: jsonb('links').$type<HateoasLink[]>().default([]).notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().default({}).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('disputes_workspace_paypal_id_uidx').on(table.workspaceId, table.paypalDisputeId),
    index('disputes_workspace_origin_idx').on(table.workspaceId, table.recordOrigin),
    index('disputes_status_idx').on(table.workspaceId, table.workflowStatus),
    index('disputes_due_date_idx').on(table.workspaceId, table.sellerResponseDueAt)
  ]
);

export const evidenceAssets = pgTable(
  'evidence_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id').references(() => disputes.id, { onDelete: 'set null' }),
    recordOrigin: varchar('record_origin', { length: 32 }).$type<RecordOrigin>().notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    extension: varchar('extension', { length: 16 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256Hash: varchar('sha256_hash', { length: 64 }).notNull(),
    storageDriver: varchar('storage_driver', { length: 16 }).$type<'local' | 's3'>().notNull(),
    storageKey: text('storage_key').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    parserVersion: varchar('parser_version', { length: 64 }),
    extractedText: text('extracted_text'),
    extractedMetadata: jsonb('extracted_metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    promptInjectionSignals: jsonb('prompt_injection_signals')
      .$type<string[]>()
      .default([])
      .notNull(),
    documentCreatedAt: timestamp('document_created_at', { withTimezone: true, mode: 'date' }),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('evidence_assets_workspace_idx').on(table.workspaceId, table.recordOrigin),
    index('evidence_assets_dispute_idx').on(table.disputeId),
    index('evidence_assets_hash_idx').on(table.workspaceId, table.sha256Hash)
  ]
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    recordOrigin: varchar('record_origin', { length: 32 }).$type<RecordOrigin>().notNull(),
    initiatedByUserId: uuid('initiated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    modelId: varchar('model_id', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    toolCallTrace: jsonb('tool_call_trace')
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    structuredOutput: jsonb('structured_output')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
  },
  (table) => [
    index('ai_runs_dispute_idx').on(table.workspaceId, table.disputeId),
    index('ai_runs_started_idx').on(table.startedAt)
  ]
);

export const extractedFacts = pgTable(
  'extracted_facts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    sourceAssetId: uuid('source_asset_id')
      .notNull()
      .references(() => evidenceAssets.id, { onDelete: 'cascade' }),
    factType: varchar('fact_type', { length: 64 }).notNull(),
    factText: text('fact_text').notNull(),
    locator: jsonb('locator').$type<SourceLocator>().notNull(),
    confidence: real('confidence').notNull(),
    verificationStatus: varchar('verification_status', { length: 32 }).notNull(),
    extractionVersion: varchar('extraction_version', { length: 64 }).notNull(),
    isOcrDerived: boolean('is_ocr_derived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('extracted_facts_dispute_idx').on(table.workspaceId, table.disputeId),
    index('extracted_facts_asset_idx').on(table.sourceAssetId)
  ]
);

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    sourceAssetId: uuid('source_asset_id').references(() => evidenceAssets.id, {
      onDelete: 'set null'
    }),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true, mode: 'date' }),
    timestampPrecision: varchar('timestamp_precision', { length: 24 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    locator: jsonb('locator').$type<SourceLocator | null>(),
    verificationStatus: varchar('verification_status', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('timeline_events_dispute_idx').on(table.workspaceId, table.disputeId),
    index('timeline_events_ts_idx').on(table.eventTimestamp)
  ]
);

export const evidenceRequirements = pgTable(
  'evidence_requirements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    evidenceType: varchar('evidence_type', { length: 128 }).notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    isRequired: boolean('is_required').default(true).notNull(),
    satisfied: boolean('satisfied').default(false).notNull(),
    rawRequirement: jsonb('raw_requirement')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('evidence_requirements_dispute_type_uidx').on(
      table.disputeId,
      table.evidenceType,
      table.source
    )
  ]
);

export const evidenceClaims = pgTable(
  'evidence_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    aiRunId: uuid('ai_run_id').references(() => aiRuns.id, { onDelete: 'set null' }),
    claimText: text('claim_text').notNull(),
    category: varchar('category', { length: 32 }).notNull(),
    verificationStatus: varchar('verification_status', { length: 32 }).notNull(),
    mappedEvidenceType: varchar('mapped_evidence_type', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [index('evidence_claims_dispute_idx').on(table.workspaceId, table.disputeId)]
);

export const claimSources = pgTable(
  'claim_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => evidenceClaims.id, { onDelete: 'cascade' }),
    sourceAssetId: uuid('source_asset_id')
      .notNull()
      .references(() => evidenceAssets.id, { onDelete: 'cascade' }),
    factId: uuid('fact_id').references(() => extractedFacts.id, { onDelete: 'set null' }),
    locator: jsonb('locator').$type<SourceLocator>().notNull()
  },
  (table) => [index('claim_sources_claim_idx').on(table.claimId)]
);

export const evidenceSubmissions = pgTable(
  'evidence_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    recordOrigin: varchar('record_origin', { length: 32 }).$type<RecordOrigin>().notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    actionType: varchar('action_type', { length: 32 }).notNull(),
    evidenceType: varchar('evidence_type', { length: 128 }).notNull(),
    responseNotes: text('response_notes').notNull(),
    trackingNumber: varchar('tracking_number', { length: 128 }),
    carrierName: varchar('carrier_name', { length: 128 }),
    refundId: varchar('refund_id', { length: 128 }),
    approvalDigest: varchar('approval_digest', { length: 64 }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null'
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    paypalCorrelationId: varchar('paypal_correlation_id', { length: 128 }),
    paypalResponsePayload: jsonb('paypal_response_payload').$type<Record<string, unknown> | null>(),
    postSubmitVerificationPayload: jsonb('post_submit_verification_payload').$type<Record<
      string,
      unknown
    > | null>(),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('evidence_submissions_idempotency_uidx').on(
      table.workspaceId,
      table.idempotencyKey
    ),
    index('evidence_submissions_dispute_idx').on(table.workspaceId, table.disputeId),
    index('evidence_submissions_status_idx').on(table.workspaceId, table.status)
  ]
);

export const submissionDocuments = pgTable(
  'submission_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => evidenceSubmissions.id, { onDelete: 'cascade' }),
    evidenceAssetId: uuid('evidence_asset_id')
      .notNull()
      .references(() => evidenceAssets.id, { onDelete: 'restrict' }),
    assetSha256Hash: varchar('asset_sha256_hash', { length: 64 }).notNull(),
    attachmentOrder: integer('attachment_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('submission_documents_pair_uidx').on(table.submissionId, table.evidenceAssetId)
  ]
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    paypalEventId: varchar('paypal_event_id', { length: 128 }).notNull(),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    resourceId: varchar('resource_id', { length: 128 }),
    signatureVerified: boolean('signature_verified').default(false).notNull(),
    verificationStatus: varchar('verification_status', { length: 32 }).notNull(),
    processingStatus: varchar('processing_status', { length: 32 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    headers: jsonb('headers').$type<Record<string, string>>().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
  },
  (table) => [
    uniqueIndex('webhook_events_event_id_uidx').on(table.paypalEventId),
    index('webhook_events_status_idx').on(table.processingStatus, table.receivedAt)
  ]
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    disputeId: uuid('dispute_id').references(() => disputes.id, { onDelete: 'set null' }),
    actorType: varchar('actor_type', { length: 32 }).notNull(),
    actorId: varchar('actor_id', { length: 128 }).notNull(),
    action: varchar('action', { length: 128 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    resourceId: varchar('resource_id', { length: 128 }),
    result: varchar('result', { length: 24 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
  },
  (table) => [
    index('audit_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    index('audit_events_dispute_idx').on(table.disputeId)
  ]
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    queueName: varchar('queue_name', { length: 128 }).notNull(),
    externalJobId: varchar('external_job_id', { length: 128 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
  },
  (table) => [
    index('jobs_queue_status_idx').on(table.queueName, table.status),
    uniqueIndex('jobs_queue_idempotency_uidx').on(table.queueName, table.idempotencyKey)
  ]
);

