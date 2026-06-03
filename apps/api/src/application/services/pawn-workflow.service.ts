import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BLOCKCHAIN_GATEWAY,
  KYC_PROVIDER,
  LOGISTICS_PROVIDER,
  PAWN_REPOSITORY,
  PRICE_ORACLE,
  STORAGE_PROVIDER
} from '../../common/tokens';
import {
  AssetStatus,
  DisputeStatus,
  EvidenceKind,
  ListingStatus,
  LoanStatus,
  ShipmentStatus
} from '../../domain/enums';
import {
  Appraisal,
  Asset,
  AuditEvent,
  BlockchainTransaction,
  Dispute,
  EvidenceFile,
  Layaway,
  Listing,
  Loan,
  PawnDashboard,
  Repayment,
  Shipment
} from '../../domain/models';
import {
  AcceptLoanDto,
  BlockchainWebhookDto,
  CreateAppraisalDto,
  CreateAssetDto,
  CreateDisputeDto,
  CreateLayawayDto,
  CreateListingDto,
  CreateLoanOfferDto,
  CreateShipmentDto,
  PayLayawayDto,
  RecordRepaymentDto,
  ResolveDisputeDto,
  UploadEvidenceDto
} from '../dto/pawn.dto';
import {
  BlockchainGateway,
  KycProvider,
  LogisticsProvider,
  PriceOracle,
  StorageProvider
} from '../ports/external-services';
import { PawnRepository } from '../ports/pawn-repository';

@Injectable()
export class PawnWorkflowService {
  constructor(
    @Inject(PAWN_REPOSITORY) private readonly repository: PawnRepository,
    @Inject(KYC_PROVIDER) private readonly kycProvider: KycProvider,
    @Inject(LOGISTICS_PROVIDER) private readonly logisticsProvider: LogisticsProvider,
    @Inject(PRICE_ORACLE) private readonly priceOracle: PriceOracle,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(BLOCKCHAIN_GATEWAY) private readonly blockchainGateway: BlockchainGateway
  ) {}

  async requestKyc(userId: string, walletAddress: string) {
    const result = await this.kycProvider.verifyWalletOwner(userId, walletAddress);
    return this.repository.saveKycVerification({
      id: randomUUID(),
      userId,
      provider: 'mock-kyc',
      status: result.status,
      reference: result.reference,
      checkedAt: new Date()
    });
  }

  async createAsset(dto: CreateAssetDto): Promise<Asset> {
    const quote = await this.priceOracle.quoteAssetCategory(dto.category);
    const asset = await this.repository.saveAsset({
      id: randomUUID(),
      ownerId: dto.ownerId,
      title: dto.title,
      category: dto.category,
      description: dto.description,
      status: AssetStatus.AwaitingShipment,
      declaredValue: dto.declaredValue || quote.referencePrice,
      createdAt: new Date()
    });
    await this.audit(dto.ownerId, 'ASSET_SUBMITTED', 'Asset', asset.id, { category: dto.category });
    return asset;
  }

  async uploadEvidence(dto: UploadEvidenceDto): Promise<EvidenceFile> {
    const asset = await this.requireAsset(dto.assetId);
    const stored = await this.storageProvider.storeEvidence(dto);
    const evidence = await this.repository.saveEvidence({
      id: randomUUID(),
      assetId: dto.assetId,
      uploadedBy: dto.uploadedBy,
      kind: dto.kind,
      uri: stored.uri,
      contentHash: stored.contentHash,
      capturedAt: new Date()
    });

    if (dto.kind === EvidenceKind.StaffUnboxing) {
      asset.status = AssetStatus.Received;
      await this.repository.saveAsset(asset);
    }

    await this.audit(dto.uploadedBy, 'EVIDENCE_UPLOADED', 'Asset', dto.assetId, { kind: dto.kind });
    return evidence;
  }

  async createShipment(dto: CreateShipmentDto): Promise<Shipment> {
    const result = await this.logisticsProvider.createShipment(dto);
    const shipment = await this.repository.saveShipment({
      id: randomUUID(),
      assetId: dto.assetId,
      direction: dto.direction,
      carrier: dto.carrier,
      trackingCode: result.trackingCode,
      status: result.status,
      codRequired: dto.codRequired,
      updatedAt: new Date()
    });

    const asset = await this.requireAsset(dto.assetId);
    asset.status = result.status === ShipmentStatus.Delivered ? AssetStatus.Received : AssetStatus.InTransit;
    await this.repository.saveAsset(asset);
    await this.audit('system', 'SHIPMENT_CREATED', 'Asset', dto.assetId, { trackingCode: shipment.trackingCode });
    return shipment;
  }

