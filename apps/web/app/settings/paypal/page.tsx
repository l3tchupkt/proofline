'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck, Webhook } from 'lucide-react';
import Link from 'next/link';
import { ErrorBanner, LoadingSkeleton, MonoId, StatusBadge } from '@proofline/ui';
import { AppShell } from '../../../components/AppShell';
import { apiRequest } from '../../../lib/apiClient';
import type { SettingsStatusResponse } from '../page';

export default function PayPalSettingsPage() {
  const statusQuery = useQuery({
    queryKey: ['settings', 'status'],
    queryFn: () => apiRequest<SettingsStatusResponse>('/api/settings/status')
  });

  const data = statusQuery.data;

  return (
    <AppShell
      title="PayPal Sandbox Integration"
      subtitle="Strict Sandbox-only REST client configuration, webhook signature verification status, and HATEOAS safeguards."
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
        {statusQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}
        {statusQuery.isError ? (
          <ErrorBanner
            title="Unable to check PayPal status"
            message={statusQuery.error instanceof Error ? statusQuery.error.message : 'API error'}
          />
        ) : null}

        {data ? (
          <>
            <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#14181F]">
                  <ShieldCheck className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                  <span>Sandbox Credentials & Webhook Verification</span>
                </div>
                <StatusBadge
                  label={data.readiness.paypalConfigured ? 'PAYPAL READY' : 'CREDENTIALS UNSET'}
                  tone={data.readiness.paypalConfigured ? 'verified' : 'warning'}
                />
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] p-3">
                  <dt className="text-[#6B7280] font-medium">API Endpoint (Locked)</dt>
                  <dd className="mt-1">
                    <MonoId value={`${data.readiness.paypalEnvironment}: https://api-m.sandbox.paypal.com`} />
                  </dd>
                </div>
                <div className="rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] p-3">
                  <dt className="text-[#6B7280] font-medium">Webhook Signature Verification</dt>
                  <dd className="mt-1">
                    <StatusBadge
                      label={
                        data.readiness.paypalWebhookConfigured
                          ? 'WEBHOOK ID CONFIGURED'
                          : 'WEBHOOK ID UNSET'
                      }
                      tone={data.readiness.paypalWebhookConfigured ? 'verified' : 'warning'}
                    />
                  </dd>
                </div>
              </dl>

              {!data.readiness.paypalConfigured ? (
                <div className="rounded-[4px] border border-[#F3D7A2] bg-[#FEF5E4] p-3.5 text-xs text-[#9A5B06] space-y-1.5">
                  <div className="font-semibold">Environment Configuration Required</div>
                  <p>
                    Set <MonoId value="PAYPAL_CLIENT_ID" />, <MonoId value="PAYPAL_CLIENT_SECRET" />,
                    and <MonoId value="PAYPAL_WEBHOOK_ID" /> in your local `.env` file (never commit
                    secrets) and run <MonoId value="pnpm sandbox:setup" /> to validate OAuth2 tokens
                    and inspect Sandbox disputes.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#14181F]">
                <Webhook className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                <span>Recent Webhook Deliveries</span>
              </div>
              {data.recentWebhooks.length === 0 ? (
                <p className="text-xs text-[#6B7280] py-4">
                  No PayPal webhooks received yet. Register{' '}
                  <MonoId value="POST /api/webhooks/paypal" /> in your PayPal Sandbox Developer App.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#DFDCD4] text-[#6B7280]">
                        <th className="py-2 pr-3 font-medium">Event ID</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Signature</th>
                        <th className="py-2 pr-3 font-medium">Processing</th>
                        <th className="py-2 font-medium">Received (UTC)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DFDCD4]">
                      {data.recentWebhooks.map((w) => (
                        <tr key={w.id}>
                          <td className="py-2 pr-3 font-mono text-[11px]">{w.paypalEventId}</td>
                          <td className="py-2 pr-3 font-mono text-[11px]">{w.eventType}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge
                              label={w.verificationStatus}
                              tone={w.verificationStatus === 'VERIFIED' ? 'verified' : 'danger'}
                            />
                          </td>
                          <td className="py-2 pr-3 font-mono text-[11px]">{w.processingStatus}</td>
                          <td className="py-2 font-mono text-[11px] text-[#4A5568]">
                            {w.receivedAt.slice(0, 19).replace('T', ' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
