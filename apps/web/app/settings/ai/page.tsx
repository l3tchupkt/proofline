'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bot, LockKeyhole, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { ErrorBanner, LoadingSkeleton, MonoId, StatusBadge } from '@proofline/ui';
import { AppShell } from '../../../components/AppShell';
import { apiRequest } from '../../../lib/apiClient';
import type { SettingsStatusResponse } from '../page';

const ALLOWED_AI_TOOLS = [
  {
    name: 'get_dispute_context',
    scope: 'Read normalized PayPal dispute metadata, lifecycle stage, deadline & amount'
  },
  {
    name: 'get_evidence_assets',
    scope: 'Read preserved attachment hashes & untrusted extracted text inside <untrusted_evidence>'
  },
  {
    name: 'extract_evidence_facts',
    scope: 'Read structured facts with SourceLocator citations & review tags'
  },
  {
    name: 'build_delivery_timeline',
    scope: 'Reconstruct chronological delivery timeline distinguishing embedded dates'
  },
  {
    name: 'get_paypal_evidence_requirements',
    scope: 'Read PayPal requested evidence types & satisfaction flags'
  },
  {
    name: 'analyze_evidence_gaps',
    scope: 'Evaluate PayPal file format/size constraints & unsatisfied evidence gaps'
  },
  {
    name: 'draft_dispute_response',
    scope: 'Validate authorization for factual response notes (never approves or submits)'
  }
];

export default function AiSettingsPage() {
  const statusQuery = useQuery({
    queryKey: ['settings', 'status'],
    queryFn: () => apiRequest<SettingsStatusResponse>('/api/settings/status')
  });

  const data = statusQuery.data;

  return (
    <AppShell
      title="Anthropic AI & Provenance Guardrails"
      subtitle="Model configuration, strict tool-calling isolation, and zero-execution capability boundaries."
      actions={
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#C5C0B4] bg-white px-3 py-1.5 text-xs font-medium text-[#14181F] hover:bg-[#F7F6F2]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Settings</span>
        </Link>
      }
    >
      <div className="space-y-5 max-w-4xl">
        {statusQuery.isLoading ? <LoadingSkeleton rows={4} /> : null}
        {statusQuery.isError ? (
          <ErrorBanner
            title="Unable to check AI settings"
            message={statusQuery.error instanceof Error ? statusQuery.error.message : 'API error'}
          />
        ) : null}

        {data ? (
          <>
            <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#14181F]">
                  <Bot className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                  <span>Anthropic SDK Configuration</span>
                </div>
                <StatusBadge
                  label={data.readiness.anthropicConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                  tone={data.readiness.anthropicConfigured ? 'verified' : 'warning'}
                />
              </div>

              <p className="text-xs text-[#4A5568]">
                Active Model ID (<MonoId value="ANTHROPIC_MODEL" />):{' '}
                {data.anthropicModel ? <MonoId value={data.anthropicModel} /> : 'Unset'}
              </p>

              {!data.readiness.anthropicConfigured ? (
                <div className="rounded-[4px] border border-[#F3D7A2] bg-[#FEF5E4] p-3.5 text-xs text-[#9A5B06]">
                  Configure <MonoId value="ANTHROPIC_API_KEY" /> and <MonoId value="ANTHROPIC_MODEL" />{' '}
                  in `.env` to execute live Anthropic investigation runs. PROOFLINE never uses an
                  unverified hardcoded model string or fabricates AI results when unset.
                </div>
              ) : null}
            </div>

            <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#14181F]">
                <LockKeyhole className="h-4 w-4 text-[#156F48]" aria-hidden="true" />
                <span>AI Actor Permission Boundary (AI_ASSISTANT)</span>
              </div>
              <p className="text-xs text-[#4A5568]">
                All evidence excerpts passed to Anthropic are wrapped inside{' '}
                <MonoId value="<untrusted_evidence>" /> delimiters. The authorization engine
                explicitly denies <MonoId value="AI_ASSISTANT" /> from approving drafts, calling{' '}
                <MonoId value="provide-evidence" />, issuing refunds, accepting claims, or reading
                other workspaces.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#DFDCD4] text-[#6B7280]">
                      <th className="py-2 pr-4 font-medium">Registered Tool</th>
                      <th className="py-2 font-medium">Permitted Read/Prep Scope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFDCD4]">
                    {ALLOWED_AI_TOOLS.map((tool) => (
                      <tr key={tool.name}>
                        <td className="py-2 pr-4">
                          <MonoId value={tool.name} />
                        </td>
                        <td className="py-2 text-[#4A5568]">{tool.scope}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#156F48] pt-1">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Every claim without a valid workspace <MonoId value="sourceAssetId" /> is stripped
                  or downgraded to unsupported by <MonoId value="groundInvestigationOutput()" />.
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