  async trackShipment(assetId: string): Promise<Shipment> {
    const shipment = await this.repository.findShipment(assetId);
    if (!shipment) throw new NotFoundException('Shipment not found');
    const result = await this.logisticsProvider.track(shipment.trackingCode);
    shipment.status = result.status;
    shipment.updatedAt = result.checkedAt;
    return this.repository.saveShipment(shipment);
  }

  async createAppraisal(dto: CreateAppraisalDto): Promise<Appraisal> {
    const asset = await this.requireAsset(dto.assetId);
    asset.status = AssetStatus.OfferIssued;
    await this.repository.saveAsset(asset);

    const appraisal = await this.repository.saveAppraisal({
      id: randomUUID(),
      assetId: dto.assetId,
      appraiserId: dto.appraiserId,
      estimatedValue: dto.estimatedValue,
      ltvBps: dto.ltvBps,
      interestAprBps: dto.interestAprBps,
      acceptedByCustomer: false,
      evidenceUri: dto.evidenceUri,
      createdAt: new Date()
    });
    await this.audit(dto.appraiserId, 'APPRAISAL_CREATED', 'Asset', dto.assetId, { estimatedValue: dto.estimatedValue });
    return appraisal;
  }

  async createLoanOffer(dto: CreateLoanOfferDto): Promise<Loan> {
    const loan = await this.repository.saveLoan({
      id: randomUUID(),
      assetId: dto.assetId,
      borrowerId: dto.borrowerId,
      principal: dto.principal,
      aprBps: 500,
      durationDays: dto.durationDays,
      status: LoanStatus.Offered,
      createdAt: new Date()
    });
    await this.audit(dto.borrowerId, 'LOAN_OFFER_CREATED', 'Loan', loan.id, { principal: dto.principal });
    return loan;
  }

  async acceptLoan(loanId: string, dto: AcceptLoanDto): Promise<Loan> {
    const loan = await this.requireLoan(loanId);
    const tx = await this.blockchainGateway.prepareLoanDisbursement({
      assetId: loan.assetId,
      borrowerWallet: dto.borrowerWallet,
      principal: loan.principal,
      durationDays: loan.durationDays
    });
    loan.status = LoanStatus.Active;
    loan.contractTxHash = tx.txHash;
    loan.dueAt = new Date(Date.now() + loan.durationDays * 24 * 60 * 60 * 1000);
    await this.repository.saveLoan(loan);

    const asset = await this.requireAsset(loan.assetId);
    asset.status = AssetStatus.LoanActive;
    await this.repository.saveAsset(asset);
    await this.audit(loan.borrowerId, 'LOAN_ACCEPTED', 'Loan', loan.id, { txHash: tx.txHash });
    return loan;
  }

  async recordRepayment(dto: RecordRepaymentDto): Promise<Repayment> {
    const loan = await this.requireLoan(dto.loanId);
    await this.blockchainGateway.recordRepayment(dto);
    loan.status = LoanStatus.Repaid;
    await this.repository.saveLoan(loan);

    const repayment = await this.repository.saveRepayment({
      id: randomUUID(),
      loanId: dto.loanId,
      amount: dto.amount,
      txHash: dto.txHash,
      paidAt: new Date()
    });
    await this.audit(loan.borrowerId, 'LOAN_REPAID', 'Loan', loan.id, { txHash: dto.txHash });
    return repayment;
  }

  async createListing(dto: CreateListingDto): Promise<Listing> {
    const asset = await this.requireAsset(dto.assetId);

    const listings = await this.repository.listListings();
    const duplicate = listings.find((l) => l.assetId === dto.assetId && l.status === ListingStatus.Active);
    if (duplicate) {
      throw new ConflictException('Active listing already exists for this asset');
    }

    if (dto.isProtocolOwned) {
      if (dto.sellerId !== 'admin-1' && dto.sellerId !== 'system') {
        throw new ForbiddenException('Only admin or system can create protocol-owned listings');
      }
      if (asset.status !== AssetStatus.Listed) {
        throw new BadRequestException('Protocol listings require asset status to be LISTED');
      }
    } else {
      if (asset.ownerId !== dto.sellerId) {
        throw new ForbiddenException('Seller must own the asset');
      }
      if (asset.status !== AssetStatus.Returned && asset.status !== AssetStatus.Received) {
        throw new BadRequestException('Customer listing requires asset status to be RECEIVED or RETURNED');
      }
      asset.status = AssetStatus.Listed;
      await this.repository.saveAsset(asset);
    }

    const listing = await this.repository.saveListing({
      id: randomUUID(),
      assetId: dto.assetId,
      sellerId: dto.sellerId,
      price: dto.price,
      status: ListingStatus.Active,
      isProtocolOwned: dto.isProtocolOwned,
      createdAt: new Date()
    });

    await this.audit(dto.sellerId, 'LISTING_CREATED', 'Listing', listing.id, {
      price: dto.price,
      assetId: dto.assetId,
      sellerId: dto.sellerId
    });

    return listing;
  }

