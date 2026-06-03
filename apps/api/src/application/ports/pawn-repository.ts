import {
  Appraisal,
  Asset,
  AuditEvent,
  BlockchainTransaction,
  Dispute,
  EvidenceFile,
  KycVerification,
  Layaway,
  Listing,
  Loan,
  PawnDashboard,
  Repayment,
  Shipment,
  User,
  Wallet
} from '../../domain/models';

export interface PawnRepository {
  saveUser(user: User): Promise<User>;
  findUserByWallet(address: string): Promise<User | undefined>;
  saveWallet(wallet: Wallet): Promise<Wallet>;
  saveKycVerification(verification: KycVerification): Promise<KycVerification>;
  saveAsset(asset: Asset): Promise<Asset>;
  findAsset(id: string): Promise<Asset | undefined>;
  listAssets(): Promise<Asset[]>;
  saveEvidence(file: EvidenceFile): Promise<EvidenceFile>;
  listEvidence(assetId: string): Promise<EvidenceFile[]>;
  saveShipment(shipment: Shipment): Promise<Shipment>;
  findShipment(assetId: string): Promise<Shipment | undefined>;
  saveAppraisal(appraisal: Appraisal): Promise<Appraisal>;
  saveLoan(loan: Loan): Promise<Loan>;
  findLoan(id: string): Promise<Loan | undefined>;
  saveRepayment(repayment: Repayment): Promise<Repayment>;
  saveListing(listing: Listing): Promise<Listing>;
  findListing(id: string): Promise<Listing | undefined>;
  listListings(): Promise<Listing[]>;
  saveLayaway(layaway: Layaway): Promise<Layaway>;
  findLayaway(id: string): Promise<Layaway | undefined>;
  saveDispute(dispute: Dispute): Promise<Dispute>;
  findDispute(id: string): Promise<Dispute | undefined>;
  saveAuditEvent(event: AuditEvent): Promise<AuditEvent>;
  saveBlockchainTransaction(tx: BlockchainTransaction): Promise<BlockchainTransaction>;
  getDashboard(): Promise<PawnDashboard>;
  reset?(): Promise<void>;
}
