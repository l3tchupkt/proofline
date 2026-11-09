import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DomainError } from '@proofline/domain';

export interface EvidenceStorage {
  driver: 'local' | 's3';
  putObject(key: string, data: Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; detail: string }>;
}

export class LocalPrivateStorage implements EvidenceStorage {
  public readonly driver = 'local' as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  private resolveSafePath(key: string): string {
    const cleaned = key.replace(/^\/+/, '');
    const target = resolve(this.rootDir, cleaned);
    if (!target.startsWith(`${this.rootDir}\\`) && !target.startsWith(`${this.rootDir}/`) && target !== this.rootDir) {
      throw new DomainError('INVALID_STORAGE_KEY', 'Storage key escapes private storage root.', 400);
    }
    return target;
  }

  async putObject(key: string, data: Uint8Array): Promise<void> {
    const target = this.resolveSafePath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data, { flag: 'wx' }).catch(async (err: NodeJS.ErrnoException) => {
      if (err.code === 'EEXIST') {
        await writeFile(target, data);
        return;
      }
      throw err;
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const target = this.resolveSafePath(key);
    return readFile(target);
  }

  async deleteObject(key: string): Promise<void> {
    const target = this.resolveSafePath(key);
    await rm(target, { force: true });
  }

  async healthCheck(): Promise<{ healthy: boolean; detail: string }> {
    try {
      await mkdir(this.rootDir, { recursive: true });
      return { healthy: true, detail: `Local private storage writable at ${this.rootDir}` };
    } catch (error) {
      return {
        healthy: false,
        detail: error instanceof Error ? error.message : 'Storage directory unavailable'
      };
    }
  }
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Lightweight AWS SigV4 S3-compatible object storage adapter for Render / S3-compatible buckets.
 */
export class S3CompatibleStorage implements EvidenceStorage {
  public readonly driver = 's3' as const;

  constructor(private readonly config: S3StorageConfig) {}

  private signHeaders(method: 'GET' | 'PUT' | 'DELETE' | 'HEAD', key: string, payloadHash: string, contentType?: string) {
    const endpointUrl = new URL(this.config.endpoint);
    const isLocalHost =
      endpointUrl.hostname === 'localhost' || endpointUrl.hostname === '127.0.0.1';
    if (endpointUrl.protocol !== 'https:' && !isLocalHost) {
      throw new DomainError(
        'INSECURE_STORAGE_ENDPOINT',
        'S3-compatible evidence storage endpoint must use HTTPS.',
        400
      );
    }
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const encodedKey = key
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    const basePath = endpointUrl.pathname.replace(/\/+$/, '');
    const canonicalUri = `${basePath}/${encodeURIComponent(this.config.bucket)}/${encodedKey}`.replace(
      /\/{2,}/g,
      '/'
    );
    const host = endpointUrl.host;

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate
    };
    if (contentType) {
      headers['content-type'] = contentType;
    }

    const sortedKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k]}\n`).join('');
    const signedHeaders = sortedKeys.join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join(
      '\n'
    );

    const kDate = hmacSha256(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, this.config.region);
    const kService = hmacSha256(kRegion, 's3');
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      fullUrl: `${endpointUrl.origin}${canonicalUri}`,
      headers
    };
  }

  async putObject(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const payloadHash = sha256Hex(data);
    const signed = this.signHeaders('PUT', key, payloadHash, contentType);
    const response = await fetch(signed.fullUrl, {
      method: 'PUT',
      headers: signed.headers,
      body: Buffer.from(data)
    });
    if (!response.ok) {
      throw new DomainError('S3_UPLOAD_FAILED', `S3 putObject failed (${response.status}).`, 502);
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const payloadHash = sha256Hex('');
    const signed = this.signHeaders('GET', key, payloadHash);
    const response = await fetch(signed.fullUrl, {
      method: 'GET',
      headers: signed.headers
    });
    if (!response.ok) {
      throw new DomainError('S3_DOWNLOAD_FAILED', `S3 getObject failed (${response.status}).`, 502);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async deleteObject(key: string): Promise<void> {
    const payloadHash = sha256Hex('');
    const signed = this.signHeaders('DELETE', key, payloadHash);
    const response = await fetch(signed.fullUrl, {
      method: 'DELETE',
      headers: signed.headers
    });
    if (!response.ok && response.status !== 404) {
      throw new DomainError('S3_DELETE_FAILED', `S3 deleteObject failed (${response.status}).`, 502);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; detail: string }> {
    const configured = Boolean(
      this.config.bucket &&
        this.config.region &&
        this.config.endpoint &&
        this.config.accessKeyId &&
        this.config.secretAccessKey
    );
    return {
      healthy: configured,
      detail: configured
        ? `S3-compatible storage configured for bucket ${this.config.bucket}`
        : 'S3 storage credentials incomplete'
    };
  }
}