  listListings(): Promise<Listing[]> {
    return this.repository.listListings();
  }

  async createLayaway(dto: CreateLayawayDto): Promise<Layaway> {
    const listing = await this.repository.findListing(dto.listingId);
    if (!listing) throw new NotFoundException('Listing not found');

    const layaway = await this.repository.saveLayaway({
      id: randomUUID(),
      listingId: dto.listingId,
      buyerId: dto.buyerId,
      totalPrice: listing.price,
      amountPaid: dto.downPayment,
      deadline: new Date(Date.now() + dto.monthsDuration * 30 * 24 * 60 * 60 * 1000)
    });
    await this.audit(dto.buyerId, 'LAYAWAY_STARTED', 'Layaway', layaway.id, { downPayment: dto.downPayment });
    return layaway;
  }

  async payLayaway(layawayId: string, dto: PayLayawayDto): Promise<Layaway> {
    const layaway = await this.repository.findLayaway(layawayId);
    if (!layaway) throw new NotFoundException('Layaway not found');

    layaway.amountPaid += dto.amount;
    await this.repository.saveLayaway(layaway);
    await this.audit('system', 'LAYAWAY_PAYMENT_RECORDED', 'Layaway', layawayId, { amount: dto.amount });
    return layaway;
  }

  async createDispute(dto: CreateDisputeDto): Promise<Dispute> {
    const asset = await this.requireAsset(dto.assetId);
    asset.status = AssetStatus.Disputed;
    await this.repository.saveAsset(asset);

    const dispute = await this.repository.saveDispute({
      id: randomUUID(),
      assetId: dto.assetId,
      openedBy: dto.openedBy,
      status: DisputeStatus.Open,
      evidenceExportUri: dto.evidenceExportUri,
      createdAt: new Date()
    });
    await this.audit(dto.openedBy, 'DISPUTE_OPENED', 'Dispute', dispute.id, { assetId: dto.assetId });
    return dispute;
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.repository.findDispute(id);
    if (!dispute) throw new NotFoundException('Dispute not found');
    dispute.status = DisputeStatus.Resolved;
    dispute.resolution = dto.resolution;
    await this.repository.saveDispute(dispute);
    await this.audit('admin', 'DISPUTE_RESOLVED', 'Dispute', id, { resolution: dto.resolution });
    return dispute;
  }

  async recordBlockchainWebhook(dto: BlockchainWebhookDto): Promise<BlockchainTransaction> {
    const tx = await this.repository.saveBlockchainTransaction({
      id: randomUUID(),
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      txHash: dto.txHash,
      eventName: dto.eventName,
      payload: dto.payload,
      confirmedAt: new Date()
    });
    await this.audit('chain-listener', 'BLOCKCHAIN_EVENT_RECORDED', dto.aggregateType, dto.aggregateId, dto.payload);
    return tx;
  }

  dashboard(): Promise<PawnDashboard> {
    return this.repository.getDashboard();
  }

  listAssets(): Promise<Asset[]> {
    return this.repository.listAssets();
  }

  async reset(): Promise<void> {
    if (this.repository.reset) {
      await this.repository.reset();
    }
  }

  private async requireAsset(id: string): Promise<Asset> {
    const asset = await this.repository.findAsset(id);
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  private async requireLoan(id: string): Promise<Loan> {
    const loan = await this.repository.findLoan(id);
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  private async audit(actorId: string, action: string, aggregateType: string, aggregateId: string, metadata: Record<string, unknown>): Promise<AuditEvent> {
    return this.repository.saveAuditEvent({
      id: randomUUID(),
      actorId,
      action,
      aggregateType,
      aggregateId,
      metadata,
      createdAt: new Date()
    });
  }
}
