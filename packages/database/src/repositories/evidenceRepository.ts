import { and, desc, eq, ilike, inArray } from 'drizzle-orm';
import type { EvidenceStatus, RecordOrigin } from '@proofline/domain';
import type { ProoflineDatabase } from '../client.js';
import { evidenceAssets, submissionDocuments } from '../schema/index.js';

export type EvidenceAssetRow = typeof evidenceAssets.$inferSelect;

export class EvidenceRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async createAsset(input: {
    id?: string;
    workspaceId: string;
    disputeId: string | null;
    recordOrigin: RecordOrigin;
    uploadedByUserId: string;
    originalFilename: string;
    extension: string;
    mimeType: string;
    byteSize: number;
    sha256Hash: string;
    storageDriver: 'local' | 's3';
    storageKey: string;
    status: EvidenceStatus;
    parserVersion?: string | null;
    extractedText?: string | null;
    extractedMetadata?: Record<string, unknown>;
    promptInjectionSignals?: string[];
    documentCreatedAt?: Date | null;
    receivedAt?: Date;
  }): Promise<EvidenceAssetRow> {
    const [row] = await this.db
      .insert(evidenceAssets)
      .values({
        ...input,
        parserVersion: input.parserVersion ?? null,
        extractedText: input.extractedText ?? null,
        extractedMetadata: input.extractedMetadata ?? {},
        promptInjectionSignals: input.promptInjectionSignals ?? [],
        documentCreatedAt: input.documentCreatedAt ?? null,
        receivedAt: input.receivedAt ?? new Date()
      })
      .returning();
    if (!row) throw new Error('Failed to create evidence asset');
    return row;
  }

  async findById(workspaceId: string, assetId: string): Promise<EvidenceAssetRow | null> {
    const [row] = await this.db
      .select()
      .from(evidenceAssets)
      .where(and(eq(evidenceAssets.workspaceId, workspaceId), eq(evidenceAssets.id, assetId)))
      .limit(1);
    return row ?? null;
  }

  async findManyByIds(workspaceId: string, assetIds: string[]): Promise<EvidenceAssetRow[]> {
    if (assetIds.length === 0) return [];
    return this.db
      .select()
      .from(evidenceAssets)
      .where(
        and(eq(evidenceAssets.workspaceId, workspaceId), inArray(evidenceAssets.id, assetIds))
      );
  }

  async listByWorkspace(
    workspaceId: string,
    filters: {
      disputeId?: string;
      origin?: RecordOrigin;
      search?: string;
    } = {}
  ): Promise<EvidenceAssetRow[]> {
    const conditions = [eq(evidenceAssets.workspaceId, workspaceId)];
    if (filters.disputeId) {
      conditions.push(eq(evidenceAssets.disputeId, filters.disputeId));
    }
    if (filters.origin) {
      conditions.push(eq(evidenceAssets.recordOrigin, filters.origin));
    }
    if (filters.search && filters.search.trim().length > 0) {
      conditions.push(ilike(evidenceAssets.originalFilename, `%${filters.search.trim()}%`));
    }

    return this.db
      .select()
      .from(evidenceAssets)
      .where(and(...conditions))
      .orderBy(desc(evidenceAssets.receivedAt));
  }

  async updateExtractionResult(
    workspaceId: string,
    assetId: string,
    update: {
      status: EvidenceStatus;
      parserVersion: string;
      extractedText: string | null;
      extractedMetadata: Record<string, unknown>;
      promptInjectionSignals: string[];
      documentCreatedAt: Date | null;
    }
  ): Promise<EvidenceAssetRow | null> {
    const [row] = await this.db
      .update(evidenceAssets)
      .set({
        ...update,
        updatedAt: new Date()
      })
      .where(and(eq(evidenceAssets.workspaceId, workspaceId), eq(evidenceAssets.id, assetId)))
      .returning();
    return row ?? null;
  }

  async isAssetReferencedInSubmissions(assetId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: submissionDocuments.id })
      .from(submissionDocuments)
      .where(eq(submissionDocuments.evidenceAssetId, assetId))
      .limit(1);
    return Boolean(row);
  }

  async deleteAsset(workspaceId: string, assetId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(evidenceAssets)
      .where(and(eq(evidenceAssets.workspaceId, workspaceId), eq(evidenceAssets.id, assetId)))
      .returning({ id: evidenceAssets.id });
    return deleted.length > 0;
  }
}

