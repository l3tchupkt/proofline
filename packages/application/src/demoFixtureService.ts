import { PDFDocument, StandardFonts } from 'pdf-lib';
import { assertAuthorized, type ActorContext } from '@proofline/authorization';
import {
  AuditRepository,
  DisputeRepository,
  EvidenceRepository
} from '@proofline/database';
import type { EvidenceService } from './evidenceService.js';

export const DEMO_PAYPAL_DISPUTE_ID = 'PP-D-DEMO-850-WEBDEV';

async function buildDemoContractPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Website Development Service Agreement (DEMO DATA)');
  doc.setAuthor('Northwind Web Studio (Synthetic Demo)');
  doc.setCreationDate(new Date('2026-10-02T10:00:00Z'));

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([612, 792]);
  page1.drawText('DEMO DATA — NOT A LIVE CUSTOMER RECORD', { x: 48, y: 745, size: 10, font: bold });
  page1.drawText('WEBSITE DEVELOPMENT SERVICE AGREEMENT', { x: 48, y: 718, size: 15, font: bold });
  page1.drawText('Statement of Work ID: SOW-DEMO-2026-104', { x: 48, y: 695, size: 11, font });
  page1.drawText('Provider: Northwind Web Studio (Synthetic Merchant)', { x: 48, y: 675, size: 11, font });
  page1.drawText('Client: Harborview Roasters (Synthetic Buyer)', { x: 48, y: 655, size: 11, font });
  page1.drawText('Total Contract Fee: USD 850.00 (Fixed Digital Service Milestone)', {
    x: 48,
    y: 630,
    size: 11,
    font: bold
  });
  page1.drawText(
    'Scope of Work: Design, Next.js storefront build, responsive QA, and production deployment.',
    { x: 48, y: 600, size: 10.5, font }
  );

  const page2 = doc.addPage([612, 792]);
  page2.drawText('PAGE 2 — DELIVERY & ACCEPTANCE TERMS (DEMO DATA)', {
    x: 48,
    y: 740,
    size: 12,
    font: bold
  });
  page2.drawText(
    'Delivery Method: Electronic handover via production URL, Git archive link, and credentials.',
    { x: 48, y: 708, size: 10.5, font }
  );
  page2.drawText(
    'No physical goods or courier shipping apply to this digital software engagement.',
    { x: 48, y: 685, size: 10.5, font }
  );
  page2.drawText(
    'Client agreed to final USD 850.00 invoice payable upon staging review on 2026-10-14.',
    { x: 48, y: 662, size: 10.5, font }
  );

  return doc.save();
}

function buildDeliveryEmailEml(): Uint8Array {
  const eml = [
    'From: Studio Lead <studio@demo-merchant.example>',
    'To: Client Buyer <buyer@demo-client.example>',
    'Subject: [DEMO] Production Website Handover & Credentials (SOW-DEMO-2026-104)',
    'Date: Wed, 14 Oct 2026 16:40:00 +0000',
    'Message-ID: <demo-delivery-20261014-001@demo-merchant.example>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'DEMO DATA — NOT A LIVE CUSTOMER RECORD.',
    '',
    'Hi Jordan,',
    '',
    'We have completed and deployed the Harborview Roasters website build under SOW-DEMO-2026-104 (USD 850.00).',
    'Production deployment URL: https://preview.harborview-demo.example',
    'Repository release tag: v1.0.0-handover (SHA256 release bundle delivered electronically).',
    '',
    'Please confirm once your team completes the final walkthrough.',
    '',
    'Regards,',
    'Northwind Web Studio'
  ].join('\r\n');

  return Buffer.from(eml, 'utf8');
}

