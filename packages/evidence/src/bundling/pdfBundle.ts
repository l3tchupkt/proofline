import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface EvidenceBundleEntry {
  filename: string;
  sha256Hash: string;
  receivedAtIso: string;
  documentCreatedAtIso: string | null;
  excerpt: string;
}

export interface EvidenceBundleInput {
  paypalDisputeId: string;
  reason: string;
  evidenceType: string;
  responseNotes: string;
  entries: EvidenceBundleEntry[];
}

function toSafeWinAnsi(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2192/g, '->')
    .replace(/[^\x20-\x7E\xA0-\xFF\r\n]/g, ' ');
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = toSafeWinAnsi(text).replace(/\r/g, '').split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildEvidenceBundlePdf(input: EvidenceBundleInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  let page = pdfDoc.addPage([612, 792]);
  let y = 740;

  const ensureSpace = (needed: number) => {
    if (y - needed < 56) {
      page = pdfDoc.addPage([612, 792]);
      y = 740;
    }
  };

  page.drawText('PROOFLINE EVIDENCE PROVENANCE SUMMARY', {
    x: 48,
    y,
    size: 14,
    font: bold,
    color: rgb(0.106, 0.231, 0.435)
  });
  y -= 22;

  const metaLines = [
    toSafeWinAnsi(`Dispute ID: ${input.paypalDisputeId}`),
    toSafeWinAnsi(`Dispute Reason: ${input.reason}`),
    toSafeWinAnsi(`PayPal Evidence Type: ${input.evidenceType}`),
    `Bundle Generated (UTC): ${new Date().toISOString()}`
  ];

  for (const line of metaLines) {
    page.drawText(line, { x: 48, y, size: 10, font: mono, color: rgb(0.1, 0.12, 0.15) });
    y -= 15;
  }

  y -= 10;
  page.drawText('Merchant Response Summary', { x: 48, y, size: 12, font: bold });
  y -= 16;

  for (const line of wrapLines(input.responseNotes, 84)) {
    ensureSpace(14);
    page.drawText(line, { x: 48, y, size: 10, font });
    y -= 14;
  }

  y -= 14;
  ensureSpace(30);
  page.drawText('Verified Source Evidence Manifest', { x: 48, y, size: 12, font: bold });
  y -= 18;

  for (const entry of input.entries) {
    ensureSpace(70);
    page.drawText(toSafeWinAnsi(`File: ${entry.filename}`), { x: 48, y, size: 10, font: bold });
    y -= 13;
    page.drawText(toSafeWinAnsi(`SHA-256: ${entry.sha256Hash}`), { x: 48, y, size: 8.5, font: mono });
    y -= 12;
    page.drawText(
      toSafeWinAnsi(
        `Received: ${entry.receivedAtIso} | Document Timestamp: ${entry.documentCreatedAtIso ?? 'Not embedded'}`
      ),
      { x: 48, y, size: 8.5, font: mono }
    );
    y -= 13;

    for (const excerptLine of wrapLines(entry.excerpt.slice(0, 500), 86)) {
      ensureSpace(12);
      page.drawText(excerptLine, { x: 56, y, size: 9, font });
      y -= 12;
    }
    y -= 10;
  }

  return pdfDoc.save();
}
