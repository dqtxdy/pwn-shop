import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { KycStatus, ShipmentStatus } from '../../domain/enums';
import {
  BlockchainConfig,
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

  async recordRepayment(input: {
    loanId: string;
    amount: number;
    txHash: string;
    assetId: string;
    borrowerWallet: string;
  }) {
    return undefined;
  }

  async updateAppraisal(input: {
    assetId: string;
    estimatedValue: number;
    ltvBps: number;
    interestAprBps: number;
  }) {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async verifyLoanCreated(
    txHash: string,
    assetId: string,
    borrowerWallet: string,
    principal: number
  ) {
    return undefined;
  }

  async prepareCreateListing(input: {
    assetId: string;
    sellerWallet: string;
    price: number;
    isConsigned: boolean;
  }) {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async verifyListingCreated(
    txHash: string,
    assetId: string,
    sellerWallet: string,
    price: number
  ) {
    return undefined;
  }

  async prepareStartLayaway(input: {
    assetId: string;
    buyerWallet: string;
    downPayment: number;
    monthsDuration: number;
  }) {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async verifyLayawayStarted(
    txHash: string,
    assetId: string,
    buyerWallet: string,
    downPayment: number
  ) {
    return undefined;
  }

  async preparePayLayawayInstallment(_input: {
    assetId: string;
    buyerWallet: string;
    installmentAmount: bigint;
  }) {
    return { status: 'MOCK_OK', actions: [] };
  }

  async verifyLayawayInstallmentPaid(_input: {
    txHash: string;
    assetId: string;
    buyerWallet: string;
    installmentAmount: bigint;
    isFinal: boolean;
  }) {
    return undefined;
  }

  async prepareFractionalizeAsset(input: {
    assetId: string;
    ownerWallet: string;
    totalShares: number;
    targetPrice: number;
  }) {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async verifyAssetFractionalized(input: {
    txHash: string;
    assetId: string;
    ownerWallet: string;
    totalShares: number;
    targetPrice: number;
  }) {
    return undefined;
  }

  async prepareBuyFractions(input: {
    assetId: string;
    buyerWallet: string;
    sharesToBuy: number;
    pricePerShare: number;
  }) {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async verifyFractionsPurchased(input: {
    txHash: string;
    assetId: string;
    buyerWallet: string;
    sharesToBuy: number;
    pricePerShare: number;
  }) {
    return undefined;
  }

  async prepareRedeemAsset(input: {
    assetId: string;
    redeemerWallet: string;
  }) {
    return { txHash: `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}` };
  }

  async verifyAssetRedeemed(input: {
    txHash: string;
    assetId: string;
    redeemerWallet: string;
  }) {
    return undefined;
  }

  getBlockchainConfig(): BlockchainConfig {
    return {
      mode: 'mock',
      isDeploymentArtifactLoaded: false
    };
  }

  async checkHealth(): Promise<{ healthy: boolean; reason?: string }> {
    return { healthy: true };
  }
}

@Injectable()
export class MockNotificationGateway implements NotificationGateway {
  async notify() {
    return undefined;
  }
}
