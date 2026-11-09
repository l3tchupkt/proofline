import type { SourceLocator } from '@proofline/domain';
import type {
  EvidenceChunk,
  EvidenceParser,
  EvidenceParserContext,
  ParsedEvidenceDocument
} from './types.js';

function tryParseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class JsonEvidenceParser implements EvidenceParser {
  public readonly parserVersion = 'json-v1.0.0';

  supports(mimeType: string, extension: string): boolean {
    return extension.toLowerCase() === 'json' || mimeType.toLowerCase() === 'application/json';
  }

  async extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>> {
    const parsed = JSON.parse(Buffer.from(buffer).toString('utf8')) as unknown;
    const isArray = Array.isArray(parsed);
    return {
      rootType: isArray ? 'array' : typeof parsed,
      topLevelKeys:
        !isArray && parsed && typeof parsed === 'object' ? Object.keys(parsed) : undefined,
      length: isArray ? parsed.length : undefined
    };
  }

  async parse(buffer: Uint8Array, _context: EvidenceParserContext): Promise<ParsedEvidenceDocument> {
    const rawText = Buffer.from(buffer).toString('utf8');
    const parsed = JSON.parse(rawText) as unknown;

    const chunks: EvidenceChunk[] = [];
    const lines: string[] = [];
    let earliestTimestamp: Date | null = null;

    const visit = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          visit(node[i], `${path}[${i}]`);
        }
        return;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        const tsCandidate =
          record.timestamp ??
          record.occurredAt ??
          record.occurred_at ??
          record.createdAt ??
          record.created_at ??
          record.date;
        const ts = tryParseDate(tsCandidate);
        if (ts && (!earliestTimestamp || ts < earliestTimestamp)) {
          earliestTimestamp = ts;
        }

        const leafPairs = Object.entries(record)
          .filter(([, v]) => v === null || typeof v !== 'object')
          .map(([k, v]) => `${k}=${String(v)}`);

        if (leafPairs.length > 0) {
          const text = leafPairs.join(', ');
          lines.push(`${path}: ${text}`);
          chunks.push({
            text,
            locator: {
              type: 'json_path',
              jsonPath: path,
              timestamp: ts?.toISOString(),
              excerpt: text.slice(0, 240)
            },
            timestamp: ts
          });
        }

        for (const [k, v] of Object.entries(record)) {
          if (v && typeof v === 'object') {
            visit(v, `${path}.${k}`);
          }
        }
      }
    };

    visit(parsed, '$');

    return {
      parserVersion: this.parserVersion,
      extractedText: lines.join('\n') || rawText,
      metadata: await this.extractMetadata(buffer),
      documentCreatedAt: earliestTimestamp,
      chunks,
      isOcrDerived: false,
      needsReview: false
    };
  }

  getSourceLocations(parsed: ParsedEvidenceDocument): SourceLocator[] {
    return parsed.chunks.map((c) => c.locator);
  }
}

