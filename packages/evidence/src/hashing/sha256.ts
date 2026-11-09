import { createHash } from 'node:crypto';

export function computeSha256Hex(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

