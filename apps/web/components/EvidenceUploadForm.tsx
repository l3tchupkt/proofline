'use client';

import { UploadCloud } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorBanner } from '@proofline/ui';
import { ApiClientError, apiRequest } from '../lib/apiClient';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'eml', 'txt', 'csv', 'json', 'png', 'jpg', 'jpeg']);

export function EvidenceUploadForm({
  disputeId,
  recordOrigin = 'PAYPAL_SANDBOX',
  onUploaded
}: {
  disputeId?: string;
  recordOrigin?: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
  onUploaded: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    if (!selectedFile) {
      setError({ message: 'Select a file (.pdf, .eml, .txt, .csv, .json, .png, .jpg) to upload.' });
      return;
    }

    const ext = selectedFile.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setError({
        code: 'UNSUPPORTED_EXTENSION',
        message: `Extension ".${ext}" is not permitted. Allowed types: PDF, EML, TXT, CSV, JSON, PNG, JPG.`
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      if (disputeId) formData.append('disputeId', disputeId);
      formData.append('recordOrigin', recordOrigin);
      formData.append('file', selectedFile);

      const res = await apiRequest<{
        asset: { originalFilename: string; sha256Hash: string };
        factCount: number;
        promptInjectionSignals: string[];
      }>('/api/evidence/upload', {
        method: 'POST',
        body: formData
      });

      setStatusMessage(
        `Preserved ${res.asset.originalFilename} (sha256:${res.asset.sha256Hash.slice(0, 10)}…, ${res.factCount} extracted facts).`
      );
      setSelectedFile(null);
      onUploaded();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ message: err instanceof Error ? err.message : 'Upload failed.' });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-[6px] border border-[#DFDCD4] bg-white p-4 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex-1 cursor-pointer rounded-[4px] border border-dashed border-[#C5C0B4] bg-[#F7F6F2] px-3.5 py-2.5 text-xs text-[#4A5568] hover:border-[#1B3B6F]">
          <span className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-[#1B3B6F] shrink-0" aria-hidden="true" />
            <span className="truncate font-medium text-[#14181F]">
              {selectedFile
                ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                : 'Choose evidence file (.pdf, .eml, .txt, .csv, .json, .png, .jpg)'}
            </span>
          </span>
          <input
            type="file"
            accept=".pdf,.eml,.txt,.csv,.json,.png,.jpg,.jpeg"
            onChange={(e) => {
              setSelectedFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="sr-only"
          />
        </label>

        <button
          type="submit"
          disabled={uploading || !selectedFile}
          className="inline-flex items-center justify-center rounded-[4px] bg-[#1B3B6F] px-4 py-2 text-xs font-medium text-white hover:bg-[#142C54] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#1B3B6F]"
        >
          {uploading ? 'Hashing & Parsing…' : 'Upload Evidence'}
        </button>
      </div>

      <p className="text-[11px] text-[#6B7280]">
        Original bytes are SHA-256 hashed and saved privately. PayPal outbound attachments require
        PDF/PNG/JPG/GIF strictly under 10 MB.
      </p>

      {error ? (
        <ErrorBanner title="Evidence validation rejected" code={error.code} message={error.message} />
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-[4px] border border-[#BBE2CC] bg-[#EAF6EF] px-3 py-2 text-xs text-[#156F48]"
        >
          {statusMessage}
        </div>
      ) : null}
    </form>
  );
}

