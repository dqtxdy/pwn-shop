import { mkdtemp, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { EvidenceKind, KycStatus } from '../src/domain/enums';
import { FileSystemStorageProvider } from '../src/infrastructure/adapters/filesystem-storage.provider';
import { MockKycProvider } from '../src/infrastructure/adapters/mock-external.adapters';

describe('External adapter hardening', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('MockKycProvider sandbox outcomes', () => {
    it('returns verified, pending, and rejected outcomes from environment configuration', async () => {
      process.env.KYC_REVIEW_WALLETS = '0xReview';
      process.env.KYC_REJECTED_WALLETS = '0xReject';
      const provider = new MockKycProvider();

      await expect(provider.verifyWalletOwner('user-1', '0xVerified')).resolves.toMatchObject({
        status: KycStatus.Verified
      });
      await expect(provider.verifyWalletOwner('user-2', '0xreview')).resolves.toMatchObject({
        status: KycStatus.Pending
      });
      await expect(provider.verifyWalletOwner('user-3', '0xREJECT')).resolves.toMatchObject({
        status: KycStatus.Rejected
      });
    });
  });

  describe('FileSystemStorageProvider', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'pawnshop-evidence-'));
      process.env.STORAGE_LOCAL_DIR = tempDir;
      process.env.STORAGE_MAX_BYTES = '32';
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('stores decoded evidence bytes outside the database and returns a stable hash', async () => {
      const provider = new FileSystemStorageProvider();
      const payload = Buffer.from('vault proof');
      const result = await provider.storeEvidence({
        assetId: '../A-1001',
        uploadedBy: 'staff-1',
        kind: EvidenceKind.StaffUnboxing,
        fileName: '../proof.txt',
        bytesBase64: `data:text/plain;base64,${payload.toString('base64')}`
      });

      const expectedHash = createHash('sha256').update(payload).digest('hex');
      expect(result.contentHash).toBe(expectedHash);
      expect(result.uri).toMatch(/^local-object:\/\//);
      expect(result.uri).not.toContain('..');

      const relativePath = result.uri.replace('local-object://', '');
      await expect(readFile(path.join(tempDir, relativePath), 'utf8')).resolves.toBe('vault proof');
    });

    it('rejects invalid base64 and oversized evidence payloads', async () => {
      const provider = new FileSystemStorageProvider();

      await expect(
        provider.storeEvidence({
          assetId: 'A-1001',
          uploadedBy: 'staff-1',
          kind: EvidenceKind.StaffUnboxing,
          fileName: 'bad.txt',
          bytesBase64: 'not valid base64!'
        })
      ).rejects.toThrow('valid base64');

      await expect(
        provider.storeEvidence({
          assetId: 'A-1001',
          uploadedBy: 'staff-1',
          kind: EvidenceKind.StaffUnboxing,
          fileName: 'large.txt',
          bytesBase64: Buffer.alloc(64, 'x').toString('base64')
        })
      ).rejects.toThrow('storage limit');
    });
  });
});
