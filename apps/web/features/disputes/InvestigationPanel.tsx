'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Bot, CheckCircle2, FileWarning, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  EmptyState,
  ErrorBanner,
  getVerificationTone,
  MonoId,
  ProvenancePill,
  StatusBadge
} from '@proofline/ui';
import { ApiClientError, apiRequest } from '../../lib/apiClient';
import type { EvidenceGridRow } from '../../components/EvidenceGrid';
import type { AiRunDto, EvidenceClaimDto, ExtractedFactDto } from './types';

export function InvestigationPanel({
  disputeId,
  assets,
  claims,
  facts,
  aiRuns,
  onInspectAsset,
  onCompleted
}: {
  disputeId: string;
  assets: EvidenceGridRow[];
  claims: EvidenceClaimDto[];
  facts: ExtractedFactDto[];
  aiRuns: AiRunDto[];
  onInspectAsset: (assetId: string) => void;
  onCompleted: () => void;
}) {
  const [aiError, setAiError] = useState<{ code?: string; message: string } | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const latestCompletedRun = aiRuns.find((r) => r.status === 'COMPLETED') ?? null;

  const supportedClaims = claims.filter((c) => c.sources.length > 0 && c.verificationStatus !== 'UNSUPPORTED');
  const unsupportedClaims = claims.filter((c) => c.sources.length === 0 || c.verificationStatus === 'UNSUPPORTED');

  const investigateMutation = useMutation({
    mutationFn: () =>
      apiRequest<{
        runId: string;
        modelId: string;
        claims: EvidenceClaimDto[];
      }>(`/api/disputes/${disputeId}/investigate`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
    onMutate: () => {
      setAiError(null);
      setAiMessage(null);
    },
    onSuccess: (res) => {
      setAiMessage(
        `Investigation complete with ${res.modelId}. Persisted ${res.claims.length} verified/gap claims.`
      );
      onCompleted();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setAiError({ code: err.code, message: err.message });
      } else {
        setAiError({ message: err instanceof Error ? err.message : 'Investigation failed.' });
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-[6px] border border-[#DFDCD4] bg-white p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[#14181F]">
              Provenance-Grounded Investigation
            </h2>
          </div>
          <p className="text-xs text-[#4A5568]">
            Runs Anthropic tool calling inside strict read-only workspace boundaries. Unsupported
            assertions without a preserved <MonoId value="sourceAssetId" /> are automatically excluded.
          </p>
        </div>

        <button
          type="button"
          onClick={() => investigateMutation.mutate()}
          disabled={investigateMutation.isPending}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#142C54] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{investigateMutation.isPending ? 'Investigating…' : 'Run AI Investigation'}</span>
        </button>
      </div>

      {aiMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-[4px] border border-[#BBE2CC] bg-[#EAF6EF] px-4 py-2.5 text-xs text-[#156F48]"
        >
          {aiMessage}
        </div>
      ) : null}

      {aiError ? (
        <ErrorBanner
          title="Anthropic investigation unavailable"
          code={aiError.code}
          message={aiError.message}
          action={
            <Link
              href="/settings/ai"
              className="inline-flex items-center rounded-[4px] border border-[#A82424] bg-white px-3 py-1.5 text-xs font-medium text-[#A82424] hover:bg-[#FDECEC]"
            >
              View AI Settings
            </Link>
          }
        />
      ) : null}

      {latestCompletedRun?.structuredOutput?.summary ? (
        <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4A5568]">
              Latest AI Assessment Summary
            </h3>
            <span className="font-mono text-[11px] text-[#6B7280]">
              Model: {latestCompletedRun.modelId}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-[#14181F]">
            {latestCompletedRun.structuredOutput.summary}
          </p>
        </div>
      ) : null}

      {/* Supported vs Unsupported Claims */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#14181F] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#156F48]" aria-hidden="true" />
              <span>Evidence-Backed Claims ({supportedClaims.length})</span>
            </h3>
          </div>

          {supportedClaims.length === 0 ? (
            <EmptyState
              title="No grounded claims recorded yet"
              description="Upload supporting evidence files and run AI Investigation (or open the Guided Demo) to inspect source-linked claims."
            />
          ) : (
            <div className="space-y-3">
              {supportedClaims.map((claim) => (
                <article
                  key={claim.id}
                  className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={claim.verificationStatus}
                      tone={getVerificationTone(claim.verificationStatus)}
                    />
                    {claim.mappedEvidenceType ? (
                      <MonoId value={claim.mappedEvidenceType} />
                    ) : null}
                    <span className="ml-auto font-mono text-[11px] text-[#6B7280]">
                      {claim.category}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[#14181F]">{claim.claimText}</p>
                  <div className="space-y-1.5 pt-1">
                    {claim.sources.map((src) => {
                      const asset = assetById.get(src.sourceAssetId);
                      return (
                        <ProvenancePill
                          key={src.id}
                          filename={asset?.originalFilename ?? src.sourceAssetId}
                          sha256Hash={asset?.sha256Hash}
                          locator={src.locator}
                          verificationStatus={claim.verificationStatus}
                          onInspect={() => onInspectAsset(src.sourceAssetId)}
                        />
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 space-y-4">
          <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#14181F] flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-[#9A5B06]" aria-hidden="true" />
              <span>Evidence Gaps &amp; Unsupported Claims ({unsupportedClaims.length})</span>
            </h3>
            {unsupportedClaims.length === 0 ? (
              <p className="text-xs text-[#6B7280]">No evidence gaps flagged in this dossier.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {unsupportedClaims.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-[4px] border border-[#F3D7A2] bg-[#FEF5E4] p-3 text-[#9A5B06]"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wider mb-1">
                      {item.verificationStatus} · {item.category}
                    </div>
                    <p className="leading-relaxed text-[#14181F]">{item.claimText}</p>
                  </li>
                ))}
              </ul>
            )}

            {latestCompletedRun?.structuredOutput?.missingEvidence?.length ? (
              <div className="pt-2 border-t border-[#DFDCD4] space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5568]">
                  Missing Evidence Requests
                </div>
                {latestCompletedRun.structuredOutput.missingEvidence.map((gap, idx) => (
                  <div
                    key={`${gap.evidenceType}-${idx}`}
                    className="rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <MonoId value={gap.evidenceType} />
                      <StatusBadge
                        label={gap.priority}
                        tone={gap.priority === 'REQUIRED' ? 'warning' : 'neutral'}
                      />
                    </div>
                    <p className="mt-1 text-[#4A5568]">{gap.description}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {latestCompletedRun?.structuredOutput?.contradictions?.length ? (
            <div className="rounded-[6px] border border-[#F5C2C2] bg-[#FDECEC] p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A82424] flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Detected Contradictions</span>
              </h3>
              <ul className="space-y-2 text-xs text-[#7F1D1D]">
                {latestCompletedRun.structuredOutput.contradictions.map((c, idx) => (
                  <li key={idx} className="rounded border border-[#F5C2C2] bg-white/80 p-2.5">
                    <span className="font-mono font-semibold mr-1.5">[{c.severity}]</span>
                    {c.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {/* Deterministic Extracted Facts */}
      <section className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#14181F]">
            Deterministic Extracted Facts ({facts.length})
          </h3>
          <span className="text-[11px] text-[#6B7280]">
            Image/OCR facts remain tagged REQUIRES_REVIEW until merchant inspection
          </span>
        </div>

        {facts.length === 0 ? (
          <p className="text-xs text-[#6B7280] py-3">
            Upload evidence files to extract verifiable facts and locators automatically.
          </p>
        ) : (
          <div className="space-y-2">
            {facts.map((fact) => {
              const asset = assetById.get(fact.sourceAssetId);
              return (
                <div
                  key={fact.id}
                  className="rounded-[4px] border border-[#DFDCD4] bg-[#FDFCFA] p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge
                      label={fact.verificationStatus.replace(/_/g, ' ')}
                      tone={getVerificationTone(fact.verificationStatus)}
                    />
                    <MonoId value={fact.factType} />
                    {fact.isOcrDerived ? (
                      <span className="rounded bg-[#FEF5E4] border border-[#F3D7A2] px-1.5 py-0.5 font-mono text-[10px] text-[#9A5B06]">
                        OCR DERIVED
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[11px] text-[#6B7280]">
                      conf {(fact.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-[#14181F]">{fact.factText}</p>
                  <ProvenancePill
                    filename={asset?.originalFilename ?? fact.sourceAssetId}
                    sha256Hash={asset?.sha256Hash}
                    locator={fact.locator}
                    verificationStatus={fact.verificationStatus}
                    onInspect={() => onInspectAsset(fact.sourceAssetId)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

