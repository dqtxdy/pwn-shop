import {
  AssetStatus,
  DisputeStatus,
  EvidenceKind,
  KycStatus,
  ListingStatus,
  LoanStatus,
  ShipmentDirection,
  ShipmentStatus,
  UserRole,
  LayawayStatus
} from './enums';

export interface User {
  id: string;
  email?: string;
  displayName: string;
  role: UserRole;
  kycStatus: KycStatus;
  createdAt: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  address: string;
  chainId: number;
  verifiedAt?: Date;
}

export interface KycVerification {
  id: string;
  userId: string;
  provider: string;
  status: KycStatus;
  reference: string;
  checkedAt: Date;
}

export interface Asset {
  id: string;
  ownerId: string;
  tokenId?: string;
  title: string;
  category: string;
  description: string;
  status: AssetStatus;
  declaredValue: number;
  createdAt: Date;
}

export interface EvidenceFile {
  id: string;
  assetId: string;
  uploadedBy: string;
  kind: EvidenceKind;
  uri: string;
  contentHash: string;
  capturedAt: Date;
}

export interface Shipment {
  id: string;
  assetId: string;
  direction: ShipmentDirection;
  carrier: string;
  trackingCode: string;
  status: ShipmentStatus;
  codRequired: boolean;
  updatedAt: Date;
}

export interface Appraisal {
  id: string;
  assetId: string;
  appraiserId: string;
  estimatedValue: number;
  ltvBps: number;
  interestAprBps: number;
  acceptedByCustomer: boolean;
  evidenceUri?: string;
  createdAt: Date;
}

export interface Loan {
  id: string;
  assetId: string;
  borrowerId: string;
  principal: number;
  aprBps: number;
  durationDays: number;
  status: LoanStatus;
  contractTxHash?: string;
  dueAt?: Date;
  createdAt: Date;
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  txHash: string;
  paidAt: Date;
}

export interface Listing {
  id: string;
  assetId: string;
  sellerId: string;
  price: number;
  status: ListingStatus;
  isProtocolOwned: boolean;
  createdAt: Date;
}

export interface Layaway {
  id: string;
  listingId: string;
  buyerId: string;
  totalPrice: number;
  amountPaid: number;
  deadline: Date;
  status: LayawayStatus;
  monthsDuration?: number;
  installmentAmount?: number;
  downPayment?: number;
  paidInstallments?: number;
  amountPaidWei?: string;
  downPaymentWei?: string;
  lastPaymentTxHash?: string;
  completedTxHash?: string;
}

export interface FractionalPosition {
  id: string;
  assetId: string;
  holderId: string;
  shares: number;
  totalShares: number;
}

export interface FractionalAsset {
  assetId: string;
  originalOwner: string;
  totalShares: number;
  availableShares: number;
  pricePerShare: number;
  status: 'ACTIVE' | 'SOLD_OUT' | 'REDEEMED';
}

export interface Dispute {
  id: string;
  assetId: string;
  openedBy: string;
  status: DisputeStatus;
  evidenceExportUri?: string;
  resolution?: string;
  createdAt: Date;
  previousAssetStatus?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  aggregateType: string;
  aggregateId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface BlockchainTransaction {
  id: string;
  aggregateType: string;
  aggregateId: string;
  txHash: string;
  eventName: string;
  payload: Record<string, unknown>;
  confirmedAt: Date;
}

export interface PawnDashboard {
  assets: Asset[];
  loans: Loan[];
  listings: Listing[];
  disputes: Dispute[];
  auditEvents: AuditEvent[];
  layaways: Layaway[];
  protocolFeesCollected: number;
}
