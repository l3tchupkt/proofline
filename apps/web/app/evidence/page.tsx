'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import {
  DemoOriginBanner,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton
} from '@proofline/ui';
import { AppShell } from '../../components/AppShell';
import { EvidenceGrid, type EvidenceGridRow } from '../../components/EvidenceGrid';
import { EvidenceInspectorDrawer } from '../../components/EvidenceInspectorDrawer';
import { EvidenceUploadForm } from '../../components/EvidenceUploadForm';
import { ApiClientError, apiRequest } from '../../lib/apiClient';

interface EvidenceListResponse {
  assets: EvidenceGridRow[];
}

export default function EvidenceLibraryPage() {
  const queryClient = useQueryClient();
  const [originFilter, setOriginFilter] = useState<'ALL' | 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE'>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [inspectAsset, setInspectAsset] = useState<EvidenceGridRow | null>(null);
  const [deleteError, setDeleteError] = useState<{ code?: string; message: string } | null>(null);

  const queryParams = new URLSearchParams();
  if (originFilter !== 'ALL') queryParams.set('origin', originFilter);

  const evidenceQuery = useQuery({
    queryKey: ['evidence', originFilter],
    queryFn: () => apiRequest<EvidenceListResponse>(`/api/evidence?${queryParams.toString()}`)
  });

  async function handleDelete(asset: EvidenceGridRow) {
    setDeleteError(null);
    try {
      await apiRequest(`/api/evidence/${asset.id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['evidence'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError({ code: err.code, message: err.message });
      } else {
        setDeleteError({ message: err instanceof Error ? err.message : 'Unable to delete file.' });
      }
    }
  }

  const assets = evidenceQuery.data?.assets ?? [];
  const hasDemoAssets = assets.some((a) => a.recordOrigin === 'DEMO_FIXTURE');

  return (
    <AppShell
      title="Evidence Library"
      subtitle="Cryptographically hashed source documents, extracted metadata, prompt-injection inspection, and retention locks."
    >
      <div className="space-y-5">
        {originFilter === 'DEMO_FIXTURE' || hasDemoAssets ? <DemoOriginBanner /> : null}

        <EvidenceUploadForm
          recordOrigin={originFilter === 'DEMO_FIXTURE' ? 'DEMO_FIXTURE' : 'PAYPAL_SANDBOX'}
          onUploaded={() => {
            void queryClient.invalidateQueries({ queryKey: ['evidence'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />

        {deleteError ? (
          <ErrorBanner
            title="Evidence deletion blocked"
            code={deleteError.code}
            message={deleteError.message}
          />
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-[6px] border border-[#DFDCD4] bg-white p-3.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search evidence filename, SHA-256 hash, or status…"
              aria-label="Search evidence"
              className="w-full rounded-[4px] border border-[#C5C0B4] bg-white pl-8 pr-3 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="ev-origin" className="text-[11px] font-medium text-[#4A5568]">
              Origin
            </label>
            <select
              id="ev-origin"
              value={originFilter}
              onChange={(e) =>
                setOriginFilter(e.target.value as 'ALL' | 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE')
              }
              className="rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            >
              <option value="ALL">All origins</option>
              <option value="PAYPAL_SANDBOX">PayPal Sandbox</option>
              <option value="DEMO_FIXTURE">Demo Fixtures</option>
            </select>
          </div>
        </div>

        {evidenceQuery.isLoading ? <LoadingSkeleton rows={6} /> : null}

        {evidenceQuery.isError ? (
          <ErrorBanner
            title="Unable to load evidence library"
            message={
              evidenceQuery.error instanceof Error
                ? evidenceQuery.error.message
                : 'Failed to retrieve workspace evidence assets.'
            }
          />
        ) : null}

        {evidenceQuery.data && assets.length === 0 ? (
          <EmptyState
            title="No evidence files uploaded yet"
            description="Upload contracts, EML delivery threads, CSV logs, JSON webhooks, or PNG/JPG screenshots above to compute SHA-256 digests and parse verifiable facts."
          />
        ) : null}

        {evidenceQuery.data && assets.length > 0 ? (
          <EvidenceGrid
            rows={assets}
            quickFilterText={searchInput}
            onInspect={(asset) => setInspectAsset(asset)}
            onDelete={(asset) => void handleDelete(asset)}
          />
        ) : null}
      </div>

      <EvidenceInspectorDrawer
        asset={inspectAsset}
        open={Boolean(inspectAsset)}
        onOpenChange={(open) => {
          if (!open) setInspectAsset(null);
        }}
      />
    </AppShell>
  );
}

