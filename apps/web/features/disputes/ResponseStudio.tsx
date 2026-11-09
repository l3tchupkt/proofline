'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  Lock,
  Send,
  ShieldAlert
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  DemoOriginBanner,
  ErrorBanner,
  getSubmissionStatusTone,
  MonoId,
  StatusBadge
} from '@proofline/ui';
import { ApiClientError, apiRequest } from '../../lib/apiClient';
import type { EvidenceGridRow } from '../../components/EvidenceGrid';
import type { EvidenceSubmissionDto } from './types';

const PAYPAL_OUTBOUND_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif']);
const MAX_SINGLE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const DraftFormSchema = z.object({
  actionType: z.enum(['PROVIDE_EVIDENCE', 'PROVIDE_SUPPORTING_INFO', 'SEND_MESSAGE']),
  evidenceType: z.string().min(1, 'Select or enter a PayPal evidence type.'),
  responseNotes: z.string().min(10, 'Provide factual response notes (min 10 characters).').max(12000),
  carrierName: z.string().max(128).optional(),
  trackingNumber: z.string().max(128).optional(),
  refundId: z.string().max(128).optional()
});

type DraftFormValues = z.infer<typeof DraftFormSchema>;

export function ResponseStudio({
  disputeId,
  recordOrigin,
  suggestedEvidenceTypes,
  suggestedDraftNotes,
  assets,
  submissions,
  onChanged
}: {
  disputeId: string;
  recordOrigin: 'PAYPAL_SANDBOX' | 'DEMO_FIXTURE';
  suggestedEvidenceTypes: string[];
  suggestedDraftNotes?: string;
  assets: EvidenceGridRow[];
  submissions: EvidenceSubmissionDto[];
  onChanged: () => void;
}) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(
    submissions[0]?.id ?? null
  );
  const activeSubmission = submissions.find((s) => s.id === selectedSubmissionId) ?? null;

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(
    activeSubmission?.documents.map((d) => d.evidenceAssetId) ?? []
  );
  const [confirmExactContent, setConfirmExactContent] = useState(false);
  const [busyAction, setBusyAction] = useState<'draft' | 'bundle' | 'approve' | 'submit' | null>(null);
  const [studioError, setStudioError] = useState<{ code?: string; message: string } | null>(null);
  const [studioStatus, setStudioStatus] = useState<string | null>(null);

  const form = useForm<DraftFormValues>({
    resolver: zodResolver(DraftFormSchema),
    defaultValues: {
      actionType: activeSubmission?.actionType ?? 'PROVIDE_EVIDENCE',
      evidenceType:
        activeSubmission?.evidenceType ?? suggestedEvidenceTypes[0] ?? 'PROOF_OF_FULFILLMENT',
      responseNotes: activeSubmission?.responseNotes ?? suggestedDraftNotes ?? '',
      carrierName: activeSubmission?.carrierName ?? '',
      trackingNumber: activeSubmission?.trackingNumber ?? '',
      refundId: activeSubmission?.refundId ?? ''
    }
  });

  const lastSyncedSubmissionIdRef = useRef<string | null>(activeSubmission?.id ?? null);

  useEffect(() => {
    if (activeSubmission && activeSubmission.id !== lastSyncedSubmissionIdRef.current) {
      lastSyncedSubmissionIdRef.current = activeSubmission.id;
      form.reset({
        actionType: activeSubmission.actionType,
        evidenceType: activeSubmission.evidenceType,
        responseNotes: activeSubmission.responseNotes,
        carrierName: activeSubmission.carrierName ?? '',
        trackingNumber: activeSubmission.trackingNumber ?? '',
        refundId: activeSubmission.refundId ?? ''
      });
      setSelectedAssetIds(activeSubmission.documents.map((d) => d.evidenceAssetId));
      setConfirmExactContent(false);
    }
  }, [activeSubmission, form]);

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const chosenAssets = selectedAssetIds
    .map((id) => assetById.get(id))
    .filter((a): a is EvidenceGridRow => Boolean(a));

  const totalBytes = chosenAssets.reduce((sum, a) => sum + a.byteSize, 0);
  const attachmentWarnings = chosenAssets
    .filter((a) => !PAYPAL_OUTBOUND_EXTENSIONS.has(a.extension.toLowerCase()) || a.byteSize >= MAX_SINGLE_BYTES)
    .map((a) =>
      !PAYPAL_OUTBOUND_EXTENSIONS.has(a.extension.toLowerCase())
        ? `"${a.originalFilename}" (.${a.extension}) must be compiled into a PDF bundle before PayPal upload.`
        : `"${a.originalFilename}" is >= 10 MB and violates PayPal's single-file ceiling.`
    );
  if (totalBytes > MAX_TOTAL_BYTES) {
    attachmentWarnings.push('Combined attachments exceed PayPal 50 MB package limit.');
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
    setConfirmExactContent(false);
  }

  function handleStartNewDraft() {
    setSelectedSubmissionId(null);
    setSelectedAssetIds([]);
    setConfirmExactContent(false);
    form.reset({
      actionType: 'PROVIDE_EVIDENCE',
      evidenceType: suggestedEvidenceTypes[0] ?? 'PROOF_OF_FULFILLMENT',
      responseNotes: suggestedDraftNotes ?? '',
      carrierName: '',
      trackingNumber: '',
      refundId: ''
    });
  }

  async function handleSaveDraft(values: DraftFormValues) {
    setStudioError(null);
    setStudioStatus(null);
    setBusyAction('draft');
    try {
      const res = await apiRequest<{ submission: EvidenceSubmissionDto }>(
        `/api/disputes/${disputeId}/draft`,
        {
          method: 'POST',
          body: JSON.stringify({
            submissionId: activeSubmission?.id,
            actionType: values.actionType,
            evidenceType: values.evidenceType,
            responseNotes: values.responseNotes,
            carrierName: values.carrierName?.trim() || null,
            trackingNumber: values.trackingNumber?.trim() || null,
            refundId: values.refundId?.trim() || null,
            attachmentAssetIds: selectedAssetIds
          })
        }
      );
      setSelectedSubmissionId(res.submission.id);
      setConfirmExactContent(false);
      setStudioStatus(
        activeSubmission?.status === 'APPROVED'
          ? 'Draft updated. Prior approval digest was invalidated — review and re-approve before submission.'
          : 'Draft saved and ready for merchant confirmation.'
      );
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setStudioError({ code: err.code, message: err.message });
      } else {
        setStudioError({ message: err instanceof Error ? err.message : 'Unable to save draft.' });
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompilePdfBundle() {
    setStudioError(null);
    setStudioStatus(null);
    const values = form.getValues();
    if (!values.responseNotes.trim()) {
      setStudioError({
        code: 'NOTES_REQUIRED',
        message: 'Enter summary response notes before compiling the provenance PDF dossier.'
      });
      return;
    }

    setBusyAction('bundle');
    try {
      const res = await apiRequest<{ asset: EvidenceGridRow }>(
        `/api/disputes/${disputeId}/bundle-pdf`,
        {
          method: 'POST',
          body: JSON.stringify({
            evidenceType: values.evidenceType || 'PROOF_OF_FULFILLMENT',
            responseNotes: values.responseNotes,
            assetIds: selectedAssetIds
          })
        }
      );
      // Automatically switch attachments to include the PayPal-compatible PDF dossier (filtering out raw .eml/.json/.txt)
      setSelectedAssetIds((prev) => {
        const paypalValid = prev.filter((id) => {
          const item = assetById.get(id);
          return item && PAYPAL_OUTBOUND_EXTENSIONS.has(item.extension.toLowerCase());
        });
        return [...paypalValid, res.asset.id];
      });
      setStudioStatus(
        `Compiled PayPal-ready provenance PDF "${res.asset.originalFilename}" (sha256:${res.asset.sha256Hash.slice(0, 10)}…) and attached it.`
      );
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setStudioError({ code: err.code, message: err.message });
      } else {
        setStudioError({ message: err instanceof Error ? err.message : 'PDF bundling failed.' });
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApprove() {
    if (!activeSubmission || !confirmExactContent) return;
    setStudioError(null);
    setStudioStatus(null);
    setBusyAction('approve');
    try {
      const res = await apiRequest<{ submission: EvidenceSubmissionDto }>(
        `/api/submissions/${activeSubmission.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ confirmExactContent: true })
        }
      );
      setStudioStatus(
        `Submission approved (digest ${res.submission.approvalDigest?.slice(0, 14)}…). PayPal execution is now unlocked.`
      );
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setStudioError({ code: err.code, message: err.message });
      } else {
        setStudioError({ message: err instanceof Error ? err.message : 'Approval failed.' });
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitToPayPal() {
    if (!activeSubmission) return;
    setStudioError(null);
    setStudioStatus(null);
    setBusyAction('submit');
    try {
      const res = await apiRequest<{ submission: EvidenceSubmissionDto }>(
        `/api/submissions/${activeSubmission.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: activeSubmission.idempotencyKey })
        }
      );
      setStudioStatus(
        `PayPal API response recorded (status: ${res.submission.status}, correlation: ${res.submission.paypalCorrelationId ?? 'n/a'}). Dispute resolution outcome remains under PayPal review.`
      );
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setStudioError({ code: err.code, message: err.message });
      } else {
        setStudioError({ message: err instanceof Error ? err.message : 'Submission failed.' });
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-5">
      {recordOrigin === 'DEMO_FIXTURE' ? <DemoOriginBanner /> : null}

      {/* Submission Selector */}
      {submissions.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#DFDCD4] bg-white px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#14181F]">Submission Drafts:</span>
            {submissions.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubmissionId(sub.id)}
                className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 text-xs font-medium ${
                  activeSubmission?.id === sub.id
                    ? 'border-[#1B3B6F] bg-[#EEF3FA] text-[#1B3B6F]'
                    : 'border-[#DFDCD4] bg-[#F7F6F2] text-[#4A5568]'
                }`}
              >
                <span className="font-mono">{sub.evidenceType}</span>
                <StatusBadge label={sub.status} tone={getSubmissionStatusTone(sub.status)} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleStartNewDraft}
            className="text-xs font-medium text-[#1B3B6F] hover:underline"
          >
            + New Draft
          </button>
        </div>
      ) : null}

      {studioStatus ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-[4px] border border-[#BBE2CC] bg-[#EAF6EF] px-4 py-2.5 text-xs text-[#156F48]"
        >
          {studioStatus}
        </div>
      ) : null}

      {studioError ? (
        <ErrorBanner
          title="Response Studio action blocked"
          code={studioError.code}
          message={studioError.message}
        />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Response & Attachment Form */}
        <form
          onSubmit={(e) => void form.handleSubmit(handleSaveDraft)(e)}
          className="lg:col-span-7 rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#DFDCD4] pb-3">
            <h2 className="text-sm font-semibold text-[#14181F]">Response &amp; Evidence Composer</h2>
            {activeSubmission ? (
              <StatusBadge
                label={activeSubmission.status.replace(/_/g, ' ')}
                tone={getSubmissionStatusTone(activeSubmission.status)}
              />
            ) : null}
          </div>

          {activeSubmission?.status === 'APPROVED' ? (
            <div className="flex items-start gap-2 rounded-[4px] border border-[#F3D7A2] bg-[#FEF5E4] p-3 text-xs text-[#9A5B06]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                This draft is currently <strong>APPROVED</strong>. Editing text or attachments and
                saving will invalidate the prior SHA-256 approval digest and require fresh merchant
                confirmation.
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="actionType" className="block text-xs font-medium text-[#14181F]">
                PayPal Dispute Action
              </label>
              <select
                id="actionType"
                {...form.register('actionType')}
                className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-2 text-xs text-[#14181F]"
              >
                <option value="PROVIDE_EVIDENCE">provide-evidence (multipart)</option>
                <option value="PROVIDE_SUPPORTING_INFO">provide-supporting-info</option>
                <option value="SEND_MESSAGE">send-message (inquiry reply)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="evidenceType" className="block text-xs font-medium text-[#14181F]">
                PayPal Evidence Type
              </label>
              <select
                id="evidenceType"
                {...form.register('evidenceType')}
                className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-2 text-xs text-[#14181F]"
              >
                {[
                  ...new Set([
                    ...suggestedEvidenceTypes,
                    'PROOF_OF_FULFILLMENT',
                    'PROOF_OF_REFUND',
                    'PROOF_OF_DELIVERY_SIGNATURE',
                    'PROOF_OF_RECEIPT_OF_MERCHANDISE',
                    'PROOF_OF_MERCHANT_RETURN_POLICY',
                    'OTHER'
                  ])
                ].map((et) => (
                  <option key={et} value={et}>
                    {et}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="responseNotes" className="block text-xs font-medium text-[#14181F]">
              Factual Merchant Response Notes
            </label>
            <textarea
              id="responseNotes"
              rows={6}
              {...form.register('responseNotes')}
              placeholder="Write factual statement referencing uploaded evidence files and timestamps…"
              className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-3 py-2 text-xs leading-relaxed text-[#14181F] focus:border-[#1B3B6F] focus:outline-none"
            />
            {form.formState.errors.responseNotes ? (
              <p className="text-xs text-[#A82424]">{form.formState.errors.responseNotes.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label htmlFor="carrierName" className="block text-[11px] font-medium text-[#4A5568]">
                Carrier Name (optional)
              </label>
              <input
                id="carrierName"
                type="text"
                placeholder="e.g. UPS, DIGITAL_DELIVERY"
                {...form.register('carrierName')}
                className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="trackingNumber" className="block text-[11px] font-medium text-[#4A5568]">
                Tracking Number (optional)
              </label>
              <input
                id="trackingNumber"
                type="text"
                {...form.register('trackingNumber')}
                className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="refundId" className="block text-[11px] font-medium text-[#4A5568]">
                Refund ID (optional)
              </label>
              <input
                id="refundId"
                type="text"
                {...form.register('refundId')}
                className="w-full rounded-[4px] border border-[#C5C0B4] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Evidence Attachments */}
          <div className="space-y-2 border-t border-[#DFDCD4] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#14181F]">
                Attachments ({selectedAssetIds.length} selected · {(totalBytes / 1024).toFixed(1)} KB)
              </span>
              <button
                type="button"
                onClick={() => void handleCompilePdfBundle()}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#1B3B6F] bg-[#EEF3FA] px-2.5 py-1 text-[11.5px] font-medium text-[#1B3B6F] hover:bg-[#DDE7F6] disabled:opacity-50"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{busyAction === 'bundle' ? 'Compiling PDF…' : 'Compile Provenance PDF Bundle'}</span>
              </button>
            </div>

            {assets.length === 0 ? (
              <p className="text-xs text-[#6B7280]">No evidence uploaded to this case yet.</p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {assets.map((asset) => {
                  const checked = selectedAssetIds.includes(asset.id);
                  const isPaypalDirect = PAYPAL_OUTBOUND_EXTENSIONS.has(
                    asset.extension.toLowerCase()
                  );
                  return (
                    <label
                      key={asset.id}
                      className={`flex items-center justify-between gap-2 rounded-[4px] border px-3 py-2 text-xs cursor-pointer ${
                        checked ? 'border-[#1B3B6F] bg-[#EEF3FA]' : 'border-[#DFDCD4] bg-[#FDFCFA]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAsset(asset.id)}
                        />
                        <span className="font-mono font-medium text-[#14181F] truncate">
                          {asset.originalFilename}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-[#4A5568]">
                        <span>{(asset.byteSize / 1024).toFixed(1)} KB</span>
                        {!isPaypalDirect ? (
                          <span className="rounded bg-[#FEF5E4] border border-[#F3D7A2] px-1.5 py-0.5 text-[10px] text-[#9A5B06]">
                            Bundle to PDF
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {attachmentWarnings.length > 0 ? (
              <div className="rounded-[4px] border border-[#F3D7A2] bg-[#FEF5E4] p-2.5 text-[11.5px] text-[#9A5B06] space-y-1">
                {attachmentWarnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={busyAction !== null || attachmentWarnings.length > 0}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-4 py-2 text-xs font-medium text-white hover:bg-[#142C54] disabled:opacity-50"
            >
              <span>
                {busyAction === 'draft'
                  ? 'Saving…'
                  : activeSubmission
                    ? 'Save Draft Changes'
                    : 'Create Submission Draft'}
              </span>
            </button>
          </div>
        </form>

        {/* Right: Approval & PayPal Sandbox Execution Gate */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#DFDCD4] pb-3">
              <Lock className="h-4 w-4 text-[#1B3B6F]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[#14181F]">
                Merchant Approval &amp; PayPal Execution Gate
              </h2>
            </div>

            {!activeSubmission ? (
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Save a submission draft on the left to compute an immutable content digest, perform
                explicit merchant review, and unlock PayPal Sandbox submission.
              </p>
            ) : (
              <>
                <dl className="space-y-2 rounded-[4px] border border-[#DFDCD4] bg-[#F7F6F2] p-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B7280]">Status</dt>
                    <dd>
                      <StatusBadge
                        label={activeSubmission.status}
                        tone={getSubmissionStatusTone(activeSubmission.status)}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#6B7280]">Approval Digest (SHA-256)</dt>
                    <dd className="mt-0.5 break-all">
                      {activeSubmission.approvalDigest ? (
                        <MonoId value={activeSubmission.approvalDigest} />
                      ) : (
                        <span className="text-[#9A5B06] font-mono text-[11px]">
                          Pending explicit confirmation
                        </span>
                      )}
                    </dd>
                  </div>
                  {activeSubmission.paypalCorrelationId ? (
                    <div>
                      <dt className="text-[#6B7280]">PayPal Correlation ID</dt>
                      <dd className="mt-0.5">
                        <MonoId value={activeSubmission.paypalCorrelationId} />
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {/* Step 1: Explicit Confirmation */}
                <div className="space-y-3 rounded-[4px] border border-[#DFDCD4] p-3.5">
                  <div className="text-xs font-semibold text-[#14181F]">
                    Step 1 — Explicit Merchant Confirmation
                  </div>
                  <label className="flex items-start gap-2 text-xs text-[#4A5568] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmExactContent}
                      onChange={(e) => setConfirmExactContent(e.target.checked)}
                      disabled={
                        activeSubmission.status === 'SUBMITTED' ||
                        activeSubmission.status === 'VERIFIED'
                      }
                      className="mt-0.5"
                    />
                    <span>
                      I have reviewed the exact response notes, PayPal evidence type (
                      <MonoId value={activeSubmission.evidenceType} />), and{' '}
                      {activeSubmission.documents.length} SHA-256 verified attachment(s).
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleApprove()}
                    disabled={
                      !confirmExactContent ||
                      busyAction !== null ||
                      activeSubmission.status === 'SUBMITTED' ||
                      activeSubmission.status === 'VERIFIED'
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-[#1B3B6F] bg-[#EEF3FA] px-3 py-2 text-xs font-semibold text-[#1B3B6F] hover:bg-[#DDE7F6] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {busyAction === 'approve'
                        ? 'Recording Approval…'
                        : activeSubmission.status === 'APPROVED'
                          ? 'Approved (Re-confirm)'
                          : 'Approve Exact Submission'}
                    </span>
                  </button>
                </div>

                {/* Step 2: Execute to PayPal Sandbox */}
                <div className="space-y-2.5 rounded-[4px] border border-[#DFDCD4] p-3.5">
                  <div className="text-xs font-semibold text-[#14181F]">
                    Step 2 — PayPal Sandbox Execution &amp; Re-Verification
                  </div>
                  {recordOrigin === 'DEMO_FIXTURE' ? (
                    <div className="flex items-start gap-2 rounded border border-[#F3D7A2] bg-[#FEF5E4] p-2.5 text-[11.5px] text-[#9A5B06]">
                      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        Demo fixture disputes are strictly blocked from calling PayPal&apos;s API.
                      </span>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleSubmitToPayPal()}
                    disabled={
                      activeSubmission.status !== 'APPROVED' ||
                      busyAction !== null ||
                      recordOrigin === 'DEMO_FIXTURE'
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-3 py-2 text-xs font-semibold text-white hover:bg-[#142C54] disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {busyAction === 'submit'
                        ? 'Submitting & Re-verifying…'
                        : 'Submit to PayPal Sandbox'}
                    </span>
                  </button>

                  {activeSubmission.status === 'VERIFIED' ? (
                    <div className="rounded border border-[#BBE2CC] bg-[#EAF6EF] p-2.5 text-[11.5px] text-[#156F48]">
                      PayPal API acceptance verified via follow-up GET dispute check. Dispute decision
                      outcome remains under PayPal review.
                    </div>
                  ) : null}

                  {activeSubmission.status === 'VERIFICATION_PENDING' ? (
                    <div className="rounded border border-[#F3D7A2] bg-[#FEF5E4] p-2.5 text-[11.5px] text-[#9A5B06]">
                      PayPal accepted the submission, but follow-up verification failed:{' '}
                      {activeSubmission.errorMessage}
                    </div>
                  ) : null}

                  {activeSubmission.status === 'FAILED' && activeSubmission.errorMessage ? (
                    <div className="rounded border border-[#F5C2C2] bg-[#FDECEC] p-2.5 text-[11.5px] text-[#A82424]">
                      Submission error ({activeSubmission.errorCode}): {activeSubmission.errorMessage}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

