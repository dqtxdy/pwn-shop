const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

// --- Domain Enums/Types ---
export type AssetStatus =
  | 'DRAFT'
  | 'AWAITING_SHIPMENT'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'UNDER_APPRAISAL'
  | 'OFFER_ISSUED'
  | 'LOAN_ACTIVE'
  | 'RETURNING'
  | 'RETURNED'
  | 'LISTED'
  | 'FRACTIONALIZED'
  | 'DISPUTED';

export type EvidenceKind = 'CUSTOMER_PRE_SHIPMENT' | 'STAFF_UNBOXING' | 'DISPUTE';
export type ShipmentDirection = 'TO_SHOP' | 'RETURN_TO_CUSTOMER';
export type ShipmentStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNING';
export type LoanStatus = 'OFFERED' | 'ACTIVE' | 'REPAID' | 'DEFAULTED' | 'LIQUIDATED';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED';
export type DisputeStatus = 'OPEN' | 'RESOLVED';

// --- Models ---
export interface Asset {
  id: string;
  ownerId: string;
  tokenId?: string;
  title: string;
  category: string;
  description: string;
  status: AssetStatus;
  declaredValue: number;
  createdAt: string;
}

export interface EvidenceFile {
  id: string;
  assetId: string;
  uploadedBy: string;
  kind: EvidenceKind;
  uri: string;
  contentHash: string;
  capturedAt: string;
}

export interface Shipment {
  id: string;
  assetId: string;
  direction: ShipmentDirection;
  carrier: string;
  trackingCode: string;
  status: ShipmentStatus;
  codRequired: boolean;
  updatedAt: string;
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
  createdAt: string;
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
  dueAt?: string;
  createdAt: string;
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  txHash: string;
  paidAt: string;
}

export interface Listing {
  id: string;
  assetId: string;
  sellerId: string;
  price: number;
  status: ListingStatus;
  isProtocolOwned: boolean;
  createdAt: string;
}

export interface Layaway {
  id: string;
  listingId: string;
  buyerId: string;
  totalPrice: number;
  amountPaid: number;
  deadline: string;
}

export interface Dispute {
  id: string;
  assetId: string;
  openedBy: string;
  status: DisputeStatus;
  evidenceExportUri?: string;
  resolution?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  aggregateType: string;
  aggregateId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PawnDashboard {
  assets: Asset[];
  loans: Loan[];
  listings: Listing[];
  disputes: Dispute[];
  auditEvents: AuditEvent[];
  protocolFeesCollected: number;
}

// --- Request DTOs ---
export interface CreateAssetDto {
  ownerId: string;
  title: string;
  category: string;
  description: string;
  declaredValue: number;
}

export interface UploadEvidenceDto {
  assetId: string;
  uploadedBy: string;
  kind: EvidenceKind;
  fileName: string;
  bytesBase64: string;
}

export interface CreateShipmentDto {
  assetId: string;
  direction: ShipmentDirection;
  carrier: string;
  codRequired: boolean;
}

export interface CreateAppraisalDto {
  assetId: string;
  appraiserId: string;
  estimatedValue: number;
  ltvBps: number;
  interestAprBps: number;
  evidenceUri?: string;
}

export interface CreateLoanOfferDto {
  assetId: string;
  borrowerId: string;
  principal: number;
  durationDays: number;
}

export interface AcceptLoanDto {
  borrowerWallet: string;
}

export interface RecordRepaymentDto {
  loanId: string;
  amount: number;
  txHash: string;
}

export interface CreateListingDto {
  assetId: string;
  sellerId: string;
  price: number;
  isProtocolOwned: boolean;
}

export interface CreateLayawayDto {
  listingId: string;
  buyerId: string;
  downPayment: number;
  monthsDuration: number;
}

// --- HTTP Client Helpers ---
export async function postJson<TResponse, TBody extends Record<string, unknown> | unknown>(path: string, body: TBody): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Request failed with ${response.status}: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<TResponse>;
}

export async function getJson<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Request failed with ${response.status}: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<TResponse>;
}

export interface DemoSession {
  userId: string;
  displayName: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  walletAddress?: string;
  token: string;
}

// --- API Methods ---
export const api = {
  fetchDashboard: () => getJson<PawnDashboard>('/admin/dashboard'),
  fetchMarketplace: () => getJson<Listing[]>('/marketplace'),
  createAsset: (dto: CreateAssetDto) => postJson<Asset, CreateAssetDto>('/assets', dto),
  uploadEvidence: (dto: UploadEvidenceDto) => postJson<EvidenceFile, UploadEvidenceDto>('/evidence', dto),
  createShipment: (dto: CreateShipmentDto) => postJson<Shipment, CreateShipmentDto>('/shipments', dto),
  createAppraisal: (dto: CreateAppraisalDto) => postJson<Appraisal, CreateAppraisalDto>('/appraisals', dto),
  createLoanOffer: (dto: CreateLoanOfferDto) => postJson<Loan, CreateLoanOfferDto>('/loans', dto),
  acceptLoan: (loanId: string, dto: AcceptLoanDto) => postJson<Loan, AcceptLoanDto>(`/loans/${loanId}/accept`, dto),
  recordRepayment: (dto: RecordRepaymentDto) => postJson<Repayment, RecordRepaymentDto>('/repayments', dto),
  createListing: (dto: CreateListingDto) => postJson<Listing, CreateListingDto>('/marketplace/listings', dto),
  createLayaway: (dto: CreateLayawayDto) => postJson<Layaway, CreateLayawayDto>('/layaways', dto),
  demoLogin: (role: 'CUSTOMER' | 'STAFF' | 'ADMIN') => postJson<DemoSession, { role: string }>('/auth/demo-login', { role })
};


