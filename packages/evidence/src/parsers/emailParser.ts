import { simpleParser } from 'mailparser';
import type { SourceLocator } from '@proofline/domain';
import type {
  EvidenceChunk,
  EvidenceParser,
  EvidenceParserContext,
  ParsedEvidenceDocument
} from './types.js';

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class EmailEvidenceParser implements EvidenceParser {
  public readonly parserVersion = 'mailparser-v1.0.0';

  supports(mimeType: string, extension: string): boolean {
    return extension.toLowerCase() === 'eml' || mimeType.toLowerCase() === 'message/rfc822';
  }

  async extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>> {
    const parsed = await simpleParser(Buffer.from(buffer));
    return {
      messageId: parsed.messageId ?? null,
      subject: parsed.subject ?? null,
      from: parsed.from?.text ?? null,
      to: Array.isArray(parsed.to)
        ? parsed.to.map((addr) => addr.text).join(', ')
        : (parsed.to?.text ?? null),
      date: parsed.date ? parsed.date.toISOString() : null,
      attachmentCount: parsed.attachments.length
    };
  }

  async parse(buffer: Uint8Array, context: EvidenceParserContext): Promise<ParsedEvidenceDocument> {
    const parsed = await simpleParser(Buffer.from(buffer));
    const messageId = parsed.messageId ?? `generated-${context.filename}`;
    const sender = parsed.from?.text ?? undefined;
    const recipient = Array.isArray(parsed.to)
      ? parsed.to.map((addr) => addr.text).join(', ')
      : parsed.to?.text;
    const subject = parsed.subject ?? undefined;
    const sentDate = parsed.date ?? null;

    const rawBody =
      parsed.text?.trim() || (typeof parsed.html === 'string' ? stripHtmlTags(parsed.html) : '');

    const headerSummary = [
      `From: ${sender ?? 'unknown'}`,
      `To: ${recipient ?? 'unknown'}`,
      `Subject: ${subject ?? '(no subject)'}`,
      `Date: ${sentDate ? sentDate.toISOString() : 'unknown'}`,
      `Message-ID: ${messageId}`
    ].join('\n');

    const fullText = `${headerSummary}\n\n${rawBody}`;
    const bodyStart = headerSummary.length + 2;

    // Split email body into message segments / paragraphs for granular provenance locators
    const segments = rawBody
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: EvidenceChunk[] = [];
    let searchCursor = bodyStart;

    if (segments.length === 0) {
      chunks.push({
        text: rawBody,
        locator: {
          type: 'email_message',
          messageId,
          sender,
          recipient,
          subject,
          sentAt: sentDate?.toISOString(),
          textStart: bodyStart,
          textEnd: fullText.length,
          excerpt: rawBody.slice(0, 240)
        },
        timestamp: sentDate
      });
    } else {
      for (const segment of segments) {
        const idx = fullText.indexOf(segment, searchCursor);
        const textStart = idx >= 0 ? idx : searchCursor;
        const textEnd = textStart + segment.length;
        searchCursor = textEnd;

        chunks.push({
          text: segment,
          locator: {
            type: 'email_message',
            messageId,
            sender,
            recipient,
            subject,
            sentAt: sentDate?.toISOString(),
            textStart,
            textEnd,
            excerpt: segment.slice(0, 240)
          },
          timestamp: sentDate
        });
      }
    }

    return {
      parserVersion: this.parserVersion,
      extractedText: fullText,
      metadata: {
        messageId,
        sender: sender ?? null,
        recipient: recipient ?? null,
        subject: subject ?? null,
        sentAt: sentDate?.toISOString() ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        attachmentFilenames: parsed.attachments.map((a) => a.filename).filter(Boolean)
      },
      documentCreatedAt: sentDate,
      chunks,
      isOcrDerived: false,
      needsReview: false
    };
  }

  getSourceLocations(parsed: ParsedEvidenceDocument): SourceLocator[] {
    return parsed.chunks.map((c) => c.locator);
  }
}

