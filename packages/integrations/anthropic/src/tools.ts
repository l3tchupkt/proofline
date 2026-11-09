import { z } from 'zod';
import { assertAuthorized, type ActorContext } from '@proofline/authorization';
import { InvestigationOutputSchema, type InvestigationOutput } from '@proofline/contracts';
import type { EvidenceRequirement, ExtractedFact, SourceLocator } from '@proofline/domain';
import { wrapUntrustedEvidence } from '@proofline/evidence';

export interface ToolExecutionContext {
  actor: ActorContext;
  workspaceId: string;
  dispute: {
    id: string;
    paypalDisputeId: string;
    paypalTransactionId: string | null;
    reason: string;
    rawStatus: string;
    rawLifecycleStage: string | null;
    amountMinor: number;
    currencyCode: string;
    formattedAmount: string;
    sellerResponseDueAt: string | null;
    buyerDisplayLabel: string | null;
  };
  assets: Array<{
    id: string;
    originalFilename: string;
    extension: string;
    mimeType: string;
    byteSize: number;
    sha256Hash: string;
    status: string;
    extractedText: string | null;
    extractedMetadata: Record<string, unknown>;
    promptInjectionSignals: string[];
    documentCreatedAt: string | null;
    receivedAt: string;
  }>;
  extractedFacts: Array<
    Pick<
      ExtractedFact,
      | 'id'
      | 'sourceAssetId'
      | 'factType'
      | 'factText'
      | 'locator'
      | 'confidence'
      | 'verificationStatus'
      | 'isOcrDerived'
    >
  >;
  requirements: Array<
    Pick<EvidenceRequirement, 'evidenceType' | 'source' | 'isRequired' | 'satisfied'>
  >;
  onAuditToolCall?: (entry: {
    toolName: string;
    input: Record<string, unknown>;
    resultSummary: string;
  }) => Promise<void>;
}

const DisputeIdInputSchema = z.object({
  disputeId: z.string().min(1)
});

const ExtractFactsInputSchema = z.object({
  disputeId: z.string().min(1),
  assetIds: z.array(z.string().uuid()).optional()
});

const DraftResponseInputSchema = z.object({
  disputeId: z.string().min(1),
  evidenceType: z.string().min(1),
  supportedClaims: z.array(z.string()).min(1)
});

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (rawInput: unknown) => Promise<Record<string, unknown>>;
}

