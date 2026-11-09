import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import type {
  DisputeLifecycleStage,
  DisputeWorkflowStatus,
  HateoasLink,
  RecordOrigin,
  SourceLocator
} from '@proofline/domain';
import type { ProoflineDatabase } from '../client.js';
import {
  claimSources,
  disputes,
  evidenceClaims,
  evidenceRequirements,
  extractedFacts,
  timelineEvents
} from '../schema/index.js';

export type DisputeRow = typeof disputes.$inferSelect;
export type ExtractedFactRow = typeof extractedFacts.$inferSelect;
export type TimelineEventRow = typeof timelineEvents.$inferSelect;
export type EvidenceRequirementRow = typeof evidenceRequirements.$inferSelect;
export type EvidenceClaimRow = typeof evidenceClaims.$inferSelect;
export type ClaimSourceRow = typeof claimSources.$inferSelect;

export interface UpsertDisputeInput {
  workspaceId: string;
  recordOrigin: RecordOrigin;
  paypalDisputeId: string;
  paypalTransactionId: string | null;
  reason: string;
  rawStatus: string;
  workflowStatus: DisputeWorkflowStatus;
  rawLifecycleStage: string | null;
  lifecycleStage: DisputeLifecycleStage;
  channel: string | null;
  amountMinor: number;
  currencyCode: string;
  buyerDisplayLabel: string | null;
  sellerResponseDueAt: Date | null;
  disputeCreatedAt: Date | null;
  disputeUpdatedAt: Date | null;
  outcomeCode: string | null;
  links: HateoasLink[];
  rawPayload: Record<string, unknown>;
  lastSyncedAt: Date;
}

