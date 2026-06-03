import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { KycStatus, ShipmentStatus } from '../../domain/enums';
import {
  BlockchainGateway,
  KycProvider,
  LogisticsProvider,
  NotificationGateway,
  PriceOracle,
  StorageProvider
} from '../../application/ports/external-services';

@Injectable()
export class MockKycProvider implements KycProvider {
  async verifyWalletOwner(userId: string, walletAddress: string) {
    return {
      status: KycStatus.Verified,
      reference: `mock-kyc:${userId}:${walletAddress.toLowerCase()}`
    };
  }
}

@Injectable()
export class MockLogisticsProvider implements LogisticsProvider {
  async createShipment() {
    return {
      trackingCode: `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: ShipmentStatus.InTransit
    };
  }

  async track() {
    return {
      status: ShipmentStatus.InTransit,
      checkedAt: new Date()
    };
  }
}

@Injectable()
export class MockPriceOracle implements PriceOracle {
  async quoteAssetCategory(category: string) {
    const fallback = category.toLowerCase().includes('gold') ? 2000 : 800;
    return { referencePrice: fallback, currency: 'USDC' as const, source: 'mock-oracle' };
  }
}

@Injectable()
export class MockStorageProvider implements StorageProvider {
  async storeEvidence(input: { assetId: string; fileName: string; bytesBase64: string }) {
    const contentHash = createHash('sha256').update(input.bytesBase64).digest('hex');
    return {
      uri: `ipfs://mock/${input.assetId}/${contentHash}-${input.fileName}`,
      contentHash
    };
  }
}

@Injectable()
export class MockBlockchainGateway implements BlockchainGateway {
  async prepareLoanDisbursement() {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async recordRepayment() {
    return undefined;
  }
}

@Injectable()
export class MockNotificationGateway implements NotificationGateway {
  async notify() {
    return undefined;
  }
}
