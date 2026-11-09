'use client';

import { CalendarClock, Info } from 'lucide-react';
import { EmptyState, getVerificationTone, MonoId, ProvenancePill, StatusBadge } from '@proofline/ui';
import type { EvidenceGridRow } from '../../components/EvidenceGrid';
import type { TimelineEventDto } from './types';

export function TimelinePanel({
  timeline,
  assets,
  onInspectAsset
}: {
  timeline: TimelineEventDto[];
  assets: EvidenceGridRow[];
  onInspectAsset: (assetId: string) => void;
}) {
  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-[6px] border border-[#DFDCD4] bg-[#F0EEE8] p-3.5 text-xs text-[#4A5568]">
        <Info className="h-4 w-4 text-[#1B3B6F] shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Timeline entries distinguish <strong className="text-[#14181F]">embedded document dates</strong>{' '}
          (such as RFC-5322 email headers or PDF metadata) from{' '}
          <strong className="text-[#14181F]">application ingestion timestamps</strong> so recently uploaded
          screenshots cannot disguise when delivery occurred.
        </p>
      </div>

      {timeline.length === 0 ? (
        <EmptyState
          title="No timeline events reconstructed yet"
          description="Upload signed agreements, delivery emails, or activity logs to build an ordered delivery chronology."
        />
      ) : (
        <ol className="relative border-l border-[#C5C0B4] ml-3 space-y-4 pl-6">
          {timeline.map((evt) => {
            const asset = evt.sourceAssetId ? assetById.get(evt.sourceAssetId) : undefined;
            return (
              <li key={evt.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[31px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[#1B3B6F] bg-white"
                />
                <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-mono text-[11.5px] font-semibold text-[#1B3B6F] tabular-nums">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {evt.eventTimestamp
                          ? `${evt.eventTimestamp.slice(0, 19).replace('T', ' ')} UTC`
                          : 'Timestamp unknown'}
                      </span>
                    </span>
                    <StatusBadge
                      label={evt.timestampPrecision}
                      tone={evt.timestampPrecision === 'EXACT' ? 'navy' : 'neutral'}
                    />
                    <StatusBadge
                      label={evt.verificationStatus.replace(/_/g, ' ')}
                      tone={getVerificationTone(evt.verificationStatus)}
                    />
                    <MonoId value={evt.eventType} className="ml-auto" />
                  </div>

                  <div className="text-sm font-semibold text-[#14181F]">{evt.title}</div>
                  <p className="text-xs leading-relaxed text-[#4A5568]">{evt.description}</p>

                  {asset && evt.locator ? (
                    <ProvenancePill
                      filename={asset.originalFilename}
                      sha256Hash={asset.sha256Hash}
                      locator={evt.locator}
                      verificationStatus={evt.verificationStatus}
                      onInspect={() => onInspectAsset(asset.id)}
                    />
                  ) : asset ? (
                    <button
                      type="button"
                      onClick={() => onInspectAsset(asset.id)}
                      className="text-xs font-medium text-[#1B3B6F] hover:underline"
                    >
                      Inspect source file ({asset.originalFilename}) →
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

