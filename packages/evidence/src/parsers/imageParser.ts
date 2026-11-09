import type { SourceLocator } from '@proofline/domain';
import type {
  EvidenceChunk,
  EvidenceParser,
  EvidenceParserContext,
  ParsedEvidenceDocument
} from './types.js';

export type ImageOcrProvider = (params: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}) => Promise<{ extractedText: string; method: 'ocr' | 'vision' }>;

function readPngDimensions(buf: Uint8Array): { width?: number; height?: number } {
  if (buf.length < 24) return {};
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false)
  };
}

function readJpegDimensions(buf: Uint8Array): { width?: number; height?: number } {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === undefined) break;
    // SOF0..SOF3
    if (marker >= 0xc0 && marker <= 0xc3) {
      const view = new DataView(buf.buffer, buf.byteOffset + i + 5, 4);
      return {
        height: view.getUint16(0, false),
        width: view.getUint16(2, false)
      };
    }
    const segLen = ((buf[i + 2] ?? 0) << 8) + (buf[i + 3] ?? 0);
    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return {};
}

export class ImageEvidenceParser implements EvidenceParser {
  public readonly parserVersion = 'image-v1.0.0';

  constructor(private readonly ocrProvider?: ImageOcrProvider) {}

  supports(mimeType: string, extension: string): boolean {
    const ext = extension.toLowerCase();
    const mime = mimeType.toLowerCase();
    return (
      ext === 'png' ||
      ext === 'jpg' ||
      ext === 'jpeg' ||
      mime === 'image/png' ||
      mime === 'image/jpeg'
    );
  }

  async extractMetadata(buffer: Uint8Array): Promise<Record<string, unknown>> {
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    const dims = isPng ? readPngDimensions(buffer) : readJpegDimensions(buffer);
    return {
      format: isPng ? 'png' : 'jpeg',
      width: dims.width ?? null,
      height: dims.height ?? null,
      ocrConfigured: Boolean(this.ocrProvider)
    };
  }

  async parse(buffer: Uint8Array, context: EvidenceParserContext): Promise<ParsedEvidenceDocument> {
    const meta = await this.extractMetadata(buffer);
    const width = typeof meta.width === 'number' ? meta.width : undefined;
    const height = typeof meta.height === 'number' ? meta.height : undefined;

    let extractedText = `[Image Attachment: ${context.filename}${width && height ? ` (${width}x${height})` : ''}]`;
    let method: 'ocr' | 'vision' | 'metadata' = 'metadata';

    if (this.ocrProvider) {
      const ocrResult = await this.ocrProvider({
        bytes: buffer,
        mimeType: context.mimeType,
        filename: context.filename
      });
      if (ocrResult.extractedText.trim()) {
        extractedText = ocrResult.extractedText.trim();
        method = ocrResult.method;
      }
    }

    const chunks: EvidenceChunk[] = [
      {
        text: extractedText,
        locator: {
          type: 'image_ocr',
          width,
          height,
          extractionMethod: method,
          excerpt: extractedText.slice(0, 240)
        },
        timestamp: null
      }
    ];

    // OCR/image-derived claims always require manual merchant review.
    return {
      parserVersion: this.parserVersion,
      extractedText,
      metadata: meta,
      documentCreatedAt: null,
      chunks,
      isOcrDerived: true,
      needsReview: true
    };
  }

  getSourceLocations(parsed: ParsedEvidenceDocument): SourceLocator[] {
    return parsed.chunks.map((c) => c.locator);
  }
}

