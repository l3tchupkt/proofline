'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  FileArchive,
  History,
  Send,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  DemoOriginBanner,
  ErrorBanner,
  getDisputeStatusTone,
  LoadingSkeleton,
  MonoId,
  StatusBadge
} from '@proofline/ui';
import { AppShell } from '../../../components/AppShell';
import { EvidenceGrid } from '../../../components/EvidenceGrid';
import { EvidenceInspectorDrawer } from '../../../components/EvidenceInspectorDrawer';
import { EvidenceUploadForm } from '../../../components/EvidenceUploadForm';
import { InvestigationPanel } from '../../../features/disputes/InvestigationPanel';
import { ResponseStudio } from '../../../features/disputes/ResponseStudio';
import { TimelinePanel } from '../../../features/disputes/TimelinePanel';
import type { DisputeDetailResponse } from '../../../features/disputes/types';
import { ApiClientError, apiRequest } from '../../../lib/apiClient';

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const disputeId = params.id;
  const queryClient = useQueryClient();

  const [inspectAssetId, setInspectAssetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ code?: string; message: string } | null>(null);

  const detailQuery = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => apiRequest<DisputeDetailResponse>(`/api/disputes/${disputeId}`),
    enabled: Boolean(disputeId)
  });

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ['dispute', disputeId] });
    await queryClient.invalidateQueries({ queryKey: ['disputes'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  async function handleDeleteEvidence(assetId: string) {
    setDeleteError(null);
    try {
      await apiRequest(`/api/evidence/${assetId}`, { method: 'DELETE' });
      await refreshAll();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError({ code: err.code, message: err.message });
      } else {
        setDeleteError({ message: err instanceof Error ? err.message : 'Unable to delete file.' });
      }
    }
  }

  const detail = detailQuery.data;
  const inspectedAsset = detail?.assets.find((a) => a.id === inspectAssetId) ?? null;
  const latestRun = detail?.aiRuns.find((r) => r.status === 'COMPLETED');

  return (
    <AppShell
      title={detail ? `Dispute ${detail.dispute.paypalDisputeId}` : 'Dispute Case Dossier'}
      subtitle={
        detail
          ? `${detail.dispute.reason} · Disputed amount ${detail.dispute.formattedAmount}`
          : 'Inspect PayPal lifecycle, preserved evidence provenance, timeline, and merchant response.'
      }
      actions={
        <Link
          href="/disputes"
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#C5C0B4] bg-white px-3 py-1.5 text-xs font-medium text-[#14181F] hover:bg-[#F7F6F2]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Disputes</span>
        </Link>
      }
    >
      {detailQuery.isLoading ? <LoadingSkeleton rows={7} /> : null}

      {detailQuery.isError ? (
        <ErrorBanner
          title="Unable to load dispute dossier"
          message={
            detailQuery.error instanceof Error ? detailQuery.error.message : 'Case load error'
          }
        />
      ) : null}

      {detail ? (
        <div className="space-y-6">
          {detail.dispute.recordOrigin === 'DEMO_FIXTURE' ? <DemoOriginBanner /> : null}

          {/* Dossier Summary Strip */}
          <section className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge
                label={detail.dispute.rawStatus.replace(/_/g, ' ')}
                tone={getDisputeStatusTone(detail.dispute.workflowStatus)}
              />
              <StatusBadge
                label={`Stage: ${detail.dispute.rawLifecycleStage ?? detail.dispute.lifecycleStage}`}
                tone="navy"
              />
              <span className="font-mono text-sm font-semibold tabular-nums text-[#14181F] ml-auto">
                {detail.dispute.formattedAmount}
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-[#DFDCD4] pt-4 text-xs">
              <div>
                <dt className="text-[#6B7280] font-medium">PayPal Transaction Ref</dt>
                <dd className="mt-1">
                  <MonoId value={detail.dispute.paypalTransactionId ?? 'Not provided'} />
                </dd>
              </div>
              <div>
                <dt className="text-[#6B7280] font-medium">Buyer Reference</dt>
                <dd className="mt-1 text-[#14181F] font-medium">
                  {detail.dispute.buyerDisplayLabel ?? 'Not disclosed'}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B7280] font-medium">Seller Response Due (UTC)</dt>
                <dd className="mt-1 font-mono text-[#14181F] tabular-nums">
                  {detail.dispute.sellerResponseDueAt
                    ? detail.dispute.sellerResponseDueAt.slice(0, 19).replace('T', ' ')
                    : 'No deadline recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B7280] font-medium">PayPal Resolution Outcome</dt>
                <dd className="mt-1 font-mono text-[#14181F]">
                  {detail.dispute.outcomeCode ?? 'PENDING / UNDER REVIEW'}
                </dd>
              </div>
            </dl>

            {/* Requested Evidence Types & HATEOAS Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#DFDCD4] pt-4 text-xs">
              <div>
                <div className="font-semibold text-[#14181F] mb-1.5">
                  Requested / Recommended Evidence Types
                </div>
                {detail.requirements.length === 0 ? (
                  <p className="text-[#6B7280]">No explicit PayPal requirement records returned.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.requirements.map((req) => (
                      <span
                        key={req.id}
                        className="inline-flex items-center gap-1 rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] px-2 py-1 font-mono text-[11px]"
                      >
                        <ShieldCheck className="h-3 w-3 text-[#1B3B6F]" aria-hidden="true" />
                        <span>{req.evidenceType}</span>
                        {req.isRequired ? (
                          <span className="text-[#9A5B06] font-semibold">*</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="font-semibold text-[#14181F] mb-1.5">
                  PayPal HATEOAS Available Actions
                </div>
                {detail.dispute.links.length === 0 ? (
                  <p className="text-[#6B7280]">
                    {detail.dispute.recordOrigin === 'DEMO_FIXTURE'
                      ? 'Demo fixture (outbound PayPal actions disabled)'
                      : 'No HATEOAS links reported'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.dispute.links.map((link, i) => (
                      <MonoId key={`${link.rel}-${i}`} value={`${link.method ?? 'GET'} ${link.rel}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Main Casework Tabs */}
          <Tabs.Root defaultValue="investigation" className="space-y-4">
            <Tabs.List
              aria-label="Dispute investigation sections"
              className="flex flex-wrap gap-1 border-b border-[#DFDCD4] pb-2"
            >
              {[
                { value: 'investigation', label: 'Investigation & Provenance', icon: Sparkles },
                { value: 'timeline', label: `Timeline (${detail.timeline.length})`, icon: CalendarClock },
                { value: 'evidence', label: `Evidence (${detail.assets.length})`, icon: FileArchive },
                { value: 'response', label: `Response Studio (${detail.submissions.length})`, icon: Send },
                { value: 'audit', label: `Case Audit (${detail.auditEvents.length})`, icon: History }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <Tabs.Trigger
                    key={tab.value}
                    value={tab.value}
                    className="inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-xs font-medium text-[#4A5568] hover:text-[#14181F] data-[state=active]:bg-[#1B3B6F] data-[state=active]:text-white focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </Tabs.Trigger>
                );
              })}
            </Tabs.List>

            <Tabs.Content value="investigation">
              <InvestigationPanel
                disputeId={detail.dispute.id}
                assets={detail.assets}
                claims={detail.claims}
                facts={detail.facts}
                aiRuns={detail.aiRuns}
                onInspectAsset={(id) => setInspectAssetId(id)}
                onCompleted={() => void refreshAll()}
              />
            </Tabs.Content>

            <Tabs.Content value="timeline">
              <TimelinePanel
                timeline={detail.timeline}
                assets={detail.assets}
                onInspectAsset={(id) => setInspectAssetId(id)}
              />
            </Tabs.Content>

            <Tabs.Content value="evidence" className="space-y-4">
              <EvidenceUploadForm
                disputeId={detail.dispute.id}
                recordOrigin={detail.dispute.recordOrigin}
                onUploaded={() => void refreshAll()}
              />
              {deleteError ? (
                <ErrorBanner
                  title="Evidence deletion blocked"
                  code={deleteError.code}
                  message={deleteError.message}
                />
              ) : null}
              <EvidenceGrid
                rows={detail.assets}
                onInspect={(asset) => setInspectAssetId(asset.id)}
                onDelete={(asset) => void handleDeleteEvidence(asset.id)}
              />
            </Tabs.Content>

            <Tabs.Content value="response">
              <ResponseStudio
                disputeId={detail.dispute.id}
                recordOrigin={detail.dispute.recordOrigin}
                suggestedEvidenceTypes={detail.requirements.map((r) => r.evidenceType)}
                suggestedDraftNotes={latestRun?.structuredOutput?.draftNotes}
                assets={detail.assets}
                submissions={detail.submissions}
                onChanged={() => void refreshAll()}
              />
            </Tabs.Content>

            <Tabs.Content value="audit">
              <div className="rounded-[6px] border border-[#DFDCD4] bg-white overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#DFDCD4] bg-[#F0EEE8] text-[#4A5568]">
                      <th className="px-3.5 py-2.5 font-semibold">Timestamp (UTC)</th>
                      <th className="px-3.5 py-2.5 font-semibold">Actor</th>
                      <th className="px-3.5 py-2.5 font-semibold">Action</th>
                      <th className="px-3.5 py-2.5 font-semibold">Result</th>
                      <th className="px-3.5 py-2.5 font-semibold">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFDCD4]">
                    {detail.auditEvents.map((evt) => (
                      <tr key={evt.id}>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] tabular-nums">
                          {evt.occurredAt.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px]">{evt.actorType}</td>
                        <td className="px-3.5 py-2.5">
                          <MonoId value={evt.action} />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <StatusBadge
                            label={evt.result}
                            tone={evt.result === 'SUCCESS' ? 'verified' : 'danger'}
                          />
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#4A5568]">
                          {JSON.stringify(evt.metadata)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      ) : null}

      <EvidenceInspectorDrawer
        asset={inspectedAsset}
        open={Boolean(inspectedAsset)}
        onOpenChange={(open) => {
          if (!open) setInspectAssetId(null);
        }}
      />
    </AppShell>
  );
}

