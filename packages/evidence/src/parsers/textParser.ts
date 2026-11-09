import type { SourceLocator } from '@proofline/domain';
import type {
  EvidenceChunk,
  EvidenceParser,
  EvidenceParserContext,
  ParsedEvidenceDocument
} from './types.js';

export class TextEvidenceParser implements EvidenceParser {
  public readonly parserVersion = 'text-v1.0.0';

  supports(mimeType: string, extension: string): boolean {
    return extension.toLowerCase() === 'txt' || mimeType.toLowerCase() === 'text/plain';
  }

  async extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>> {
    const text = Buffer.from(buffer).toString('utf8');
    const lines = text.split(/\r?\n/);
    return {
      lineCount: lines.length,
      characterCount: text.length
    };
  }

  async parse(buffer: Uint8Array, _context: EvidenceParserContext): Promise<ParsedEvidenceDocument> {
    const text = Buffer.from(buffer).toString('utf8');
    const lines = text.split(/\r?\n/);
    const chunks: EvidenceChunk[] = [];
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();
      const textStart = offset;
      const textEnd = offset + line.length;
      offset = textEnd + 1;

      if (trimmed.length > 0) {
        chunks.push({
          text: trimmed,
          locator: {
            type: 'text_range',
            lineStart: i + 1,
            lineEnd: i + 1,
            textStart,
            textEnd,
            excerpt: trimmed.slice(0, 240)
          },
          timestamp: null
        });
      }
    }

    return {
      parserVersion: this.parserVersion,
      extractedText: text,
      metadata: {
        lineCount: lines.length,
        characterCount: text.length
      },
      documentCreatedAt: null,
      chunks,
      isOcrDerived: false,
      needsReview: false
    };
  }

  getSourceLocations(parsed: ParsedEvidenceDocument): SourceLocator[] {
    return parsed.chunks.map((c) => c.locator);
  }
}