export class DisputeRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async listByWorkspace(
    workspaceId: string,
    filters: {
      origin?: RecordOrigin;
      status?: DisputeWorkflowStatus;
      reason?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ items: DisputeRow[]; total: number }> {
    const conditions = [eq(disputes.workspaceId, workspaceId)];

    if (filters.origin) {
      conditions.push(eq(disputes.recordOrigin, filters.origin));
    }
    if (filters.status) {
      conditions.push(eq(disputes.workflowStatus, filters.status));
    }
    if (filters.reason) {
      conditions.push(eq(disputes.reason, filters.reason));
    }
    if (filters.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim()}%`;
      const searchCond = or(
        ilike(disputes.paypalDisputeId, term),
        ilike(disputes.paypalTransactionId, term),
        ilike(disputes.reason, term),
        ilike(disputes.buyerDisplayLabel, term)
      );
      if (searchCond) conditions.push(searchCond);
    }

    const whereClause = and(...conditions);
    const allMatching = await this.db
      .select()
      .from(disputes)
      .where(whereClause)
      .orderBy(asc(disputes.sellerResponseDueAt), desc(disputes.disputeUpdatedAt));

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const offset = (page - 1) * pageSize;

    return {
      items: allMatching.slice(offset, offset + pageSize),
      total: allMatching.length
    };
  }

  async findById(workspaceId: string, disputeId: string): Promise<DisputeRow | null> {
    const [row] = await this.db
      .select()
      .from(disputes)
      .where(and(eq(disputes.workspaceId, workspaceId), eq(disputes.id, disputeId)))
      .limit(1);
    return row ?? null;
  }

  async findByPayPalDisputeId(
    workspaceId: string,
    paypalDisputeId: string
  ): Promise<DisputeRow | null> {
    const [row] = await this.db
      .select()
      .from(disputes)
      .where(
        and(eq(disputes.workspaceId, workspaceId), eq(disputes.paypalDisputeId, paypalDisputeId))
      )
      .limit(1);
    return row ?? null;
  }

  async upsertDispute(input: UpsertDisputeInput): Promise<DisputeRow> {
    const existing = await this.findByPayPalDisputeId(input.workspaceId, input.paypalDisputeId);
    if (existing) {
      const [updated] = await this.db
        .update(disputes)
        .set({
          recordOrigin: input.recordOrigin,
          paypalTransactionId: input.paypalTransactionId,
          reason: input.reason,
          rawStatus: input.rawStatus,
          workflowStatus: input.workflowStatus,
          rawLifecycleStage: input.rawLifecycleStage,
          lifecycleStage: input.lifecycleStage,
          channel: input.channel,
          amountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
          buyerDisplayLabel: input.buyerDisplayLabel,
          sellerResponseDueAt: input.sellerResponseDueAt,
          disputeCreatedAt: input.disputeCreatedAt,
          disputeUpdatedAt: input.disputeUpdatedAt,
          outcomeCode: input.outcomeCode,
          links: input.links,
          rawPayload: input.rawPayload,
          lastSyncedAt: input.lastSyncedAt,
          updatedAt: new Date()
        })
        .where(and(eq(disputes.id, existing.id), eq(disputes.workspaceId, input.workspaceId)))
        .returning();
      if (!updated) throw new Error('Failed to update dispute');
      return updated;
    }

    const [created] = await this.db.insert(disputes).values(input).returning();
    if (!created) throw new Error('Failed to insert dispute');
    return created;
  }

  async replaceRequirements(
    workspaceId: string,
    disputeId: string,
    requirements: Array<{
      evidenceType: string;
      source: string;
      isRequired: boolean;
      satisfied: boolean;
      rawRequirement: Record<string, unknown>;
    }>
  ): Promise<EvidenceRequirementRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(evidenceRequirements)
        .where(
          and(
            eq(evidenceRequirements.workspaceId, workspaceId),
            eq(evidenceRequirements.disputeId, disputeId)
          )
        );

      if (requirements.length === 0) return [];

      return tx
        .insert(evidenceRequirements)
        .values(
          requirements.map((req) => ({
            workspaceId,
            disputeId,
            evidenceType: req.evidenceType,
            source: req.source,
            isRequired: req.isRequired,
            satisfied: req.satisfied,
            rawRequirement: req.rawRequirement
          }))
        )
        .returning();
    });
  }

  async listRequirements(workspaceId: string, disputeId: string): Promise<EvidenceRequirementRow[]> {
    return this.db
      .select()
      .from(evidenceRequirements)
      .where(
        and(
          eq(evidenceRequirements.workspaceId, workspaceId),
          eq(evidenceRequirements.disputeId, disputeId)
        )
      );
  }

  async replaceExtractedFactsForAsset(
    workspaceId: string,
    disputeId: string,
    sourceAssetId: string,
    facts: Array<{
      factType: string;
      factText: string;
      locator: SourceLocator;
      confidence: number;
      verificationStatus: string;
      extractionVersion: string;
      isOcrDerived: boolean;
    }>
  ): Promise<ExtractedFactRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(extractedFacts)
        .where(
          and(
            eq(extractedFacts.workspaceId, workspaceId),
            eq(extractedFacts.disputeId, disputeId),
            eq(extractedFacts.sourceAssetId, sourceAssetId)
          )
        );

      if (facts.length === 0) return [];

      return tx
        .insert(extractedFacts)
        .values(
          facts.map((fact) => ({
            workspaceId,
            disputeId,
            sourceAssetId,
            ...fact
          }))
        )
        .returning();
    });
  }

  async listExtractedFacts(workspaceId: string, disputeId: string): Promise<ExtractedFactRow[]> {
    return this.db
      .select()
      .from(extractedFacts)
      .where(
        and(eq(extractedFacts.workspaceId, workspaceId), eq(extractedFacts.disputeId, disputeId))
      )
      .orderBy(asc(extractedFacts.createdAt));
  }

  async replaceTimelineEvents(
    workspaceId: string,
    disputeId: string,
    events: Array<{
      sourceAssetId: string | null;
      eventTimestamp: Date | null;
      timestampPrecision: 'EXACT' | 'DATE_ONLY' | 'UNKNOWN';
      eventType: string;
      title: string;
      description: string;
      locator: SourceLocator | null;
      verificationStatus: string;
    }>
  ): Promise<TimelineEventRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(timelineEvents)
        .where(
          and(
            eq(timelineEvents.workspaceId, workspaceId),
            eq(timelineEvents.disputeId, disputeId)
          )
        );

      if (events.length === 0) return [];

      return tx
        .insert(timelineEvents)
        .values(
          events.map((evt) => ({
            workspaceId,
            disputeId,
            ...evt
          }))
        )
        .returning();
    });
  }

  async listTimelineEvents(workspaceId: string, disputeId: string): Promise<TimelineEventRow[]> {
    return this.db
      .select()
      .from(timelineEvents)
      .where(
        and(eq(timelineEvents.workspaceId, workspaceId), eq(timelineEvents.disputeId, disputeId))
      )
      .orderBy(asc(timelineEvents.eventTimestamp), asc(timelineEvents.createdAt));
  }

  async replaceClaimsWithSources(
    workspaceId: string,
    disputeId: string,
    aiRunId: string | null,
    claims: Array<{
      claimText: string;
      category: string;
      verificationStatus: string;
      mappedEvidenceType: string | null;
      sources: Array<{
        sourceAssetId: string;
        factId?: string | null;
        locator: SourceLocator;
      }>;
    }>
  ): Promise<Array<EvidenceClaimRow & { sources: ClaimSourceRow[] }>> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(evidenceClaims)
        .where(
          and(
            eq(evidenceClaims.workspaceId, workspaceId),
            eq(evidenceClaims.disputeId, disputeId)
          )
        );

      if (claims.length === 0) return [];

      const insertedClaims: Array<EvidenceClaimRow & { sources: ClaimSourceRow[] }> = [];
      for (const claim of claims) {
        const [claimRow] = await tx
          .insert(evidenceClaims)
          .values({
            workspaceId,
            disputeId,
            aiRunId,
            claimText: claim.claimText,
            category: claim.category,
            verificationStatus: claim.verificationStatus,
            mappedEvidenceType: claim.mappedEvidenceType
          })
          .returning();

        if (!claimRow) continue;

        let sourceRows: ClaimSourceRow[] = [];
        if (claim.sources.length > 0) {
          sourceRows = await tx
            .insert(claimSources)
            .values(
              claim.sources.map((src) => ({
                claimId: claimRow.id,
                sourceAssetId: src.sourceAssetId,
                factId: src.factId ?? null,
                locator: src.locator
              }))
            )
            .returning();
        }
        insertedClaims.push({ ...claimRow, sources: sourceRows });
      }

      return insertedClaims;
    });
  }

  async listClaimsWithSources(
    workspaceId: string,
    disputeId: string
  ): Promise<Array<EvidenceClaimRow & { sources: ClaimSourceRow[] }>> {
    const claims = await this.db
      .select()
      .from(evidenceClaims)
      .where(
        and(eq(evidenceClaims.workspaceId, workspaceId), eq(evidenceClaims.disputeId, disputeId))
      )
      .orderBy(asc(evidenceClaims.createdAt));

    if (claims.length === 0) return [];

    const claimIds = claims.map((c) => c.id);
    const sources = await this.db
      .select()
      .from(claimSources)
      .where(inArray(claimSources.claimId, claimIds));

    const sourcesByClaim = new Map<string, ClaimSourceRow[]>();
    for (const source of sources) {
      const existing = sourcesByClaim.get(source.claimId) ?? [];
      existing.push(source);
      sourcesByClaim.set(source.claimId, existing);
    }

    return claims.map((claim) => ({
      ...claim,
      sources: sourcesByClaim.get(claim.id) ?? []
    }));
  }
}
