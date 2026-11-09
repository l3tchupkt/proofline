import { DomainError } from '@proofline/domain';
import { CsvEvidenceParser } from './parsers/csvParser.js';
import { EmailEvidenceParser } from './parsers/emailParser.js';
import { ImageEvidenceParser, type ImageOcrProvider } from './parsers/imageParser.js';
import { JsonEvidenceParser } from './parsers/jsonParser.js';
import { PdfEvidenceParser } from './parsers/pdfParser.js';
import { TextEvidenceParser } from './parsers/textParser.js';
import type { EvidenceParser, ParsedEvidenceDocument } from './parsers/types.js';

export * from './hashing/sha256.js';
export * from './validation.js';
export * from './storage.js';
export * from './provenance/promptInjection.js';
export * from './parsers/types.js';
export * from './parsers/pdfParser.js';
export * from './parsers/emailParser.js';
export * from './parsers/csvParser.js';
export * from './parsers/jsonParser.js';
export * from './parsers/textParser.js';
export * from './parsers/imageParser.js';
export * from './extractors/factExtractor.js';
export * from './bundling/pdfBundle.js';

export class EvidenceParserRegistry {
  private readonly parsers: EvidenceParser[];

  constructor(ocrProvider?: ImageOcrProvider) {
    this.parsers = [
      new PdfEvidenceParser(),
      new EmailEvidenceParser(),
      new CsvEvidenceParser(),
      new JsonEvidenceParser(),
      new TextEvidenceParser(),
      new ImageEvidenceParser(ocrProvider)
    ];
  }

  resolveParser(mimeType: string, extension: string): EvidenceParser {
    const parser = this.parsers.find((p) => p.supports(mimeType, extension));
    if (!parser) {
      throw new DomainError(
        'NO_EVIDENCE_PARSER',
        `No evidence parser registered for MIME "${mimeType}" and extension ".${extension}".`
      );
    }
    return parser;
  }

  async parseEvidence(params: {
    buffer: Uint8Array;
    filename: string;
    mimeType: string;
    extension: string;
  }): Promise<ParsedEvidenceDocument> {
    const parser = this.resolveParser(params.mimeType, params.extension);
    return parser.parse(params.buffer, {
      filename: params.filename,
      mimeType: params.mimeType,
      extension: params.extension
    });
  }
}

