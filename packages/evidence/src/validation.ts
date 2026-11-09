import { DomainError } from '@proofline/domain';

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  'pdf',
  'eml',
  'txt',
  'csv',
  'json',
  'png',
  'jpg',
  'jpeg'
] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

export const MAX_EVIDENCE_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB ingestion limit; PayPal attachments enforce < 10 MB

const REJECTED_EXECUTABLE_AND_ARCHIVE_EXTENSIONS = new Set([
  'exe',
  'dll',
  'so',
  'dylib',
  'bat',
  'cmd',
  'ps1',
  'sh',
  'msi',
  'vbs',
  'js',
  'mjs',
  'cjs',
  'jar',
  'apk',
  'zip',
  'tar',
  'gz',
  'tgz',
  '7z',
  'rar',
  'bz2',
  'xz',
  'iso',
  'html',
  'htm',
  'svg'
]);

const EXTENSION_MIME_ALLOWLIST: Record<SupportedUploadExtension, string[]> = {
  pdf: ['application/pdf'],
  eml: ['message/rfc822', 'application/octet-stream', 'text/plain'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  json: ['application/json', 'text/json', 'text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg']
};

function startsWithBytes(buf: Uint8Array, prefix: number[]): boolean {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buf[i] !== prefix[i]) return false;
  }
  return true;
}

function hasExecutableOrArchiveSignature(buf: Uint8Array): string | null {
  // Windows PE / MZ executable
  if (startsWithBytes(buf, [0x4d, 0x5a])) return 'PE/MZ executable signature detected';
  // Linux ELF
  if (startsWithBytes(buf, [0x7f, 0x45, 0x4c, 0x46])) return 'ELF binary signature detected';
  // Mach-O
  if (
    startsWithBytes(buf, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWithBytes(buf, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWithBytes(buf, [0xcf, 0xfa, 0xed, 0xfe])
  ) {
    return 'Mach-O binary signature detected';
  }
  // ZIP / JAR / APK / Office OpenXML archive
  if (startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWithBytes(buf, [0x50, 0x4b, 0x05, 0x06])) {
    return 'ZIP archive signature detected';
  }
  // GZIP
  if (startsWithBytes(buf, [0x1f, 0x8b])) return 'GZIP archive signature detected';
  // RAR
  if (startsWithBytes(buf, [0x52, 0x61, 0x72, 0x21])) return 'RAR archive signature detected';
  // 7z
  if (startsWithBytes(buf, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return '7z archive signature detected';
  }
  return null;
}

function hasNullBytes(buf: Uint8Array): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x00) return true;
  }
  return false;
}

export interface ValidatedUploadFile {
  safeFilename: string;
  extension: SupportedUploadExtension;
  normalizedMimeType: string;
  byteSize: number;
}

export function sanitizeFilename(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? 'evidence';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'evidence.bin';
}

export function validateEvidenceUpload(params: {
  filename: string;
  declaredMimeType: string;
  bytes: Uint8Array;
}): ValidatedUploadFile {
  const safeFilename = sanitizeFilename(params.filename);
  const dotIdx = safeFilename.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === safeFilename.length - 1) {
    throw new DomainError(
      'UNSUPPORTED_FILE_EXTENSION',
      'Uploaded file must include a supported file extension (.pdf, .eml, .txt, .csv, .json, .png, .jpg, .jpeg).'
    );
  }

  const extRaw = safeFilename.slice(dotIdx + 1).toLowerCase();
  if (REJECTED_EXECUTABLE_AND_ARCHIVE_EXTENSIONS.has(extRaw)) {
    throw new DomainError(
      'MALICIOUS_OR_ARCHIVE_FILE_REJECTED',
      `File type ".${extRaw}" is rejected because executables, scripts, HTML, and archives are not permitted.`
    );
  }

  if (!(SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extRaw)) {
    throw new DomainError(
      'UNSUPPORTED_FILE_EXTENSION',
      `File extension ".${extRaw}" is not supported. Allowed: ${SUPPORTED_UPLOAD_EXTENSIONS.join(', ')}.`
    );
  }

  const extension = extRaw as SupportedUploadExtension;

  if (params.bytes.byteLength <= 0) {
    throw new DomainError('EMPTY_EVIDENCE_FILE', 'Uploaded evidence file is empty.');
  }
  if (params.bytes.byteLength > MAX_EVIDENCE_UPLOAD_BYTES) {
    throw new DomainError(
      'EVIDENCE_FILE_TOO_LARGE',
      `Uploaded file (${params.bytes.byteLength} bytes) exceeds maximum allowed ingestion size (${MAX_EVIDENCE_UPLOAD_BYTES} bytes).`
    );
  }

  const normalizedDeclaredMime = params.declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const allowedMimes = EXTENSION_MIME_ALLOWLIST[extension];
  if (
    normalizedDeclaredMime &&
    normalizedDeclaredMime !== 'application/octet-stream' &&
    !allowedMimes.includes(normalizedDeclaredMime)
  ) {
    throw new DomainError(
      'MIME_TYPE_MISMATCH',
      `Declared MIME type "${normalizedDeclaredMime}" does not match ".${extension}".`
    );
  }

  const dangerousSig = hasExecutableOrArchiveSignature(params.bytes);
  if (dangerousSig) {
    throw new DomainError(
      'MALICIOUS_FILE_SIGNATURE',
      `Rejected upload "${safeFilename}": ${dangerousSig}.`
    );
  }

  // Magic byte verification per supported extension
  if (extension === 'pdf') {
    const header = Buffer.from(params.bytes.subarray(0, 16)).toString('ascii');
    if (!header.trimStart().startsWith('%PDF-')) {
      throw new DomainError(
        'INVALID_PDF_SIGNATURE',
        `File "${safeFilename}" does not contain a valid %PDF- signature.`
      );
    }
  } else if (extension === 'png') {
    if (!startsWithBytes(params.bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      throw new DomainError(
        'INVALID_PNG_SIGNATURE',
        `File "${safeFilename}" does not contain a valid PNG signature.`
      );
    }
  } else if (extension === 'jpg' || extension === 'jpeg') {
    if (!startsWithBytes(params.bytes, [0xff, 0xd8, 0xff])) {
      throw new DomainError(
        'INVALID_JPEG_SIGNATURE',
        `File "${safeFilename}" does not contain a valid JPEG signature.`
      );
    }
  } else {
    // Text-based formats (.txt, .csv, .json, .eml)
    if (hasNullBytes(params.bytes)) {
      throw new DomainError(
        'BINARY_CONTENT_IN_TEXT_FILE',
        `File "${safeFilename}" contains binary null bytes and was rejected.`
      );
    }
    if (extension === 'json') {
      const text = Buffer.from(params.bytes).toString('utf8');
      try {
        JSON.parse(text);
      } catch {
        throw new DomainError(
          'INVALID_JSON_EVIDENCE',
          `File "${safeFilename}" is not valid JSON.`
        );
      }
    }
  }

  const canonicalMime: Record<SupportedUploadExtension, string> = {
    pdf: 'application/pdf',
    eml: 'message/rfc822',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg'
  };

  return {
    safeFilename,
    extension,
    normalizedMimeType: canonicalMime[extension],
    byteSize: params.bytes.byteLength
  };
}

