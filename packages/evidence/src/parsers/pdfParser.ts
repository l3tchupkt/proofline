import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SourceLocator } from '@proofline/domain';
import type {
  EvidenceChunk,
  EvidenceParser,
  EvidenceParserContext,
  ParsedEvidenceDocument
} from './types.js';

const require = createRequire(import.meta.url);
try {
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
} catch {
  // Fallback: pdfjs runs without explicit workerSrc if bundled differently
}

function parsePdfDate(rawDate: unknown): Date | null {
  if (typeof rawDate !== 'string') return null;
  // Format: D:YYYYMMDDHHmmSS...
  const match = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(rawDate);
  if (!match) {
    const fallback = new Date(rawDate);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const year = Number(match[1]);
  const month = Number(match[2] ?? '1') - 1;
  const day = Number(match[3] ?? '1');
  const hour = Number(match[4] ?? '0');
  const minute = Number(match[5] ?? '0');
  const second = Number(match[6] ?? '0');
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

export class PdfEvidenceParser implements EvidenceParser {
  public readonly parserVersion = 'pdfjs-v1.0.0';

  supports(mimeType: string, extension: string): boolean {
    return extension.toLowerCase() === 'pdf' || mimeType.toLowerCase() === 'application/pdf';
  }

  async extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      verbosity: 0
    });
    const doc = await loadingTask.promise;
    try {
      const meta = await doc.getMetadata();
      const info = (meta.info ?? {}) as Record<string, unknown>;
      return {
        pageCount: doc.numPages,
        title: typeof info.Title === 'string' ? info.Title : null,
        author: typeof info.Author === 'string' ? info.Author : null,
        creationDate: typeof info.CreationDate === 'string' ? info.CreationDate : null,
        producer: typeof info.Producer === 'string' ? info.Producer : null
      };
    } finally {
      await doc.cleanup();
      await loadingTask.destroy();
    }
  }

  async parse(buffer: Uint8Array, _context: EvidenceParserContext): Promise<ParsedEvidenceDocument> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      verbosity: 0
    });
    const doc = await loadingTask.promise;

    try {
      const meta = await doc.getMetadata();
      const info = (meta.info ?? {}) as Record<string, unknown>;
      const documentCreatedAt = parsePdfDate(info.CreationDate);

      const chunks: EvidenceChunk[] = [];
      const pageTexts: string[] = [];
      let runningOffset = 0;

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const header = `[Page ${pageNumber}] `;
        const fullPageBlock = `${header}${pageText}`;
        const textStart = runningOffset + header.length;
        const textEnd = runningOffset + fullPageBlock.length;

        chunks.push({
          text: pageText,
          locator: {
            type: 'pdf_page',
            pageNumber,
            textStart,
            textEnd,
            excerpt: pageText.slice(0, 240)
          },
          timestamp: documentCreatedAt
        });

        pageTexts.push(fullPageBlock);
        runningOffset += fullPageBlock.length + 1; // +1 for newline join
      }

      return {
        parserVersion: this.parserVersion,
        extractedText: pageTexts.join('\n'),
        metadata: {
          pageCount: doc.numPages,
          title: typeof info.Title === 'string' ? info.Title : null,
          author: typeof info.Author === 'string' ? info.Author : null,
          rawCreationDate: typeof info.CreationDate === 'string' ? info.CreationDate : null
        },
        documentCreatedAt,
        chunks,
        isOcrDerived: false,
        needsReview: pageTexts.every((p) => p.replace(/^\[Page \d+\]\s*/, '').length === 0)
      };
    } finally {
      await doc.cleanup();
      await loadingTask.destroy();
    }
  }

  getSourceLocations(parsed: ParsedEvidenceDocument): SourceLocator[] {
    return parsed.chunks.map((c) => c.locator);
  }
}

