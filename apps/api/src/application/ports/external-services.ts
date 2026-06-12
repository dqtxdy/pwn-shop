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

export type WalletExecutionStatus = 'AWAITING_WALLET_EXECUTION';

export interface WalletAction {
  to: string;
  calldata: string;
  description: string;
}

export interface WalletExecutionResponse {
  status: WalletExecutionStatus;
  actions: WalletAction[];
}

export interface GatewayTransactionResponse {
  txHash?: string;
}

export interface LayawayWalletExecutionResponse extends WalletExecutionResponse {
  nextInstallmentAmountWei?: string;
  nextInstallmentAmountDisplay?: string;
}

export interface BlockchainGateway {
  prepareLoanDisbursement(input: {
    assetId: string;
    borrowerWallet: string;
    principal: number;
    durationDays: number;
  }): Promise<GatewayTransactionResponse | WalletExecutionResponse>;
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
  }): Promise<GatewayTransactionResponse | WalletExecutionResponse>;
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
  }): Promise<GatewayTransactionResponse | WalletExecutionResponse>;
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
  }): Promise<WalletExecutionResponse>;
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
  }): Promise<GatewayTransactionResponse | WalletExecutionResponse>;
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
  }): Promise<GatewayTransactionResponse | WalletExecutionResponse>;
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
  }): Promise<GatewayTransactionResponse | WalletExecutionResponse>;
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
