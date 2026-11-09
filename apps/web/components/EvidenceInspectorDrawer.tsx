'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Download, ShieldAlert, X } from 'lucide-react';
import { getVerificationTone, MonoId, StatusBadge } from '@proofline/ui';
import { API_BASE_URL } from '../lib/apiClient';

export interface InspectableAsset {
  id: string;
  originalFilename: string;
  extension: string;
  mimeType: string;
  byteSize: number;
  sha256Hash: string;
  status: string;
  parserVersion: string | null;
  extractedText: string | null;
  extractedMetadata: Record<string, unknown>;
  promptInjectionSignals: string[];
  documentCreatedAt: string | null;
  receivedAt: string;
}

export function EvidenceInspectorDrawer({
  asset,
  open,
  onOpenChange
}: {
  asset: InspectableAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#14181F]/35" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-[#DFDCD4] bg-white shadow-xl focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-[#DFDCD4] bg-[#F0EEE8] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold text-[#14181F] truncate">
                {asset?.originalFilename ?? 'Evidence Source Inspector'}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-[#4A5568]">
                Original uploaded file metadata, cryptographic digest, and untrusted extracted text.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close inspector"
              className="rounded-[4px] border border-[#C5C0B4] bg-white p-1.5 text-[#14181F] hover:bg-[#F7F6F2] focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {asset ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={asset.status} tone={getVerificationTone(asset.status)} />
                <span className="font-mono text-xs text-[#4A5568]">
                  {asset.mimeType} · {(asset.byteSize / 1024).toFixed(1)} KB
                </span>
                <a
                  href={`${API_BASE_URL}/api/evidence/${asset.id}/download`}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-[4px] border border-[#1B3B6F] bg-[#1B3B6F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#142C54]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download original</span>
                </a>
              </div>

              {asset.promptInjectionSignals.length > 0 ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-[4px] border border-[#F5C2C2] bg-[#FDECEC] p-3 text-xs text-[#A82424]"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="font-semibold">Prompt Injection Signals Flagged</div>
                    <p className="mt-0.5">
                      Detected patterns: {asset.promptInjectionSignals.join(', ')}. Treated strictly
                      as untrusted evidence text—never executed as agent instructions.
                    </p>
                  </div>
                </div>
              ) : null}

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] p-3.5 text-xs">
                <div>
                  <dt className="text-[#6B7280] font-medium">SHA-256 Digest</dt>
                  <dd className="mt-1 break-all">
                    <MonoId value={asset.sha256Hash} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280] font-medium">Parser Version</dt>
                  <dd className="mt-1 font-mono text-[#14181F]">
                    {asset.parserVersion ?? 'pending'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280] font-medium">Application Receipt (UTC)</dt>
                  <dd className="mt-1 font-mono text-[#14181F]">{asset.receivedAt}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280] font-medium">Document Timestamp (Embedded)</dt>
                  <dd className="mt-1 font-mono text-[#14181F]">
                    {asset.documentCreatedAt ?? 'Not embedded in file'}
                  </dd>
                </div>
              </dl>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4A5568] mb-2">
                  Extracted Text (Untrusted Source Content)
                </h3>
                <pre className="max-h-[360px] overflow-auto rounded-[4px] border border-[#DFDCD4] bg-[#FDFCFA] p-3.5 font-mono text-[12px] leading-relaxed text-[#14181F] whitespace-pre-wrap">
                  {asset.extractedText || '[No extractable text found in this attachment]'}
                </pre>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4A5568] mb-2">
                  Parsed Metadata
                </h3>
                <pre className="overflow-auto rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] p-3 font-mono text-[11.5px] text-[#4A5568]">
                  {JSON.stringify(asset.extractedMetadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

