'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, FlaskConical, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DemoOriginBanner, ErrorBanner, MonoId } from '@proofline/ui';
import { AppShell } from '../../components/AppShell';
import { ApiClientError, apiRequest } from '../../lib/apiClient';

interface DemoDisputeItem {
  id: string;
  paypalDisputeId: string;
  reason: string;
  workflowStatus: string;
  formattedAmount: string;
  recordOrigin: string;
}

export default function GuidedDemoPage() {
  const queryClient = useQueryClient();
  const [seedError, setSeedError] = useState<{ code?: string; message: string } | null>(null);
  const [seededResult, setSeededResult] = useState<{
    disputeId: string;
    paypalDisputeId: string;
    assetCount: number;
    alreadySeeded: boolean;
  } | null>(null);

  const existingDemoQuery = useQuery({
    queryKey: ['disputes', 'DEMO_FIXTURE'],
    queryFn: () =>
      apiRequest<{ items: DemoDisputeItem[] }>('/api/disputes?origin=DEMO_FIXTURE&pageSize=10')
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      apiRequest<{
        disputeId: string;
        paypalDisputeId: string;
        assetCount: number;
        alreadySeeded: boolean;
      }>('/api/demo/seed', {
        method: 'POST',
        body: JSON.stringify({})
      }),
    onMutate: () => setSeedError(null),
    onSuccess: async (res) => {
      setSeededResult(res);
      await queryClient.invalidateQueries({ queryKey: ['disputes'] });
      await queryClient.invalidateQueries({ queryKey: ['evidence'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setSeedError({ code: err.code, message: err.message });
      } else {
        setSeedError({ message: err instanceof Error ? err.message : 'Unable to seed demo scenario.' });
      }
    }
  });

  const existingDemo = existingDemoQuery.data?.items[0] ?? null;
  const activeDisputeId = seededResult?.disputeId ?? existingDemo?.id ?? null;

  return (
    <AppShell
      title="Guided Demo Scenario"
      subtitle="Explore PROOFLINE’s complete evidence-provenance pipeline using a deterministic USD 850.00 digital service dispute fixture."
      actions={
        activeDisputeId ? (
          <Link
            href={`/disputes/${activeDisputeId}`}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#1B3B6F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#142C54]"
          >
            <span>Open Demo Case Dossier</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      <div className="space-y-6 max-w-4xl">
        <DemoOriginBanner />

        {seedError ? (
          <ErrorBanner title="Demo fixture seeding failed" code={seedError.code} message={seedError.message} />
        ) : null}

        <section className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-[#9A5B06]" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-[#14181F]">
                  USD 850.00 Freelance Website Delivery Dispute
                </h2>
              </div>
              <p className="text-xs text-[#4A5568] leading-relaxed">
                Simulates a real-world <MonoId value="MERCHANDISE_OR_SERVICE_NOT_RECEIVED" />{' '}
                dispute on a fixed-fee web development engagement (<MonoId value="SOW-DEMO-2026-104" />).
                Five verifiable source files (signed PDF SOW, two RFC-5322 <MonoId value=".eml" /> emails,
                deployment log JSON, and completion gap note) are SHA-256 hashed, parsed into exact{' '}
                <MonoId value="SourceLocator" /> citations, and mapped to PayPal&apos;s{' '}
                <MonoId value="PROOF_OF_FULFILLMENT" /> guidance.
              </p>
            </div>

            <button
              type="button"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-[4px] bg-[#9A5B06] px-4 py-2 text-xs font-medium text-white hover:bg-[#7D4904] disabled:opacity-50"
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {seedMutation.isPending
                  ? 'Seeding Fixture…'
                  : activeDisputeId
                    ? 'Verify Demo Fixture'
                    : 'Seed USD 850 Demo Scenario'}
              </span>
            </button>
          </div>

          {activeDisputeId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#BBE2CC] bg-[#EAF6EF] px-4 py-3 text-xs text-[#156F48]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Demo dispute <MonoId value={seededResult?.paypalDisputeId ?? existingDemo?.paypalDisputeId ?? ''} />{' '}
                  is ready ({seededResult?.assetCount ?? 5} preserved evidence artifacts).
                </span>
              </div>
              <Link
                href={`/disputes/${activeDisputeId}`}
                className="font-semibold underline hover:text-[#0E5133]"
              >
                Inspect Case & Response Studio →
              </Link>
            </div>
          ) : null}
        </section>

        <section className="rounded-[6px] border border-[#DFDCD4] bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#14181F]">Walkthrough Steps</h3>
          <ol className="space-y-3 text-xs text-[#4A5568]">
            {[
              {
                title: '1. Inspect Preserved Evidence & SHA-256 Hashes',
                detail:
                  'Open the Evidence Library tab inside the demo case to verify PDF page ranges, RFC-5322 email message IDs, JSON event timestamps, and SHA-256 checksums.'
              },
              {
                title: '2. Examine Provenance-Linked Claims vs. Identified Gaps',
                detail:
                  'Review how supported claims cite exact SourceLocators while explicitly flagging that courier tracking numbers are N/A for digital services.'
              },
              {
                title: '3. Verify Timeline Separation',
                detail:
                  'Compare embedded document creation dates (Oct 2, Oct 14, Oct 15) against PROOFLINE ingestion timestamps so post-hoc file creation is never confused with delivery dates.'
              },
              {
                title: '4. Compile Provenance PDF Bundle & Draft Response',
                detail:
                  'In Response Studio, select attachments, compile a pdf-lib dossier containing SHA-256 digests, save a draft, and confirm the approval digest.'
              },
              {
                title: '5. Observe Live Sandbox Isolation Safeguard',
                detail:
                  'Attempting to execute outbound PayPal submission on DEMO_FIXTURE intentionally fails with DEMO_SUBMISSION_BLOCKED. Only genuine PayPal Sandbox synced disputes can transmit via multipart provide-evidence.'
              }
            ].map((step) => (
              <li
                key={step.title}
                className="rounded-[4px] border border-[#DFDCD4] bg-[#FDFCFA] p-3"
              >
                <div className="font-semibold text-[#14181F]">{step.title}</div>
                <p className="mt-1 leading-relaxed">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex items-start gap-2.5 rounded-[6px] border border-[#DFDCD4] bg-[#F0EEE8] p-4 text-xs text-[#4A5568]">
          <ShieldAlert className="h-4 w-4 text-[#1B3B6F] shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Need to run an end-to-end live PayPal Sandbox submission? Configure your PayPal Sandbox
            credentials and webhook ID, then visit{' '}
            <Link href="/settings/paypal" className="font-medium text-[#1B3B6F] hover:underline">
              Settings → PayPal Sandbox
            </Link>
            .
          </p>
        </div>
      </div>
    </AppShell>
  );
}

