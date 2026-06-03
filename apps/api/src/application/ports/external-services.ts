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

export interface BlockchainGateway {
  prepareLoanDisbursement(input: {
    assetId: string;
    borrowerWallet: string;
    principal: number;
    durationDays: number;
  }): Promise<{ txHash: string }>;
  recordRepayment(input: { loanId: string; amount: number; txHash: string }): Promise<void>;
}

export interface NotificationGateway {
  notify(userId: string, template: string, payload: Record<string, unknown>): Promise<void>;
}
