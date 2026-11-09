'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, FileCheck2, Scale } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  DemoOriginBanner,
  EmptyState,
  ErrorBanner,
  getDisputeStatusTone,
  getSubmissionStatusTone,
  LoadingSkeleton,
  MonoId,
  StatusBadge
} from '@proofline/ui';
import { AppShell } from '../../components/AppShell';
import { apiRequest } from '../../lib/apiClient';

interface DashboardOverviewResponse {
  originFilter: 'ALL' | 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
  metrics: {
    openDisputesCount: number;
    awaitingSellerCount: number;
    urgentDeadlinesCount: number;
    evidenceAssetsCount: number;
    needsReviewCount: number;
  };
  evidenceStatusBreakdown: Record<string, number>;
  upcomingDeadlines: Array<{
    id: string;
    paypalDisputeId: string;
    recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
    reason: string;
    workflowStatus: string;
    formattedAmount: string;
    sellerResponseDueAt: string | null;
  }>;
  recentSubmissions: Array<{
    id: string;
    disputeId: string;
    evidenceType: string;
    status: string;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    actorType: string;
    result: string;
    occurredAt: string;
  }>;
}

export default function DashboardPage() {
  const [origin, setOrigin] = useState<'PAYPAL_SANDBOX' | 'DEMO_FIXTURE'>('PAYPAL_SANDBOX');

  const overviewQuery = useQuery({
    queryKey: ['dashboard', 'overview', origin],
    queryFn: () =>
      apiRequest<DashboardOverviewResponse>(`/api/dashboard/overview?origin=${origin}`)
  });

  const data = overviewQuery.data;
  const chartLabelMap: Record<string, string> = {
    UPLOADED: 'Uploaded',
    PROCESSING: 'Processing',
    PROCESSED: 'Processed',
    NEEDS_REVIEW: 'Review',
    FAILED: 'Failed'
  };
  const chartData = data
    ? Object.entries(data.evidenceStatusBreakdown).map(([status, count]) => ({
        status: chartLabelMap[status] ?? status.replace(/_/g, ' '),
        count
      }))
    : [];

  return (
    <AppShell
      title="Operations Dashboard"
      subtitle="Monitor PayPal dispute deadlines, evidence processing status, pending approvals, and recent audit activity."
      actions={
        <div className="inline-flex rounded-[4px] border border-[#C5C0B4] bg-white p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setOrigin('PAYPAL_SANDBOX')}
            className={`rounded-[3px] px-3 py-1 font-medium ${
              origin === 'PAYPAL_SANDBOX'
                ? 'bg-[#1B3B6F] text-white'
                : 'text-[#4A5568] hover:text-[#14181F]'
            }`}
          >
            PayPal Sandbox
          </button>
          <button
            type="button"
            onClick={() => setOrigin('DEMO_FIXTURE')}
            className={`rounded-[3px] px-3 py-1 font-medium ${
              origin === 'DEMO_FIXTURE'
                ? 'bg-[#9A5B06] text-white'
                : 'text-[#4A5568] hover:text-[#14181F]'
            }`}
          >
            Demo Fixtures
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {origin === 'DEMO_FIXTURE' ? <DemoOriginBanner /> : null}

        {overviewQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}

        {overviewQuery.isError ? (
          <ErrorBanner
            title="Unable to load dashboard overview"
            message={
              overviewQuery.error instanceof Error
                ? overviewQuery.error.message
                : 'Failed to reach PROOFLINE API.'
            }
          />
        ) : null}

        {data ? (
          <>
            {/* KPI Strip */}
            <section aria-label="Casework metrics" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: 'Open Disputes', value: data.metrics.openDisputesCount, tone: 'text-[#14181F]' },
                {
                  label: 'Awaiting Seller Response',
                  value: data.metrics.awaitingSellerCount,
                  tone: 'text-[#1B3B6F]'
                },
                {
                  label: 'Deadlines < 72h',
                  value: data.metrics.urgentDeadlinesCount,
                  tone: 'text-[#9A5B06]'
                },
                {
                  label: 'Preserved Evidence Files',
                  value: data.metrics.evidenceAssetsCount,
                  tone: 'text-[#14181F]'
                },
                {
                  label: 'Needs Manual Review',
                  value: data.metrics.needsReviewCount,
                  tone: 'text-[#9A5B06]'
                }
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-[6px] border border-[#DFDCD4] bg-white p-4"
                >
                  <div className="text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                    {kpi.label}
                  </div>
                  <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${kpi.tone}`}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </section>

            {/* Deadlines & Evidence Processing Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section className="lg:col-span-7 rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#14181F] flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#9A5B06]" aria-hidden="true" />
                    <span>Response Deadlines</span>
                  </h2>
                  <Link
                    href="/disputes"
                    className="text-xs font-medium text-[#1B3B6F] hover:underline inline-flex items-center gap-1"
                  >
                    <span>All disputes</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>

                {data.upcomingDeadlines.length === 0 ? (
                  <EmptyState
                    title={
                      origin === 'PAYPAL_SANDBOX'
                        ? 'No PayPal Sandbox disputes synced yet'
                        : 'No demo fixture seeded yet'
                    }
                    description={
                      origin === 'PAYPAL_SANDBOX'
                        ? 'Sync your PayPal Sandbox disputes from the Disputes page, or switch to Guided Demo to inspect the USD 850 sample investigation.'
                        : 'Seed the isolated USD 850 freelance website dispute scenario from the Guided Demo page.'
                    }
                    action={
                      <Link
                        href={origin === 'PAYPAL_SANDBOX' ? '/disputes' : '/demo'}
                        className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#142C54]"
                      >
                        <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{origin === 'PAYPAL_SANDBOX' ? 'Open Disputes' : 'Open Guided Demo'}</span>
                      </Link>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#DFDCD4] text-[#6B7280]">
                          <th className="py-2 pr-2 font-medium">Dispute / Reason</th>
                          <th className="py-2 pr-2 font-medium">Status</th>
                          <th className="py-2 pr-2 font-medium text-right">Amount</th>
                          <th className="py-2 font-medium text-right whitespace-nowrap">Due (UTC)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DFDCD4]">
                        {data.upcomingDeadlines.map((item) => (
                          <tr key={item.id} className="hover:bg-[#F7F6F2]">
                            <td className="py-2.5 pr-2">
                              <Link
                                href={`/disputes/${item.id}`}
                                className="font-mono font-medium text-[#1B3B6F] hover:underline whitespace-nowrap"
                              >
                                {item.paypalDisputeId}
                              </Link>
                              <div
                                className="mt-0.5 font-mono text-[10.5px] text-[#6B7280] truncate max-w-[160px]"
                                title={item.reason}
                              >
                                {item.reason}
                              </div>
                            </td>
                            <td className="py-2.5 pr-2 whitespace-nowrap">
                              <StatusBadge
                                label={item.workflowStatus.replace(/_/g, ' ')}
                                tone={getDisputeStatusTone(item.workflowStatus)}
                              />
                            </td>
                            <td className="py-2.5 pr-2 font-mono tabular-nums text-right whitespace-nowrap">
                              {item.formattedAmount}
                            </td>
                            <td className="py-2.5 font-mono text-[11px] tabular-nums text-[#4A5568] text-right whitespace-nowrap">
                              {item.sellerResponseDueAt
                                ? item.sellerResponseDueAt.slice(0, 10)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="lg:col-span-5 rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-[#14181F] flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                  <span>Evidence Ingestion Breakdown</span>
                </h2>
                {data.metrics.evidenceAssetsCount === 0 ? (
                  <p className="text-xs text-[#6B7280] py-8 text-center">
                    No evidence ingested in the selected origin yet.
                  </p>
                ) : (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E2DA" />
                        <XAxis
                          dataKey="status"
                          interval={0}
                          tick={{ fontSize: 10, fill: '#4A5568' }}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4A5568' }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#1B3B6F" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>

            {/* Recent Submissions & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <section className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-[#14181F]">Recent Submissions</h2>
                {data.recentSubmissions.length === 0 ? (
                  <p className="text-xs text-[#6B7280] py-4">No evidence submissions drafted yet.</p>
                ) : (
                  <ul className="divide-y divide-[#DFDCD4] text-xs">
                    {data.recentSubmissions.map((sub) => (
                      <li key={sub.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/disputes/${sub.disputeId}`}
                            className="font-mono font-medium text-[#1B3B6F] hover:underline"
                          >
                            {sub.evidenceType}
                          </Link>
                          <div className="text-[11px] text-[#6B7280] font-mono">
                            Updated {sub.updatedAt.slice(0, 19).replace('T', ' ')} UTC
                          </div>
                        </div>
                        <StatusBadge
                          label={sub.status.replace(/_/g, ' ')}
                          tone={getSubmissionStatusTone(sub.status)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#14181F]">Recent Audit Activity</h2>
                  <Link href="/activity" className="text-xs font-medium text-[#1B3B6F] hover:underline">
                    Full ledger
                  </Link>
                </div>
                {data.recentActivity.length === 0 ? (
                  <p className="text-xs text-[#6B7280] py-4">No workspace audit events recorded.</p>
                ) : (
                  <ul className="divide-y divide-[#DFDCD4] text-xs">
                    {data.recentActivity.slice(0, 6).map((evt) => (
                      <li key={evt.id} className="py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <MonoId value={evt.action} />
                          <span className="ml-2 text-[11px] text-[#4A5568]">{evt.actorType}</span>
                        </div>
                        <span className="font-mono text-[11px] text-[#6B7280] shrink-0">
                          {evt.occurredAt.slice(11, 19)} UTC
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

