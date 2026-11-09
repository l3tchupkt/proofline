'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, Database, HardDrive, Plug } from 'lucide-react';
import Link from 'next/link';
import { ErrorBanner, LoadingSkeleton, MonoId, StatusBadge } from '@proofline/ui';
import { AppShell } from '../../components/AppShell';
import { apiRequest } from '../../lib/apiClient';

export interface SettingsStatusResponse {
  workspace: {
    id: string;
    name: string;
    slug: string;
    paypalMerchantPayerId: string | null;
  } | null;
  readiness: {
    paypalConfigured: boolean;
    paypalWebhookConfigured: boolean;
    paypalEnvironment: 'sandbox';
    anthropicConfigured: boolean;
    anthropicModelConfigured: boolean;
    demoMode: boolean;
    storageDriver: 'local' | 's3';
  };
  anthropicModel: string | null;
  storageHealth: { healthy: boolean; detail: string };
  jobQueueMode: string;
  recentWebhooks: Array<{
    id: string;
    paypalEventId: string;
    eventType: string;
    verificationStatus: string;
    processingStatus: string;
    receivedAt: string;
  }>;
}

export default function SettingsOverviewPage() {
  const statusQuery = useQuery({
    queryKey: ['settings', 'status'],
    queryFn: () => apiRequest<SettingsStatusResponse>('/api/settings/status')
  });

  const data = statusQuery.data;

  return (
    <AppShell
      title="Workspace & Integration Settings"
      subtitle="Verify runtime health, cryptographic evidence storage, background job queue mode, and integration configuration."
    >
      <div className="space-y-6 max-w-5xl">
        {statusQuery.isLoading ? <LoadingSkeleton rows={5} /> : null}

        {statusQuery.isError ? (
          <ErrorBanner
            title="Unable to inspect workspace settings"
            message={
              statusQuery.error instanceof Error
                ? statusQuery.error.message
                : 'Failed to retrieve runtime status.'
            }
          />
        ) : null}

        {data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[#14181F]">
                    <Plug className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                    <span>PayPal Sandbox Integration</span>
                  </div>
                  <StatusBadge
                    label={data.readiness.paypalConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                    tone={data.readiness.paypalConfigured ? 'verified' : 'warning'}
                  />
                </div>
                <p className="text-xs text-[#4A5568] flex flex-wrap items-center gap-1.5">
                  <span>Environment:</span>
                  <MonoId value={data.readiness.paypalEnvironment} />
                  <span className="font-mono text-[11px] text-[#6B7280]">
                    (api-m.sandbox.paypal.com)
                  </span>
                </p>
                <Link
                  href="/settings/paypal"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1B3B6F] hover:underline"
                >
                  <span>PayPal & Webhook Status</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>

              <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[#14181F]">
                    <Bot className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                    <span>Anthropic Investigation Model</span>
                  </div>
                  <StatusBadge
                    label={data.readiness.anthropicConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                    tone={data.readiness.anthropicConfigured ? 'verified' : 'warning'}
                  />
                </div>
                <p className="text-xs text-[#4A5568]">
                  Configured model:{' '}
                  {data.anthropicModel ? <MonoId value={data.anthropicModel} /> : 'Unset (set ANTHROPIC_MODEL)'}
                </p>
                <Link
                  href="/settings/ai"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1B3B6F] hover:underline"
                >
                  <span>AI Tool Boundary & Guardrails</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#14181F] flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
                <span>Workspace Storage & Background Processing</span>
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-[#6B7280] font-medium">Workspace Name / Slug</dt>
                  <dd className="mt-1 font-medium text-[#14181F]">
                    {data.workspace?.name} (<MonoId value={data.workspace?.slug ?? 'default'} />)
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280] font-medium">Job Queue Coordinator</dt>
                  <dd className="mt-1">
                    <MonoId value={data.jobQueueMode} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280] font-medium">Evidence Storage Adapter</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <StatusBadge
                      label={data.storageHealth.healthy ? 'HEALTHY' : 'UNHEALTHY'}
                      tone={data.storageHealth.healthy ? 'verified' : 'danger'}
                    />
                    <span className="font-mono text-[#4A5568]">{data.storageHealth.detail}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280] font-medium">Demo Fixture Mode</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-[#4A5568]" aria-hidden="true" />
                    <span className="font-mono text-[#14181F]">
                      {data.readiness.demoMode ? 'ENABLED (Isolated recordOrigin)' : 'DISABLED'}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
