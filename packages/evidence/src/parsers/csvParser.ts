import { parse as parseCsvSync } from 'csv-parse/sync';
import type { SourceLocator } from '@proofline/domain';
import type {
  EvidenceChunk,
  EvidenceParser,
  EvidenceParserContext,
  ParsedEvidenceDocument
} from './types.js';

export class CsvEvidenceParser implements EvidenceParser {
  public readonly parserVersion = 'csv-v1.0.0';

  supports(mimeType: string, extension: string): boolean {
    return extension.toLowerCase() === 'csv' || mimeType.toLowerCase() === 'text/csv';
  }

  async extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>> {
    const raw = Buffer.from(buffer).toString('utf8');
    const records = parseCsvSync(raw, { columns: true, skip_empty_lines: true }) as Array<
      Record<string, string>
    >;
    const firstRow = records[0];
    return {
      rowCount: records.length,
      columns: firstRow ? Object.keys(firstRow) : []
    };
  }

  async parse(buffer: Uint8Array, _context: EvidenceParserContext): Promise<ParsedEvidenceDocument> {
    const raw = Buffer.from(buffer).toString('utf8');
    const records = parseCsvSync(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<Record<string, string>>;

    const columns = records[0] ? Object.keys(records[0]) : [];
    const chunks: EvidenceChunk[] = [];
    const lines: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i] ?? {};
      const rowText = Object.entries(row)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
      lines.push(`[Row ${i + 1}] ${rowText}`);

      const possibleTimestamp =
        row.timestamp ?? row.date ?? row.created_at ?? row.occurred_at ?? row.delivered_at;
      const parsedDate =
        possibleTimestamp && !Number.isNaN(new Date(possibleTimestamp).getTime())
          ? new Date(possibleTimestamp)
          : null;

      chunks.push({
        text: rowText,
        locator: {
          type: 'csv_row',
          rowIndex: i + 1,
          columnNames: columns,
          excerpt: rowText.slice(0, 240)
        },
        timestamp: parsedDate
      });
    }

    return {
      parserVersion: this.parserVersion,
      extractedText: lines.join('\n'),
      metadata: {
        rowCount: records.length,
        columns
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

