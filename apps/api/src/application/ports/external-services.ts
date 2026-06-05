import { EvidenceKind, KycStatus, ShipmentDirection, ShipmentStatus } from '../../domain/enums';

export interface KycProvider {
  verifyWalletOwner(userId: string, walletAddress: string): Promise<{ status: KycStatus; reference: string }>;
}

export interface LogisticsProvider {
  createShipment(input: {
    assetId: string;
    direction: ShipmentDirection;
    carrier: string;
    codRequired: boolean;
  }): Promise<{ trackingCode: string; status: ShipmentStatus }>;
  track(trackingCode: string): Promise<{ status: ShipmentStatus; checkedAt: Date }>;
}

export interface PriceOracle {
  quoteAssetCategory(category: string): Promise<{ referencePrice: number; currency: 'USDC'; source: string }>;
}

export interface StorageProvider {
  storeEvidence(input: {
    assetId: string;
    uploadedBy: string;
    kind: EvidenceKind;
    fileName: string;
    bytesBase64: string;
  }): Promise<{ uri: string; contentHash: string }>;
}

export interface BlockchainConfig {
  mode: 'mock' | 'anvil';
  chainId?: number;
  pawnProtocolAddress?: string;
  paymentTokenAddress?: string;
  assetTokenAddress?: string;
  fractionTokenAddress?: string;
  isDeploymentArtifactLoaded: boolean;
}

export interface BlockchainGateway {
  prepareLoanDisbursement(input: {
    assetId: string;
    borrowerWallet: string;
    principal: number;
    durationDays: number;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }>;
  recordRepayment(input: {
    loanId: string;
    amount: number;
    txHash: string;
    assetId: string;
    borrowerWallet: string;
  }): Promise<void>;
  updateAppraisal(input: {
    assetId: string;
    estimatedValue: number;
    ltvBps: number;
    interestAprBps: number;
  }): Promise<{ txHash: string }>;
  verifyLoanCreated(
    txHash: string,
    assetId: string,
    borrowerWallet: string,
    principal: number
  ): Promise<void>;
  prepareCreateListing(input: {
    assetId: string;
    sellerWallet: string;
    price: number;
    isConsigned: boolean;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }>;
  verifyListingCreated(
    txHash: string,
    assetId: string,
    sellerWallet: string,
    price: number
  ): Promise<void>;
  prepareStartLayaway(input: {
    assetId: string;
    buyerWallet: string;
    downPayment: number;
    monthsDuration: number;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }>;
  verifyLayawayStarted(
    txHash: string,
    assetId: string,
    buyerWallet: string,
    downPayment: number
  ): Promise<void>;
  preparePayLayawayInstallment(input: {
    assetId: string;
    buyerWallet: string;
    installmentAmount: bigint;
  }): Promise<{ status?: string; actions?: any[] }>;
  verifyLayawayInstallmentPaid(input: {
    txHash: string;
    assetId: string;
    buyerWallet: string;
    installmentAmount: bigint;
    isFinal: boolean;
  }): Promise<void>;
  prepareFractionalizeAsset(input: {
    assetId: string;
    ownerWallet: string;
    totalShares: number;
    targetPrice: number;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }>;
  verifyAssetFractionalized(input: {
    txHash: string;
    assetId: string;
    ownerWallet: string;
    totalShares: number;
    targetPrice: number;
  }): Promise<void>;
  prepareBuyFractions(input: {
    assetId: string;
    buyerWallet: string;
    sharesToBuy: number;
    pricePerShare: number;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }>;
  verifyFractionsPurchased(input: {
    txHash: string;
    assetId: string;
    buyerWallet: string;
    sharesToBuy: number;
    pricePerShare: number;
  }): Promise<void>;
  prepareRedeemAsset(input: {
    assetId: string;
    redeemerWallet: string;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }>;
  verifyAssetRedeemed(input: {
    txHash: string;
    assetId: string;
    redeemerWallet: string;
  }): Promise<void>;
  getBlockchainConfig(): BlockchainConfig;
  checkHealth(): Promise<{ healthy: boolean; reason?: string }>;
}

export interface NotificationGateway {
  notify(userId: string, template: string, payload: Record<string, unknown>): Promise<void>;
}
