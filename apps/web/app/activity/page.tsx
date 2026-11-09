'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  EmptyState,
  ErrorBanner,
  LoadingSkeleton,
  MonoId,
  StatusBadge,
  type BadgeTone
} from '@proofline/ui';
import { AppShell } from '../../components/AppShell';
import { apiRequest } from '../../lib/apiClient';

interface AuditEventRow {
  id: string;
  disputeId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

function getResultTone(result: string): BadgeTone {
  switch (result.toUpperCase()) {
    case 'SUCCESS':
      return 'verified';
    case 'DENIED':
    case 'FAILURE':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatAuditMetadata(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '—';
  return entries
    .map(([key, value]) => {
      if (typeof value === 'string') {
        const display = value.length > 36 && /^[0-9a-f]{32,}$/i.test(value) ? `${value.slice(0, 14)}…` : value;
        return `${key}=${display}`;
      }
      if (Array.isArray(value)) {
        return `${key}=[${value.length}]`;
      }
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(' · ');
}

export default function ActivityLedgerPage() {
  const [actorFilter, setActorFilter] = useState<'ALL' | 'MERCHANT_USER' | 'AI_ASSISTANT' | 'SYSTEM_WORKER'>('ALL');
  const [search, setSearch] = useState('');

  const activityQuery = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiRequest<{ events: AuditEventRow[] }>('/api/activity')
  });

  const filteredEvents = useMemo(() => {
    const items = activityQuery.data?.events ?? [];
    const term = search.trim().toLowerCase();
    return items.filter((evt) => {
      if (actorFilter !== 'ALL' && evt.actorType !== actorFilter) return false;
      if (!term) return true;
      return (
        evt.action.toLowerCase().includes(term) ||
        evt.resourceType.toLowerCase().includes(term) ||
        evt.actorId.toLowerCase().includes(term) ||
        JSON.stringify(evt.metadata).toLowerCase().includes(term)
      );
    });
  }, [activityQuery.data?.events, actorFilter, search]);

  return (
    <AppShell
      title="Audit & Activity Ledger"
      subtitle="Append-only workspace audit trail recording merchant approvals, AI tool invocations, security alerts, and PayPal operations."
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-[6px] border border-[#DFDCD4] bg-white p-3.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, actor ID, resource, or metadata…"
              aria-label="Filter audit events"
              className="w-full rounded-[4px] border border-[#C5C0B4] bg-white pl-8 pr-3 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="actor-filter" className="text-[11px] font-medium text-[#4A5568]">
              Actor
            </label>
            <select
              id="actor-filter"
              value={actorFilter}
              onChange={(e) =>
                setActorFilter(
                  e.target.value as 'ALL' | 'MERCHANT_USER' | 'AI_ASSISTANT' | 'SYSTEM_WORKER'
                )
              }
              className="rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            >
              <option value="ALL">All actors</option>
              <option value="MERCHANT_USER">MERCHANT_USER</option>
              <option value="AI_ASSISTANT">AI_ASSISTANT</option>
              <option value="SYSTEM_WORKER">SYSTEM_WORKER</option>
            </select>
          </div>
        </div>

        {activityQuery.isLoading ? <LoadingSkeleton rows={8} /> : null}

        {activityQuery.isError ? (
          <ErrorBanner
            title="Unable to load audit ledger"
            message={
              activityQuery.error instanceof Error
                ? activityQuery.error.message
                : 'Failed to retrieve workspace audit events.'
            }
          />
        ) : null}

        {activityQuery.data && filteredEvents.length === 0 ? (
          <EmptyState
            title="No audit events match this filter"
            description="Workspace events are recorded automatically when you sign in, sync PayPal Sandbox disputes, upload evidence, run investigations, or approve submissions."
          />
        ) : null}

        {activityQuery.data && filteredEvents.length > 0 ? (
          <div className="rounded-[6px] border border-[#DFDCD4] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DFDCD4] bg-[#F0EEE8] text-[#4A5568]">
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Timestamp (UTC)</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Actor</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Action</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Resource</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Result</th>
                  <th className="px-2.5 py-2.5 font-semibold whitespace-nowrap">Case</th>
                  <th className="px-2.5 py-2.5 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFDCD4]">
                {filteredEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-[#F7F6F2] align-top">
                    <td className="px-2.5 py-2.5 font-mono text-[11px] tabular-nums text-[#4A5568] whitespace-nowrap">
                      {evt.occurredAt.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-medium text-[#14181F]">
                        {evt.actorType}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <MonoId value={evt.action} />
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-[11px] text-[#4A5568] whitespace-nowrap">
                      {evt.resourceType}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <StatusBadge label={evt.result} tone={getResultTone(evt.result)} />
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {evt.disputeId ? (
                        <Link
                          href={`/disputes/${evt.disputeId}`}
                          className="font-mono text-[11px] text-[#1B3B6F] hover:underline"
                        >
                          Open case →
                        </Link>
                      ) : (
                        <span className="text-[#6B7280]">—</span>
                      )}
                    </td>
                    <td
                      className="px-2.5 py-2.5 font-mono text-[11px] text-[#4A5568] break-all whitespace-normal"
                      title={
                        Object.keys(evt.metadata ?? {}).length > 0
                          ? JSON.stringify(evt.metadata)
                          : undefined
                      }
                    >
                      {formatAuditMetadata(evt.metadata ?? {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