export function buildInvestigationTools(ctx: ToolExecutionContext): AnthropicToolDefinition[] {
  const auditAndCheck = async (
    action: 'dispute:read' | 'evidence:read' | 'investigation:run' | 'submission:draft',
    toolName: string,
    input: Record<string, unknown>,
    resultSummary: string
  ) => {
    assertAuthorized(ctx.actor, action, ctx.workspaceId);
    if (ctx.onAuditToolCall) {
      await ctx.onAuditToolCall({ toolName, input, resultSummary });
    }
  };

  return [
    {
      name: 'get_dispute_context',
      description:
        'Returns verified PayPal dispute metadata, transaction identifier, reason code, lifecycle stage, and seller response deadline.',
      inputSchema: z.toJSONSchema(DisputeIdInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = DisputeIdInputSchema.parse(rawInput);
        await auditAndCheck('dispute:read', 'get_dispute_context', input, 'Loaded dispute context');
        return { dispute: ctx.dispute };
      }
    },
    {
      name: 'get_evidence_assets',
      description:
        'Lists uploaded evidence assets for the dispute with SHA-256 checksums, prompt-injection alerts, and untrusted extracted text isolated inside <untrusted_evidence> tags.',
      inputSchema: z.toJSONSchema(DisputeIdInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = DisputeIdInputSchema.parse(rawInput);
        await auditAndCheck(
          'evidence:read',
          'get_evidence_assets',
          input,
          `Loaded ${ctx.assets.length} assets`
        );
        return {
          assets: ctx.assets.map((asset) => ({
            id: asset.id,
            filename: asset.originalFilename,
            extension: asset.extension,
            sha256Hash: asset.sha256Hash,
            documentCreatedAt: asset.documentCreatedAt,
            receivedAt: asset.receivedAt,
            promptInjectionSignals: asset.promptInjectionSignals,
            metadata: asset.extractedMetadata,
            wrappedContent: wrapUntrustedEvidence({
              assetId: asset.id,
              filename: asset.originalFilename,
              sha256Hash: asset.sha256Hash,
              extractedText: asset.extractedText ?? '[No text extracted]'
            })
          }))
        };
      }
    },
    {
      name: 'extract_evidence_facts',
      description:
        'Retrieves deterministically extracted facts with sourceAssetId and exact SourceLocator offsets for the dispute.',
      inputSchema: z.toJSONSchema(ExtractFactsInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = ExtractFactsInputSchema.parse(rawInput);
        await auditAndCheck(
          'evidence:read',
          'extract_evidence_facts',
          input,
          `Loaded ${ctx.extractedFacts.length} facts`
        );
        const filtered = input.assetIds?.length
          ? ctx.extractedFacts.filter((f) => input.assetIds?.includes(f.sourceAssetId))
          : ctx.extractedFacts;
        return { facts: filtered };
      }
    },
    {
      name: 'build_delivery_timeline',
      description:
        'Constructs chronological delivery and communication milestones from extracted facts and asset document timestamps.',
      inputSchema: z.toJSONSchema(DisputeIdInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = DisputeIdInputSchema.parse(rawInput);
        await auditAndCheck(
          'investigation:run',
          'build_delivery_timeline',
          input,
          'Constructed chronological asset timeline'
        );
        const events = ctx.assets
          .filter((a) => a.documentCreatedAt !== null)
          .map((a) => ({
            sourceAssetId: a.id,
            filename: a.originalFilename,
            timestamp: a.documentCreatedAt,
            note: 'Document-internal timestamp (not application receipt time)'
          }))
          .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
        return { timelineMilestones: events };
      }
    },
    {
      name: 'get_paypal_evidence_requirements',
      description:
        'Returns PayPal requested evidence types and requirement satisfaction status retrieved from PayPal dispute metadata.',
      inputSchema: z.toJSONSchema(DisputeIdInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = DisputeIdInputSchema.parse(rawInput);
        await auditAndCheck(
          'dispute:read',
          'get_paypal_evidence_requirements',
          input,
          `Loaded ${ctx.requirements.length} PayPal requirements`
        );
        return { requirements: ctx.requirements };
      }
    },
    {
      name: 'analyze_evidence_gaps',
      description:
        'Compares PayPal evidence requirements against uploaded assets and attachment format limits (.pdf, .jpg, .jpeg, .png, .gif under 10 MB).',
      inputSchema: z.toJSONSchema(DisputeIdInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = DisputeIdInputSchema.parse(rawInput);
        await auditAndCheck(
          'investigation:run',
          'analyze_evidence_gaps',
          input,
          'Evaluated attachment compatibility and evidence gaps'
        );
        const paypalAcceptable = ctx.assets.filter((a) =>
          ['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(a.extension.toLowerCase())
        );
        const nonUploadableDirectly = ctx.assets.filter(
          (a) => !['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(a.extension.toLowerCase())
        );
        return {
          paypalCompatibleAssetIds: paypalAcceptable.map((a) => a.id),
          requiresPdfBundleOrConversion: nonUploadableDirectly.map((a) => ({
            id: a.id,
            filename: a.originalFilename,
            extension: a.extension
          })),
          unsatisfiedRequirements: ctx.requirements.filter((r) => !r.satisfied)
        };
      }
    },
    {
      name: 'draft_dispute_response',
      description:
        'Validates authorization to prepare a factual response draft referencing verified claims. Does NOT submit or approve anything.',
      inputSchema: z.toJSONSchema(DraftResponseInputSchema) as Record<string, unknown>,
      execute: async (rawInput) => {
        const input = DraftResponseInputSchema.parse(rawInput);
        await auditAndCheck(
          'submission:draft',
          'draft_dispute_response',
          input,
          `Authorized draft preparation for ${input.evidenceType}`
        );
        return {
          authorizedForDraftOnly: true,
          evidenceType: input.evidenceType,
          claimCount: input.supportedClaims.length,
          note: 'Merchant review and explicit approval are strictly required before submission.'
        };
      }
    }
  ];
}

/**
 * Post-validates LLM output against real dispute assets so hallucinated or uncited claims
 * cannot pass as supported facts.
 */
export function groundInvestigationOutput(
  rawOutput: InvestigationOutput,
  validAssets: Array<{ id: string; extension: string }>
): InvestigationOutput {
  const assetMap = new Map(validAssets.map((a) => [a.id, a]));

  const groundedFacts = rawOutput.facts
    .filter((fact) => assetMap.has(fact.sourceAssetId))
    .map((fact) => {
      const asset = assetMap.get(fact.sourceAssetId)!;
      const isImage = ['png', 'jpg', 'jpeg'].includes(asset.extension.toLowerCase());
      return {
        ...fact,
        isOcrDerived: fact.isOcrDerived || isImage,
        verificationStatus:
          fact.isOcrDerived || isImage ? ('REQUIRES_REVIEW' as const) : fact.verificationStatus
      };
    });

  const supportedClaims: InvestigationOutput['supportedClaims'] = [];
  const unsupportedClaims = [...rawOutput.unsupportedClaims];

  for (const claim of rawOutput.supportedClaims) {
    const validSources = claim.sources.filter((s) => assetMap.has(s.sourceAssetId));
    if (validSources.length === 0) {
      unsupportedClaims.push({
        claimText: claim.claimText,
        reason: 'Downgraded: cited sourceAssetId does not belong to this dispute evidence library.'
      });
      continue;
    }
    supportedClaims.push({
      ...claim,
      sources: validSources as [{ sourceAssetId: string; locator: SourceLocator }, ...Array<{ sourceAssetId: string; locator: SourceLocator }>]
    });
  }

  return InvestigationOutputSchema.parse({
    ...rawOutput,
    facts: groundedFacts,
    supportedClaims,
    unsupportedClaims
  });
}

