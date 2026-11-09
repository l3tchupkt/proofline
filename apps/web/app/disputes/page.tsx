'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Scale, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  DemoOriginBanner,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton
} from '@proofline/ui';
import { AppShell } from '../../components/AppShell';
import { DisputesGrid, type DisputeGridRow } from '../../components/DisputesGrid';
import { ApiClientError, apiRequest } from '../../lib/apiClient';

interface DisputesListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: DisputeGridRow[];
}

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const [originFilter, setOriginFilter] = useState<'ALL' | 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<{ code?: string; message: string } | null>(null);

  const queryParams = new URLSearchParams();
  if (originFilter !== 'ALL') queryParams.set('origin', originFilter);
  if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
  queryParams.set('pageSize', '100');

  const disputesQuery = useQuery({
    queryKey: ['disputes', originFilter, statusFilter],
    queryFn: () => apiRequest<DisputesListResponse>(`/api/disputes?${queryParams.toString()}`)
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ syncedCount: number; disputeIds: string[] }>('/api/disputes/sync', {
        method: 'POST',
        body: JSON.stringify({})
      }),
    onMutate: () => {
      setSyncError(null);
      setSyncMessage(null);
    },
    onSuccess: async (res) => {
      setSyncMessage(`Synced ${res.syncedCount} dispute(s) from PayPal Sandbox Disputes API.`);
      await queryClient.invalidateQueries({ queryKey: ['disputes'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setSyncError({ code: err.code, message: err.message });
      } else {
        setSyncError({ message: err instanceof Error ? err.message : 'PayPal sync failed.' });
      }
    }
  });

  const rows = disputesQuery.data?.items ?? [];
  const hasDemoRows = rows.some((r) => r.recordOrigin === 'DEMO_FIXTURE');

  return (
    <AppShell
      title="Disputes Register"
      subtitle="Synchronize PayPal Sandbox disputes, inspect deadlines and HATEOAS links, and launch provenance-backed investigations."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#142C54] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{syncMutation.isPending ? 'Syncing PayPal…' : 'Sync Sandbox Disputes'}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {originFilter === 'DEMO_FIXTURE' || hasDemoRows ? <DemoOriginBanner /> : null}

        {syncMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-[4px] border border-[#BBE2CC] bg-[#EAF6EF] px-4 py-2.5 text-xs text-[#156F48]"
          >
            {syncMessage}
          </div>
        ) : null}

        {syncError ? (
          <ErrorBanner
            title="PayPal Sandbox sync rejected"
            code={syncError.code}
            message={syncError.message}
            action={
              <Link
                href="/settings/paypal"
                className="inline-flex items-center rounded-[4px] border border-[#A82424] bg-white px-3 py-1.5 text-xs font-medium text-[#A82424] hover:bg-[#FDECEC]"
              >
                Check PayPal Config
              </Link>
            }
          />
        ) : null}

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 rounded-[6px] border border-[#DFDCD4] bg-white p-3.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by dispute ID, transaction reference, reason, or buyer…"
              aria-label="Filter disputes"
              className="w-full rounded-[4px] border border-[#C5C0B4] bg-white pl-8 pr-3 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium text-[#4A5568]" htmlFor="origin-filter">
              Origin
            </label>
            <select
              id="origin-filter"
              value={originFilter}
              onChange={(e) =>
                setOriginFilter(e.target.value as 'ALL' | 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE')
              }
              className="rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            >
              <option value="ALL">All origins</option>
              <option value="PAYPAL_SANDBOX">PayPal Sandbox only</option>
              <option value="DEMO_FIXTURE">Demo Fixtures only</option>
            </select>

            <label className="ml-1 text-[11px] font-medium text-[#4A5568]" htmlFor="status-filter">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            >
              <option value="ALL">All statuses</option>
              <option value="WAITING_FOR_SELLER_RESPONSE">Waiting for Seller</option>
              <option value="WAITING_FOR_BUYER_RESPONSE">Waiting for Buyer</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>

        {disputesQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}

        {disputesQuery.isError ? (
          <ErrorBanner
            title="Unable to load disputes"
            message={
              disputesQuery.error instanceof Error
                ? disputesQuery.error.message
                : 'Failed to retrieve workspace disputes.'
            }
          />
        ) : null}

        {disputesQuery.data && rows.length === 0 ? (
          <EmptyState
            title="No matching disputes in this filter"
            description="Configure PayPal Sandbox credentials to sync real sandbox disputes, or launch the isolated Guided Demo USD 850 scenario."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => syncMutation.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#142C54]"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sync Sandbox Disputes</span>
                </button>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#C5C0B4] bg-white px-3 py-1.5 text-xs font-medium text-[#14181F] hover:bg-[#F7F6F2]"
                >
                  <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open Guided Demo</span>
                </Link>
              </div>
            }
          />
        ) : null}

        {disputesQuery.data && rows.length > 0 ? (
          <DisputesGrid rows={rows} quickFilterText={searchInput} />
        ) : null}
      </div>
    </AppShell>
  );
}

