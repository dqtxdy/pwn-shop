import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { EvidenceKind } from '../../domain/enums';
import { StorageProvider } from '../../application/ports/external-services';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

const sanitizeSegment = (value: string) => {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return cleaned || 'unnamed';
};

const decodeBase64 = (value: string): Buffer => {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const normalized = base64.replace(/\s/g, '');

  if (!normalized || normalized.length % 4 === 1 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('Evidence payload must be valid base64');
  }

  return Buffer.from(normalized, 'base64');
};

export class FileSystemStorageProvider implements StorageProvider {
  private readonly rootDir: string;
  private readonly maxBytes: number;

  constructor() {
    this.rootDir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? '.local-object-storage/evidence');
    this.maxBytes = Number.parseInt(process.env.STORAGE_MAX_BYTES ?? `${DEFAULT_MAX_BYTES}`, 10);
  }

  async storeEvidence(input: {
    assetId: string;
    uploadedBy: string;
    kind: EvidenceKind;
    fileName: string;
    bytesBase64: string;
  }): Promise<{ uri: string; contentHash: string }> {
    const bytes = decodeBase64(input.bytesBase64);

    if (bytes.length === 0) {
      throw new Error('Evidence file cannot be empty');
    }
    if (bytes.length > this.maxBytes) {
      throw new Error(`Evidence file exceeds ${this.maxBytes} byte storage limit`);
    }

    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const assetId = sanitizeSegment(input.assetId);
    const uploadedBy = sanitizeSegment(input.uploadedBy);
    const evidenceKind = sanitizeSegment(input.kind);
    const fileName = sanitizeSegment(input.fileName);
    const objectKey = `${assetId}/${evidenceKind}/${contentHash}-${uploadedBy}-${fileName}`;
    const targetPath = path.join(this.rootDir, objectKey);
    const resolvedTarget = path.resolve(targetPath);

    if (!resolvedTarget.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new Error('Invalid evidence storage path');
    }

    await mkdir(path.dirname(resolvedTarget), { recursive: true });
    await writeFile(resolvedTarget, bytes);

    return {
      uri: `local-object://${objectKey}`,
      contentHash
    };
  }
}