function buildClientApprovalEml(): Uint8Array {
  const eml = [
    'From: Jordan Reyes <buyer@demo-client.example>',
    'To: Studio Lead <studio@demo-merchant.example>',
    'Subject: Re: [DEMO] Production Website Handover & Credentials (SOW-DEMO-2026-104)',
    'In-Reply-To: <demo-delivery-20261014-001@demo-merchant.example>',
    'Date: Thu, 15 Oct 2026 11:18:00 +0000',
    'Message-ID: <demo-approval-20261015-002@demo-client.example>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'DEMO DATA — NOT A LIVE CUSTOMER RECORD.',
    '',
    'Received and reviewed the live site this morning. All pages and checkout links look great and are approved.',
    'Thank you for delivering on schedule.',
    '',
    'Jordan'
  ].join('\r\n');

  return Buffer.from(eml, 'utf8');
}

function buildProjectActivityJson(): Uint8Array {
  const payload = {
    notice: 'DEMO DATA — NOT A LIVE CUSTOMER RECORD',
    project: 'SOW-DEMO-2026-104',
    amountUsd: '850.00',
    events: [
      {
        timestamp: '2026-10-02T10:15:00Z',
        event: 'KICKOFF_CONTRACT_SIGNED',
        actor: 'client_and_merchant',
        detail: 'Statement of work SOW-DEMO-2026-104 executed for USD 850.00 website build.'
      },
      {
        timestamp: '2026-10-10T18:05:00Z',
        event: 'STAGING_DEPLOYED',
        actor: 'merchant_engineer',
        detail: 'Staging environment deployed and shared for client QA review.'
      },
      {
        timestamp: '2026-10-14T16:35:00Z',
        event: 'PRODUCTION_HANDOVER_COMPLETED',
        actor: 'merchant_engineer',
        detail: 'Production release v1.0.0-handover deployed and DNS verified.'
      },
      {
        timestamp: '2026-10-15T11:20:00Z',
        event: 'CLIENT_SIGNOFF_LOGGED',
        actor: 'buyer_account',
        detail: 'Client logged in and confirmed production handover receipt.'
      }
    ]
  };
  return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
}

function buildCompletionNoteTxt(): Uint8Array {
  const txt = [
    'DEMO DATA — NOT A LIVE CUSTOMER RECORD',
    'Project Completion & Evidence Gap Note (SOW-DEMO-2026-104)',
    '',
    'Summary: Website development milestone (USD 850.00) was delivered electronically on 2026-10-14.',
    'Client Jordan Reyes acknowledged receipt and approved the deliverable via email on 2026-10-15.',
    '',
    'Evidence Gap Assessment:',
    '- Because this is a digital software service, there is NO physical courier tracking number.',
    '- When submitting PROOF_OF_FULFILLMENT to PayPal, bundle the signed SOW PDF and email handover/approval provenance summary into a PDF.',
    '- No separate signed PDF completion certificate exists beyond the approval email.'
  ].join('\n');
  return Buffer.from(txt, 'utf8');
}

export class DemoFixtureService {
  constructor(
    private readonly disputeRepo: DisputeRepository,
    private readonly evidenceRepo: EvidenceRepository,
    private readonly auditRepo: AuditRepository,
    private readonly evidenceService: EvidenceService
  ) {}

