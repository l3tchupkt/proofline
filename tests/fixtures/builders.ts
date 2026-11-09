import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function createSyntheticPdf(lines: string[], createdAt?: Date): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('PROOFLINE Synthetic Test PDF');
  if (createdAt) {
    doc.setCreationDate(createdAt);
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  let y = 740;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 11, font });
    y -= 18;
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export function createSyntheticEml(params: {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}): Buffer {
  const raw = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Date: ${params.date}`,
    `Message-ID: ${params.messageId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.body
  ].join('\r\n');
  return Buffer.from(raw, 'utf8');
}

export function createValid1x1PngBuffer(): Buffer {
  // Minimal valid 1x1 RGB PNG binary
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8ffff3f0005fe02fea73581840000000049454e44ae426082',
    'hex'
  );
}

export function createSpoofedMzExeBuffer(): Buffer {
  // Windows PE MZ magic header followed by arbitrary payload
  return Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('NOT_A_REAL_PDF')]);
}

export function createZipArchiveBuffer(): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('FAKE_ZIP_CONTENT')]);
}

