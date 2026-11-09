import { FileText, ArrowUpRight } from 'lucide-react';
import type { SourceLocator } from '@proofline/domain';
import { cn } from '../utils.js';
import { getVerificationTone, StatusBadge } from './StatusBadge.js';

export function formatSourceLocator(locator: SourceLocator): string {
  switch (locator.type) {
    case 'pdf_page':
      return `p.${locator.pageNumber} · chars ${locator.textStart}–${locator.textEnd}`;
    case 'email_message':
      return `${locator.messageId.slice(0, 28)} · chars ${locator.textStart}–${locator.textEnd}`;
    case 'csv_row':
      return `row ${locator.rowIndex} (${locator.columnNames.slice(0, 3).join(', ')})`;
    case 'json_path':
      return `${locator.jsonPath}${locator.timestamp ? ` · ${locator.timestamp.slice(0, 10)}` : ''}`;
    case 'text_range':
      return `lines ${locator.lineStart}–${locator.lineEnd}`;
    case 'image_ocr':
      return `${locator.extractionMethod.toUpperCase()} image extraction`;
  }
}

export interface ProvenancePillProps {
  filename: string;
  sha256Hash?: string;
  locator: SourceLocator;
  verificationStatus: string;
  onInspect?: () => void;
  className?: string;
}

export function ProvenancePill({
  filename,
  sha256Hash,
  locator,
  verificationStatus,
  onInspect,
  className
}: ProvenancePillProps) {
  const locatorLabel = formatSourceLocator(locator);
  const shortHash = sha256Hash ? `sha256:${sha256Hash.slice(0, 8)}` : null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] px-2.5 py-1.5 text-xs',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <StatusBadge
          label={verificationStatus.replace(/_/g, ' ')}
          tone={getVerificationTone(verificationStatus)}
        />
        <span className="inline-flex items-center gap-1 font-mono text-[11.5px] font-medium text-[#14181F] truncate">
          <FileText className="h-3.5 w-3.5 text-[#1B3B6F] shrink-0" aria-hidden="true" />
          <span className="truncate">{filename}</span>
        </span>
        <span className="font-mono text-[11px] text-[#4A5568]">{locatorLabel}</span>
        {shortHash ? (
          <span className="font-mono text-[11px] text-[#6B7280]" title={sha256Hash}>
            {shortHash}
          </span>
        ) : null}
      </div>

      {onInspect ? (
        <button
          type="button"
          onClick={onInspect}
          className="inline-flex items-center gap-1 rounded-[4px] border border-[#C5C0B4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#1B3B6F] hover:bg-[#EEF3FA] focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
        >
          <span>Inspect source</span>
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