  async seedDemoScenario(actor: ActorContext): Promise<{
    disputeId: string;
    paypalDisputeId: string;
    assetCount: number;
    alreadySeeded: boolean;
  }> {
    assertAuthorized(actor, 'evidence:upload', actor.workspaceId);

    const existing = await this.disputeRepo.findByPayPalDisputeId(
      actor.workspaceId,
      DEMO_PAYPAL_DISPUTE_ID
    );
    if (existing) {
      const existingAssets = await this.evidenceRepo.listByWorkspace(actor.workspaceId, {
        disputeId: existing.id
      });
      return {
        disputeId: existing.id,
        paypalDisputeId: existing.paypalDisputeId,
        assetCount: existingAssets.length,
        alreadySeeded: true
      };
    }

    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const dispute = await this.disputeRepo.upsertDispute({
      workspaceId: actor.workspaceId,
      recordOrigin: 'DEMO_FIXTURE',
      paypalDisputeId: DEMO_PAYPAL_DISPUTE_ID,
      paypalTransactionId: 'TXN-DEMO-850-WEBSITE',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      rawStatus: 'WAITING_FOR_SELLER_RESPONSE',
      workflowStatus: 'WAITING_FOR_SELLER_RESPONSE',
      rawLifecycleStage: 'INQUIRY',
      lifecycleStage: 'INQUIRY',
      channel: 'DEMO_FIXTURE',
      amountMinor: 85000,
      currencyCode: 'USD',
      buyerDisplayLabel: 'DEMO DATA — Jordan Reyes (Harborview Roasters)',
      sellerResponseDueAt: dueAt,
      disputeCreatedAt: new Date('2026-10-28T09:00:00Z'),
      disputeUpdatedAt: new Date('2026-10-28T09:05:00Z'),
      outcomeCode: null,
      links: [],
      rawPayload: {
        demoBanner: 'DEMO DATA — NOT A LIVE CUSTOMER RECORD',
        dispute_id: DEMO_PAYPAL_DISPUTE_ID,
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
        status: 'WAITING_FOR_SELLER_RESPONSE',
        dispute_life_cycle_stage: 'INQUIRY',
        dispute_amount: { currency_code: 'USD', value: '850.00' }
      },
      lastSyncedAt: new Date()
    });

    await this.disputeRepo.replaceRequirements(actor.workspaceId, dispute.id, [
      {
        evidenceType: 'PROOF_OF_FULFILLMENT',
        source: 'DEMO_PAYPAL_REASON_GUIDANCE',
        isRequired: true,
        satisfied: false,
        rawRequirement: {
          note: 'DEMO DATA — Digital service delivery dossier recommended because courier tracking is N/A'
        }
      },
      {
        evidenceType: 'PROOF_OF_REFUND',
        source: 'DEMO_PAYPAL_REASON_GUIDANCE',
        isRequired: false,
        satisfied: false,
        rawRequirement: {
          note: 'Only applicable if merchant already refunded the buyer'
        }
      }
    ]);

    const contractPdf = await buildDemoContractPdf();
    const deliveryEml = buildDeliveryEmailEml();
    const approvalEml = buildClientApprovalEml();
    const activityJson = buildProjectActivityJson();
    const completionTxt = buildCompletionNoteTxt();

    const files = [
      {
        filename: 'website_development_contract.pdf',
        mimeType: 'application/pdf',
        bytes: contractPdf
      },
      {
        filename: 'delivery_handover.eml',
        mimeType: 'message/rfc822',
        bytes: deliveryEml
      },
      {
        filename: 'client_approval_reply.eml',
        mimeType: 'message/rfc822',
        bytes: approvalEml
      },
      {
        filename: 'project_activity_log.json',
        mimeType: 'application/json',
        bytes: activityJson
      },
      {
        filename: 'project_completion_note.txt',
        mimeType: 'text/plain',
        bytes: completionTxt
      }
    ];

    const uploadedAssetIds: Array<{ filename: string; id: string }> = [];
    for (const file of files) {
      const res = await this.evidenceService.uploadEvidence(actor, {
        disputeId: dispute.id,
        recordOrigin: 'DEMO_FIXTURE',
        filename: file.filename,
        declaredMimeType: file.mimeType,
        bytes: file.bytes
      });
      uploadedAssetIds.push({ filename: file.filename, id: res.asset.id });
    }

    const facts = await this.disputeRepo.listExtractedFacts(actor.workspaceId, dispute.id);
    const contractId = uploadedAssetIds.find((f) => f.filename.endsWith('.pdf'))?.id;
    const deliveryId = uploadedAssetIds.find((f) => f.filename === 'delivery_handover.eml')?.id;
    const approvalId = uploadedAssetIds.find((f) => f.filename === 'client_approval_reply.eml')?.id;
    const activityId = uploadedAssetIds.find((f) => f.filename === 'project_activity_log.json')?.id;

    const findFact = (assetId?: string) => facts.find((f) => f.sourceAssetId === assetId);

    const claims: Parameters<DisputeRepository['replaceClaimsWithSources']>[3] = [];
    if (contractId) {
      const f = findFact(contractId);
      claims.push({
        claimText:
          'DEMO DATA — Fixed USD 850.00 website development statement of work (SOW-DEMO-2026-104) specified electronic delivery without physical shipping.',
        category: 'VERIFIED_FACT',
        verificationStatus: 'VERIFIED',
        mappedEvidenceType: 'PROOF_OF_FULFILLMENT',
        sources: [
          {
            sourceAssetId: contractId,
            factId: f?.id ?? null,
            locator: f?.locator ?? {
              type: 'pdf_page',
              pageNumber: 2,
              textStart: 0,
              textEnd: 120
            }
          }
        ]
      });
    }
    if (deliveryId && activityId) {
      const df = findFact(deliveryId);
      const af = findFact(activityId);
      claims.push({
        claimText:
          'DEMO DATA — Production release v1.0.0-handover was delivered electronically on 2026-10-14T16:40:00Z with deployment logs confirming completion.',
        category: 'VERIFIED_FACT',
        verificationStatus: 'VERIFIED',
        mappedEvidenceType: 'PROOF_OF_FULFILLMENT',
        sources: [
          {
            sourceAssetId: deliveryId,
            factId: df?.id ?? null,
            locator: df?.locator ?? {
              type: 'email_message',
              messageId: '<demo-delivery-20261014-001@demo-merchant.example>',
              textStart: 0,
              textEnd: 120
            }
          },
          {
            sourceAssetId: activityId,
            factId: af?.id ?? null,
            locator: af?.locator ?? {
              type: 'json_path',
              jsonPath: '$.events[2]'
            }
          }
        ]
      });
    }
    if (approvalId) {
      const af = findFact(approvalId);
      claims.push({
        claimText:
          'DEMO DATA — Buyer explicitly confirmed receipt and approved the live site on 2026-10-15T11:18:00Z.',
        category: 'VERIFIED_FACT',
        verificationStatus: 'VERIFIED',
        mappedEvidenceType: 'PROOF_OF_FULFILLMENT',
        sources: [
          {
            sourceAssetId: approvalId,
            factId: af?.id ?? null,
            locator: af?.locator ?? {
              type: 'email_message',
              messageId: '<demo-approval-20261015-002@demo-client.example>',
              textStart: 0,
              textEnd: 120
            }
          }
        ]
      });
    }

    claims.push({
      claimText:
        'DEMO DATA — Missing physical carrier tracking number (N/A for digital software delivery) and missing formal signed acceptance certificate PDF.',
      category: 'MISSING_EVIDENCE',
      verificationStatus: 'UNSUPPORTED',
      mappedEvidenceType: 'PROOF_OF_FULFILLMENT',
      sources: []
    });

    await this.disputeRepo.replaceClaimsWithSources(actor.workspaceId, dispute.id, null, claims);

    await this.auditRepo.append({
      workspaceId: actor.workspaceId,
      disputeId: dispute.id,
      actorType: 'SYSTEM_WORKER',
      actorId: 'demo-seeder',
      action: 'demo.fixture_seeded',
      resourceType: 'dispute',
      resourceId: dispute.id,
      result: 'SUCCESS',
      metadata: {
        label: 'DEMO DATA — NOT A LIVE CUSTOMER RECORD',
        assetCount: uploadedAssetIds.length
      }
    });

    return {
      disputeId: dispute.id,
      paypalDisputeId: dispute.paypalDisputeId,
      assetCount: uploadedAssetIds.length,
      alreadySeeded: false
    };
  }
}

