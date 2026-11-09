import type { SourceLocator } from '@proofline/domain';

export interface EvidenceChunk {
  text: string;
  locator: SourceLocator;
  timestamp?: Date | null;
}

export interface ParsedEvidenceDocument {
  parserVersion: string;
  extractedText: string;
  metadata: Record<string, unknown>;
  documentCreatedAt: Date | null;
  chunks: EvidenceChunk[];
  isOcrDerived: boolean;
  needsReview: boolean;
}

export interface EvidenceParserContext {
  filename: string;
  mimeType: string;
  extension: string;
}

export interface EvidenceParser {
  readonly parserVersion: string;
  supports(mimeType: string, extension: string): boolean;
  parse(buffer: Uint8Array, context: EvidenceParserContext): Promise<ParsedEvidenceDocument>;
  extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>>;
  getSourceLocations(parsed: ParsedEvidenceDocument): SourceLocator[];
}

