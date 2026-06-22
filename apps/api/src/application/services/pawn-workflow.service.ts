import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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
  ShipmentStatus,
  LayawayStatus,
  UserRole,
  KycStatus,
  ShipmentDirection
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
  Shipment,
  FractionalAsset,
  FractionalPosition
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
  UploadEvidenceDto,
  FractionalizeAssetDto,
  BuyFractionsDto,
  RedeemAssetDto
} from '../dto/pawn.dto';
import {
  BlockchainGateway,
  GatewayTransactionResponse,
  KycProvider,
  LayawayWalletExecutionResponse,
  LogisticsProvider,
  PriceOracle,
  StorageProvider,
  WalletExecutionResponse
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

  private requirePreparedTx(response: GatewayTransactionResponse | WalletExecutionResponse): string {
    if ('txHash' in response && response.txHash) {
      return response.txHash;
    }
    throw new BadRequestException('Blockchain gateway did not return a transaction hash');
  }

  private requireWalletExecution(
    response: GatewayTransactionResponse | WalletExecutionResponse
  ): WalletExecutionResponse {
    if ('actions' in response && response.status === 'AWAITING_WALLET_EXECUTION') {
      return response;
    }
    throw new BadRequestException('Blockchain gateway did not return wallet actions');
  }

  private async executeInTx<T>(fn: () => Promise<T>): Promise<T> {
    if (this.repository.runInTransaction) {
      return this.repository.runInTransaction(() => fn());
    }
    return fn();
  }

  private async resolveWalletAddress(
    userId: string,
    actor?: { id: string; wallet?: string }
  ): Promise<string | undefined> {
    if (actor?.id === userId && actor.wallet) {
      return actor.wallet;
    }
    return (await this.repository.findWalletByUserId(userId))?.address;
  }

  private async assertNoDuplicateListingForAsset(assetId: string): Promise<void> {
    const listings = await this.repository.listListings();
    const duplicate = listings.find(
      (listing) => listing.assetId === assetId
        && (listing.status === ListingStatus.Active || listing.status === ListingStatus.Reserved)
    );
    if (duplicate) {
      throw new ConflictException('Active listing already exists for this asset');
    }
  }

  private validateListingCreationRules(
    dto: CreateListingDto,
    actor: { id: string; role: UserRole; wallet?: string } | undefined,
    asset: Asset
  ): void {
    if (actor && actor.role === UserRole.Customer && asset.ownerId !== actor.id) {
      throw new ForbiddenException('Cannot list another user\'s asset');
    }

    if (dto.isProtocolOwned) {
      if (dto.sellerId !== 'admin-1' && dto.sellerId !== 'system') {
        throw new ForbiddenException('Only admin or system can create protocol-owned listings');
      }
      if (asset.status !== AssetStatus.Listed) {
        throw new BadRequestException('Protocol listings require asset status to be LISTED');
      }
      return;
    }

    if (asset.ownerId !== dto.sellerId) {
      throw new ForbiddenException('Seller must own the asset');
    }
    if (asset.status !== AssetStatus.Returned && asset.status !== AssetStatus.Received) {
      throw new BadRequestException('Customer listing requires asset status to be RECEIVED or RETURNED');
    }
  }

  private async assertNoActiveLayawayForListing(listingId: string): Promise<void> {
    const layaways = await this.repository.listLayaways();
    const activeLayaway = layaways.find(
      (layaway) => layaway.listingId === listingId && layaway.status === LayawayStatus.Active
    );
    if (activeLayaway) {
      throw new ConflictException('Active layaway already exists for this listing');
    }
  }

  private async calculateLayawayPaymentState(layaway: Layaway): Promise<{
    amountPaidWei: bigint;
    downPaymentWei: bigint;
    installmentWei: bigint;
    requiredAmountWei: bigint;
    totalPriceWei: bigint;
    isFinal: boolean;
  }> {
    const { ethers } = await import('ethers');
    const totalPriceWei = ethers.parseEther(layaway.totalPrice.toString());
    const downPaymentVal =
      layaway.downPayment ?? (layaway.totalPrice - (layaway.installmentAmount ?? 0) * (layaway.monthsDuration ?? 6));
    const downPaymentWei = BigInt(
      layaway.downPaymentWei ?? ethers.parseEther(downPaymentVal.toString()).toString()
    );
    const remainingAfterDownWei = totalPriceWei - downPaymentWei;
    const installmentWei = remainingAfterDownWei / BigInt(layaway.monthsDuration ?? 6);
    const amountPaidWei = BigInt(layaway.amountPaidWei ?? downPaymentWei.toString());
    const remainingWei = totalPriceWei - amountPaidWei;

    let requiredAmountWei: bigint;
    if (remainingWei <= installmentWei || (remainingWei - installmentWei) < installmentWei) {
      requiredAmountWei = remainingWei;
    } else {
      requiredAmountWei = installmentWei;
    }

    return {
      amountPaidWei,
      downPaymentWei,
      installmentWei,
      requiredAmountWei,
      totalPriceWei,
      isFinal: (amountPaidWei + requiredAmountWei) >= totalPriceWei
    };
  }

  private async assertAssetCanBeFractionalized(assetId: string): Promise<void> {
    const dashboard = await this.repository.getDashboard();
    const activeLoan = dashboard.loans.find((loan) => loan.assetId === assetId && loan.status === LoanStatus.Active);
    if (activeLoan) {
      throw new BadRequestException('Asset has an active loan');
    }

    const assetListings = dashboard.listings.filter((listing) => listing.assetId === assetId);
    const hasListing = assetListings.some(
      (listing) => listing.status === ListingStatus.Active || listing.status === ListingStatus.Reserved
    );
    if (hasListing) {
      throw new BadRequestException('Asset has an active or reserved listing');
    }

    const listingIds = assetListings.map((listing) => listing.id);
    const hasActiveLayaway = dashboard.layaways.some(
      (layaway) => listingIds.includes(layaway.listingId) && layaway.status === LayawayStatus.Active
    );
    if (hasActiveLayaway) {
      throw new BadRequestException('Asset has an active layaway');
    }

    const activeDispute = dashboard.disputes.find(
      (dispute) => dispute.assetId === assetId && dispute.status === DisputeStatus.Open
    );
    if (activeDispute) {
      throw new BadRequestException('Asset has an active dispute');
    }
  }


  async requestKyc(userId: string, walletAddress: string) {
    // External KYC call — outside DB transaction to avoid holding tx open during HTTP.
    const result = await this.kycProvider.verifyWalletOwner(userId, walletAddress);

    // Short atomic DB write after external call resolves.
    return this.executeInTx(async () => {
      const user = await this.repository.findUserById(userId);
      if (user) {
        user.kycStatus = result.status;
        await this.repository.saveUser(user);
      }

      if (result.status === KycStatus.Verified) {
        const normalizedWallet = walletAddress.toLowerCase();
        let wallet = await this.repository.findWalletByUserId(userId);
        if (wallet) {
          wallet.address = normalizedWallet;
          wallet.verifiedAt = new Date();
          await this.repository.saveWallet(wallet);
        } else {
          wallet = {
            id: randomUUID(),
            userId,
            address: normalizedWallet,
            chainId: 1,
            verifiedAt: new Date()
          };
          await this.repository.saveWallet(wallet);
        }
      }

      return this.repository.saveKycVerification({
        id: randomUUID(),
        userId,
        provider: 'mock-kyc',
        status: result.status,
        reference: result.reference,
        checkedAt: new Date()
      });
    });
  }

  async createAsset(dto: CreateAssetDto, actor?: { id: string; role: UserRole }): Promise<Asset> {
    if (actor && actor.role === UserRole.Customer) {
      dto.ownerId = actor.id;
    }
    const ownerId = dto.ownerId || 'system';
    // External price oracle call — outside DB transaction.
    const quote = await this.priceOracle.quoteAssetCategory(dto.category);

    // Short atomic DB write after external call resolves.
    return this.executeInTx(async () => {
      const asset = await this.repository.saveAsset({
        id: randomUUID(),
        ownerId,
        title: dto.title,
        category: dto.category,
        description: dto.description,
        status: AssetStatus.AwaitingShipment,
        declaredValue: dto.declaredValue || quote.referencePrice,
        createdAt: new Date()
      });
      await this.audit(ownerId, 'ASSET_SUBMITTED', 'Asset', asset.id, { category: dto.category });
      return asset;
    });
  }

  async uploadEvidence(dto: UploadEvidenceDto, actor?: { id: string; role: UserRole }): Promise<EvidenceFile> {
    if (actor) {
      dto.uploadedBy = actor.id;
      // Ownership check can be done before the external call — read-only, no tx needed.
      if (actor.role === UserRole.Customer) {
        const asset = await this.requireAsset(dto.assetId);
        if (asset.ownerId !== actor.id) {
          throw new ForbiddenException('Cannot upload evidence for another user\'s asset');
        }
      }
    }
    const uploadedBy = dto.uploadedBy || 'system';

    // External storage call — outside DB transaction.
    const stored = await this.storageProvider.storeEvidence({
      assetId: dto.assetId,
      uploadedBy,
      kind: dto.kind,
      fileName: dto.fileName,
      bytesBase64: dto.bytesBase64
    });

    // Short atomic DB write after storage resolves.
    return this.executeInTx(async () => {
      const asset = await this.requireAsset(dto.assetId);
      const evidence = await this.repository.saveEvidence({
        id: randomUUID(),
        assetId: dto.assetId,
        uploadedBy,
        kind: dto.kind,
        uri: stored.uri,
        contentHash: stored.contentHash,
        capturedAt: new Date()
      });

      if (dto.kind === EvidenceKind.StaffUnboxing) {
        asset.status = AssetStatus.Received;
        await this.repository.saveAsset(asset);
      }

      await this.audit(uploadedBy, 'EVIDENCE_UPLOADED', 'Asset', dto.assetId, { kind: dto.kind });
      return evidence;
    });
  }

  private determineAssetStatus(direction: ShipmentDirection, shipmentStatus: ShipmentStatus): AssetStatus | undefined {
    if (direction === ShipmentDirection.ToShop) {
      if (shipmentStatus === ShipmentStatus.Delivered) {
        return AssetStatus.Received;
      } else {
        return AssetStatus.InTransit;
      }
    } else if (direction === ShipmentDirection.ReturnToCustomer) {
      if (shipmentStatus === ShipmentStatus.Delivered) {
        return AssetStatus.Returned;
      } else {
        return AssetStatus.Returning;
      }
    }
    return undefined;
  }

  async createShipment(dto: CreateShipmentDto, actor?: { id: string; role: UserRole }): Promise<Shipment> {
    // Pre-validate actor permissions with a read-only check before external call.
    {
      const asset = await this.requireAsset(dto.assetId);
      if (actor) {
        if (actor.role === UserRole.Customer) {
          if (dto.direction !== ShipmentDirection.ToShop) {
            throw new ForbiddenException('Customer can only ship TO_SHOP');
          }
          if (asset.status !== AssetStatus.AwaitingShipment) {
            throw new BadRequestException('Asset must be in AWAITING_SHIPMENT status');
          }
          if (asset.ownerId !== actor.id) {
            throw new ForbiddenException('Cannot ship another user\'s asset');
          }
        } else if (actor.role === UserRole.Staff) {
          if (dto.direction !== ShipmentDirection.ReturnToCustomer) {
            throw new ForbiddenException('Staff can only ship RETURN_TO_CUSTOMER');
          }
          if (asset.status !== AssetStatus.Returning) {
            throw new BadRequestException('Asset must be in RETURNING status');
          }
        }
      }
    }

    // External logistics call — outside DB transaction.
    const result = await this.logisticsProvider.createShipment(dto);
    const auditActorId = actor?.id || 'system';

    // Short atomic DB write after external call resolves.
    return this.executeInTx(async () => {
      const asset = await this.requireAsset(dto.assetId);
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

      const newAssetStatus = this.determineAssetStatus(shipment.direction, shipment.status);
      if (newAssetStatus) {
        asset.status = newAssetStatus;
        await this.repository.saveAsset(asset);
      }

      await this.audit(auditActorId, 'SHIPMENT_CREATED', 'Asset', dto.assetId, { trackingCode: shipment.trackingCode });
      return shipment;
    });
  }

  async trackShipment(assetId: string, actor?: { id: string; role: UserRole }): Promise<Shipment> {
    // Read-only authorization check — no transaction needed.
    const assetForAuth = await this.repository.findAsset(assetId);
    if (!assetForAuth) throw new NotFoundException('Asset not found');

    if (actor && actor.role === UserRole.Customer) {
      if (assetForAuth.ownerId !== actor.id) {
        throw new ForbiddenException('Cannot track shipment for an asset you do not own');
      }
    }

    let shipment = await this.repository.findShipment(assetId, ShipmentDirection.ReturnToCustomer);
    if (!shipment) {
      shipment = await this.repository.findShipment(assetId);
    }
    if (!shipment) throw new NotFoundException('Shipment not found');

    // External logistics poll — outside DB transaction.
    const result = await this.logisticsProvider.track(shipment.trackingCode);
    shipment.status = result.status;
    shipment.updatedAt = result.checkedAt;

    // Short atomic DB write only if status changed.
    const newAssetStatus = this.determineAssetStatus(shipment.direction, shipment.status);
    return this.executeInTx(async () => {
      const asset = await this.repository.findAsset(assetId);
      if (newAssetStatus && asset) {
        asset.status = newAssetStatus;
        await this.repository.saveAsset(asset);
      }
      return this.repository.saveShipment(shipment!);
    });
  }

  async createAppraisal(dto: CreateAppraisalDto): Promise<Appraisal> {
    // Input validation and asset status check — read-only, no tx needed.
    const assetForValidation = await this.requireAsset(dto.assetId);
    if (assetForValidation.status !== AssetStatus.Received && assetForValidation.status !== AssetStatus.UnderAppraisal) {
      throw new BadRequestException('Appraisal can only be created for RECEIVED or UNDER_APPRAISAL assets');
    }
    if (dto.estimatedValue <= 0) {
      throw new BadRequestException('estimatedValue must be positive');
    }
    if (dto.ltvBps <= 0 || dto.ltvBps > 10000) {
      throw new BadRequestException('ltvBps must be > 0 and <= 10000');
    }
    if (dto.interestAprBps < 0 || dto.interestAprBps > 10000) {
      throw new BadRequestException('interestAprBps must be >= 0 and <= 10000');
    }

    const appraiserId = dto.appraiserId || 'system';

    // External blockchain call — outside DB transaction.
    let txHash = '';
    try {
      const result = await this.blockchainGateway.updateAppraisal({
        assetId: dto.assetId,
        estimatedValue: dto.estimatedValue,
        ltvBps: dto.ltvBps,
        interestAprBps: dto.interestAprBps
      });
      txHash = result.txHash;
    } catch (err: any) {
      throw new BadRequestException(`Failed to publish appraisal to blockchain: ${err.message}`);
    }

    // Short atomic DB write after blockchain confirms.
    return this.executeInTx(async () => {
      const asset = await this.requireAsset(dto.assetId);
      asset.status = AssetStatus.OfferIssued;
      await this.repository.saveAsset(asset);

      const appraisal = await this.repository.saveAppraisal({
        id: randomUUID(),
        assetId: dto.assetId,
        appraiserId,
        estimatedValue: dto.estimatedValue,
        ltvBps: dto.ltvBps,
        interestAprBps: dto.interestAprBps,
        acceptedByCustomer: false,
        evidenceUri: dto.evidenceUri,
        createdAt: new Date()
      });

      await this.audit(appraiserId, 'APPRAISAL_CREATED', 'Asset', dto.assetId, {
        estimatedValue: dto.estimatedValue,
        txHash
      });
      return appraisal;
    });
  }

  async createLoanOffer(dto: CreateLoanOfferDto): Promise<Loan> {
    return this.executeInTx(async () => {
      const asset = await this.repository.findAsset(dto.assetId);
      if (!asset) {
        throw new NotFoundException(`Asset ${dto.assetId} not found`);
      }
      if (dto.borrowerId !== asset.ownerId) {
        throw new BadRequestException('Borrower is not the owner of the asset');
      }
      if (asset.status !== AssetStatus.OfferIssued) {
        throw new BadRequestException(`Asset status must be OFFER_ISSUED, currently ${asset.status}`);
      }

      const latestAppraisal = await this.repository.findLatestAppraisalByAssetId(dto.assetId);
      if (!latestAppraisal) {
        throw new BadRequestException('No appraisal found for this asset');
      }
      const maxPrincipal = latestAppraisal.estimatedValue * (latestAppraisal.ltvBps / 10000);
      if (dto.principal > maxPrincipal) {
        throw new BadRequestException(`Principal ${dto.principal} exceeds the maximum LTV of ${maxPrincipal}`);
      }

      const dashboard = await this.repository.getDashboard();
      const existingLoan = dashboard.loans.find(
        (l) => l.assetId === dto.assetId && (l.status === LoanStatus.Offered || l.status === LoanStatus.Active)
      );
      if (existingLoan) {
        throw new BadRequestException(`An offered or active loan already exists for this asset (status: ${existingLoan.status})`);
      }

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
    });
  }

  async acceptLoan(loanId: string, dto: AcceptLoanDto, actor?: { id: string; role: UserRole; wallet?: string }): Promise<Loan | WalletExecutionResponse> {
    // Read loan and validate before any external call.
    const loan = await this.requireLoan(loanId);
    if (loan.status !== LoanStatus.Offered) {
      throw new BadRequestException(`Loan status must be OFFERED, currently ${loan.status}`);
    }
    if (actor && actor.role === UserRole.Customer) {
      if (loan.borrowerId !== actor.id) {
        throw new ForbiddenException('Cannot accept a loan offer for another user');
      }
    }
    if (actor) {
      if (!actor.wallet) {
        throw new BadRequestException('Actor wallet address is missing from session');
      }
      if (dto.borrowerWallet.toLowerCase() !== actor.wallet.toLowerCase()) {
        throw new BadRequestException('borrowerWallet does not match actor wallet address');
      }
    }
    const config = this.blockchainGateway.getBlockchainConfig();

    if (config.mode === 'mock') {
      // Mock: single external call then atomic DB writes.
      const tx = await this.blockchainGateway.prepareLoanDisbursement({
        assetId: loan.assetId,
        borrowerWallet: dto.borrowerWallet,
        principal: loan.principal,
        durationDays: loan.durationDays
      });
      const txHash = this.requirePreparedTx(tx);
      return this.executeInTx(async () => {
        const l = await this.requireLoan(loanId);
        l.status = LoanStatus.Active;
        l.contractTxHash = txHash;
        l.dueAt = new Date(Date.now() + l.durationDays * 24 * 60 * 60 * 1000);
        await this.repository.saveLoan(l);
        const asset = await this.requireAsset(l.assetId);
        asset.status = AssetStatus.LoanActive;
        await this.repository.saveAsset(asset);
        await this.audit(l.borrowerId, 'LOAN_ACCEPTED', 'Loan', l.id, { txHash });
        return l;
      });
    } else {
      // Anvil prepare path: no DB writes, return wallet actions.
      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareLoanDisbursement({
          assetId: loan.assetId,
          borrowerWallet: dto.borrowerWallet,
          principal: loan.principal,
          durationDays: loan.durationDays
        });
        return this.requireWalletExecution(result);
      }

      // Anvil verify path: external call OUTSIDE tx, then short atomic DB commit.
      try {
        await this.blockchainGateway.verifyLoanCreated(
          dto.txHash,
          loan.assetId,
          dto.borrowerWallet,
          loan.principal
        );
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify loan creation on-chain: ${err.message}`);
      }

      return this.executeInTx(async () => {
        const l = await this.requireLoan(loanId);
        l.status = LoanStatus.Active;
        l.contractTxHash = dto.txHash;
        l.dueAt = new Date(Date.now() + l.durationDays * 24 * 60 * 60 * 1000);
        await this.repository.saveLoan(l);
        const asset = await this.requireAsset(l.assetId);
        asset.status = AssetStatus.LoanActive;
        await this.repository.saveAsset(asset);
        await this.audit(l.borrowerId, 'LOAN_ACCEPTED', 'Loan', l.id, { txHash: dto.txHash });
        return l;
      });
    }
  }

  async rejectLoan(loanId: string, actor?: { id: string; role: UserRole }): Promise<Loan> {
    return this.executeInTx(async () => {
      const loan = await this.requireLoan(loanId);
      if (actor && actor.role === UserRole.Customer) {
        if (loan.borrowerId !== actor.id) {
          throw new ForbiddenException('Cannot reject a loan offer for another user');
        }
      }
      if (loan.status !== LoanStatus.Offered) {
        throw new BadRequestException('Loan is not in OFFERED status');
      }
      
      // Customer-declined offers should not be treated as payment defaults.
      loan.status = LoanStatus.Rejected;
      await this.repository.saveLoan(loan);

      const asset = await this.requireAsset(loan.assetId);
      asset.status = AssetStatus.Received;
      await this.repository.saveAsset(asset);

      await this.audit(loan.borrowerId, 'LOAN_REJECTED', 'Loan', loan.id, {});
      return loan;
    });
  }

  async recordRepayment(dto: RecordRepaymentDto, actor?: { id: string; role: UserRole; wallet?: string }): Promise<Repayment> {
    // Validate loan status and actor before external call.
    const loan = await this.requireLoan(dto.loanId);
    if (loan.status !== LoanStatus.Active) {
      throw new BadRequestException(`Repayment can only be recorded for ACTIVE loans, currently ${loan.status}`);
    }
    if (actor && actor.role === UserRole.Customer) {
      if (loan.borrowerId !== actor.id) {
        throw new ForbiddenException('Cannot repay a loan for another user');
      }
    }

    const interest = (loan.principal * loan.aprBps * loan.durationDays) / 3650000;
    const amountDue = loan.principal + interest;
    if (dto.amount < amountDue) {
      throw new BadRequestException(`Repayment amount must be at least the amount due (${amountDue})`);
    }

    const borrowerWalletAddress = (actor?.id === loan.borrowerId && actor?.wallet)
      ? actor.wallet
      : (await this.repository.findWalletByUserId(loan.borrowerId))?.address;
    if (!borrowerWalletAddress) {
      throw new BadRequestException(`Borrower wallet not found for user ${loan.borrowerId}`);
    }

    // External blockchain call — outside DB transaction.
    try {
      await this.blockchainGateway.recordRepayment({
        loanId: dto.loanId,
        amount: dto.amount,
        txHash: dto.txHash,
        assetId: loan.assetId,
        borrowerWallet: borrowerWalletAddress
      });
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    // Short atomic DB write after blockchain confirms.
    return this.executeInTx(async () => {
      const l = await this.requireLoan(dto.loanId);
      l.status = LoanStatus.Repaid;
      await this.repository.saveLoan(l);

      const asset = await this.requireAsset(l.assetId);
      asset.status = AssetStatus.Returning;
      await this.repository.saveAsset(asset);

      const repayment = await this.repository.saveRepayment({
        id: randomUUID(),
        loanId: dto.loanId,
        amount: dto.amount,
        txHash: dto.txHash,
        paidAt: new Date()
      });
      await this.audit(l.borrowerId, 'LOAN_REPAID', 'Loan', l.id, { txHash: dto.txHash });
      return repayment;
    });
  }

  async createListing(dto: CreateListingDto, actor?: { id: string; role: UserRole; wallet?: string }): Promise<Listing | WalletExecutionResponse> {
    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';
    if (isAnvil && dto.isProtocolOwned) {
      throw new BadRequestException('Protocol-owned listings are not supported in Anvil mode yet.');
    }

    if (actor) {
      if (actor.role === UserRole.Staff) {
        throw new ForbiddenException('Staff cannot create marketplace listings');
      }
      if (actor.role === UserRole.Customer) {
        if (dto.isProtocolOwned) {
          throw new ForbiddenException('Customer cannot create protocol-owned listings');
        }
        dto.sellerId = actor.id;
      } else if (actor.role === UserRole.Admin) {
        if (!dto.isProtocolOwned) {
          throw new ForbiddenException('Admin can only create protocol-owned listings');
        }
        dto.sellerId = 'admin-1';
      }
    }

    if (!dto.sellerId) {
      throw new BadRequestException('Seller ID is required');
    }
    const sellerId = dto.sellerId;

    const asset = await this.requireAsset(dto.assetId);
    await this.assertNoDuplicateListingForAsset(dto.assetId);
    this.validateListingCreationRules(dto, actor, asset);

    if (isAnvil) {
      const sellerWalletAddress = await this.resolveWalletAddress(sellerId, actor);
      if (!sellerWalletAddress) {
        throw new BadRequestException(`No wallet found for seller ${sellerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareCreateListing({
          assetId: dto.assetId,
          sellerWallet: sellerWalletAddress,
          price: dto.price,
          isConsigned: true
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyListingCreated(
          dto.txHash,
          dto.assetId,
          sellerWalletAddress,
          dto.price
        );
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify listing on-chain: ${err.message}`);
      }
    }

    return this.executeInTx(async () => {
      const currentAsset = await this.requireAsset(dto.assetId);
      await this.assertNoDuplicateListingForAsset(dto.assetId);
      this.validateListingCreationRules(dto, actor, currentAsset);

      if (!dto.isProtocolOwned) {
        currentAsset.status = AssetStatus.Listed;
        await this.repository.saveAsset(currentAsset);
      }

      const listing = await this.repository.saveListing({
        id: randomUUID(),
        assetId: dto.assetId,
        sellerId: sellerId,
        price: dto.price,
        status: ListingStatus.Active,
        isProtocolOwned: dto.isProtocolOwned,
        createdAt: new Date()
      });

      await this.audit(sellerId, 'LISTING_CREATED', 'Listing', listing.id, {
        price: dto.price,
        assetId: dto.assetId,
        sellerId: sellerId,
        txHash: dto.txHash
      });

      return listing;
    });
  }

  listListings(): Promise<Listing[]> {
    return this.repository.listListings();
  }

  async createLayaway(dto: CreateLayawayDto, actor?: { id: string; role: UserRole; wallet?: string }): Promise<Layaway | WalletExecutionResponse> {
    if (actor && actor.role === UserRole.Customer) {
      dto.buyerId = actor.id;
    }
    if (!dto.buyerId) {
      throw new BadRequestException('buyerId is required to create a layaway');
    }

    const buyerId = dto.buyerId;
    const listing = await this.repository.findListing(dto.listingId);
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== ListingStatus.Active) {
      throw new BadRequestException('Listing is not active');
    }
    if (buyerId === listing.sellerId) {
      throw new BadRequestException('Seller cannot buy their own listing');
    }
    if (![3, 6, 9, 12].includes(dto.monthsDuration)) {
      throw new BadRequestException('Invalid duration: only 3, 6, 9, or 12 months allowed');
    }
    if (dto.downPayment <= 0) {
      throw new BadRequestException('Down payment must be positive');
    }
    if (dto.downPayment < listing.price * 0.2) {
      throw new BadRequestException('Down payment must be at least 20% of the price');
    }
    if (dto.downPayment >= listing.price) {
      throw new BadRequestException('Down payment must be less than the listing price');
    }
    await this.assertNoActiveLayawayForListing(dto.listingId);

    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';

    if (isAnvil) {
      const buyerWalletAddress = await this.resolveWalletAddress(buyerId, actor);
      if (!buyerWalletAddress) {
        throw new BadRequestException(`No wallet found for buyer ${buyerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareStartLayaway({
          assetId: listing.assetId,
          buyerWallet: buyerWalletAddress,
          downPayment: dto.downPayment,
          monthsDuration: dto.monthsDuration
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyLayawayStarted(
          dto.txHash,
          listing.assetId,
          buyerWalletAddress,
          dto.downPayment
        );
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify layaway on-chain: ${err.message}`);
      }
    }

    const { ethers } = await import('ethers');
    const downPaymentWei = ethers.parseEther(dto.downPayment.toString()).toString();

    return this.executeInTx(async () => {
      const currentListing = await this.repository.findListing(dto.listingId);
      if (!currentListing) throw new NotFoundException('Listing not found');
      if (currentListing.status !== ListingStatus.Active) {
        throw new BadRequestException('Listing is not active');
      }
      if (buyerId === currentListing.sellerId) {
        throw new BadRequestException('Seller cannot buy their own listing');
      }
      if (dto.downPayment < currentListing.price * 0.2) {
        throw new BadRequestException('Down payment must be at least 20% of the price');
      }
      if (dto.downPayment >= currentListing.price) {
        throw new BadRequestException('Down payment must be less than the listing price');
      }
      await this.assertNoActiveLayawayForListing(dto.listingId);

      const remainingAfterDown = currentListing.price - dto.downPayment;
      const installmentAmount = Math.floor(remainingAfterDown / dto.monthsDuration);

      const layaway = await this.repository.saveLayaway({
        id: randomUUID(),
        listingId: dto.listingId,
        buyerId,
        totalPrice: currentListing.price,
        amountPaid: dto.downPayment,
        deadline: new Date(Date.now() + dto.monthsDuration * 30 * 24 * 60 * 60 * 1000),
        status: LayawayStatus.Active,
        monthsDuration: dto.monthsDuration,
        installmentAmount,
        downPayment: dto.downPayment,
        paidInstallments: 0,
        amountPaidWei: downPaymentWei,
        downPaymentWei
      });

      currentListing.status = ListingStatus.Reserved;
      await this.repository.saveListing(currentListing);

      await this.audit(buyerId, 'LAYAWAY_STARTED', 'Layaway', layaway.id, {
        downPayment: dto.downPayment,
        monthsDuration: dto.monthsDuration,
        installmentAmount,
        txHash: dto.txHash
      });
      return layaway;
    });
  }

  async payLayaway(layawayId: string, dto: PayLayawayDto, actor?: { id: string; role: UserRole; wallet?: string }): Promise<Layaway | LayawayWalletExecutionResponse> {
    const layaway = await this.repository.findLayaway(layawayId);
    if (!layaway) throw new NotFoundException('Layaway not found');
    if (actor && actor.role === UserRole.Customer && layaway.buyerId !== actor.id) {
      throw new ForbiddenException('Cannot pay layaway installments for another user');
    }
    if (layaway.status !== LayawayStatus.Active) {
      throw new BadRequestException('Layaway is not active');
    }

    const listing = await this.repository.findListing(layaway.listingId);
    if (!listing) throw new NotFoundException('Listing not found for layaway');
    const asset = await this.requireAsset(listing.assetId);

    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';
    const { ethers } = await import('ethers');
    const precomputedPayment = await this.calculateLayawayPaymentState(layaway);

    if (isAnvil) {
      const buyerWalletAddress = await this.resolveWalletAddress(layaway.buyerId, actor);
      if (!buyerWalletAddress) {
        throw new BadRequestException(`No wallet found for buyer ${layaway.buyerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.preparePayLayawayInstallment({
          assetId: asset.id,
          buyerWallet: buyerWalletAddress,
          installmentAmount: precomputedPayment.requiredAmountWei
        });
        return {
          ...this.requireWalletExecution(result),
          nextInstallmentAmountWei: precomputedPayment.requiredAmountWei.toString(),
          nextInstallmentAmountDisplay: ethers.formatEther(precomputedPayment.requiredAmountWei)
        };
      }

      try {
        await this.blockchainGateway.verifyLayawayInstallmentPaid({
          txHash: dto.txHash,
          assetId: asset.id,
          buyerWallet: buyerWalletAddress,
          installmentAmount: precomputedPayment.requiredAmountWei,
          isFinal: precomputedPayment.isFinal
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify installment payment on-chain: ${err.message}`);
      }
    }

    return this.executeInTx(async () => {
      const currentLayaway = await this.repository.findLayaway(layawayId);
      if (!currentLayaway) throw new NotFoundException('Layaway not found');
      if (actor && actor.role === UserRole.Customer && currentLayaway.buyerId !== actor.id) {
        throw new ForbiddenException('Cannot pay layaway installments for another user');
      }
      if (currentLayaway.status !== LayawayStatus.Active) {
        throw new BadRequestException('Layaway is not active');
      }

      const currentListing = await this.repository.findListing(currentLayaway.listingId);
      if (!currentListing) throw new NotFoundException('Listing not found for layaway');
      const currentAsset = await this.requireAsset(currentListing.assetId);

      if (currentListing.status !== ListingStatus.Reserved && currentListing.status !== ListingStatus.Active) {
        throw new BadRequestException('Listing is not in a payable state');
      }

      if (isAnvil) {
        const currentPayment = await this.calculateLayawayPaymentState(currentLayaway);
        if (currentPayment.requiredAmountWei !== precomputedPayment.requiredAmountWei) {
          throw new ConflictException('Layaway payment state changed before commit');
        }

        const paidAmountUsdc = Number(ethers.formatEther(currentPayment.requiredAmountWei));
        currentLayaway.amountPaid += paidAmountUsdc;
        currentLayaway.paidInstallments = (currentLayaway.paidInstallments ?? 0) + 1;
        currentLayaway.amountPaidWei = (currentPayment.amountPaidWei + currentPayment.requiredAmountWei).toString();
        currentLayaway.lastPaymentTxHash = dto.txHash;

        await this.audit(currentLayaway.buyerId, 'LAYAWAY_INSTALLMENT_PAID', 'Layaway', layawayId, {
          amount: paidAmountUsdc,
          txHash: dto.txHash,
          isFinal: currentPayment.isFinal
        });

        if (currentPayment.isFinal) {
          currentLayaway.status = LayawayStatus.Completed;
          currentLayaway.completedTxHash = dto.txHash;
          currentListing.status = ListingStatus.Sold;
          await this.repository.saveListing(currentListing);

          currentAsset.ownerId = currentLayaway.buyerId;
          currentAsset.status = AssetStatus.Returning;
          await this.repository.saveAsset(currentAsset);

          await this.audit(currentLayaway.buyerId, 'LAYAWAY_COMPLETED', 'Layaway', layawayId, {
            txHash: dto.txHash,
            newOwnerId: currentLayaway.buyerId
          });
        }

        await this.repository.saveLayaway(currentLayaway);
        return currentLayaway;
      }

      const paymentAmount = dto.amount ?? currentLayaway.installmentAmount ?? 0;
      if (paymentAmount <= 0) {
        throw new BadRequestException('Layaway payment amount must be positive');
      }

      currentLayaway.amountPaid += paymentAmount;
      currentLayaway.paidInstallments = (currentLayaway.paidInstallments ?? 0) + 1;

      const downPaymentWei = BigInt(
        currentLayaway.downPaymentWei ?? ethers.parseEther((currentLayaway.downPayment ?? 0).toString()).toString()
      );
      const amountPaidWei = BigInt(currentLayaway.amountPaidWei ?? downPaymentWei.toString());
      const paymentWei = ethers.parseEther(paymentAmount.toString());
      currentLayaway.amountPaidWei = (amountPaidWei + paymentWei).toString();

      const isComplete =
        currentLayaway.amountPaid >= currentLayaway.totalPrice
        || (currentLayaway.paidInstallments ?? 0) >= (currentLayaway.monthsDuration ?? 6);

      if (isComplete) {
        currentLayaway.status = LayawayStatus.Completed;
        currentListing.status = ListingStatus.Sold;
        await this.repository.saveListing(currentListing);

        currentAsset.ownerId = currentLayaway.buyerId;
        currentAsset.status = AssetStatus.Returning;
        await this.repository.saveAsset(currentAsset);

        await this.audit(currentLayaway.buyerId, 'LAYAWAY_COMPLETED', 'Layaway', layawayId, { amount: paymentAmount });
      }

      await this.repository.saveLayaway(currentLayaway);
      await this.audit(currentLayaway.buyerId, 'LAYAWAY_INSTALLMENT_PAID', 'Layaway', layawayId, { amount: paymentAmount });
      return currentLayaway;
    });
  }

  async createDispute(dto: CreateDisputeDto, actor?: { id: string; role: UserRole }): Promise<Dispute> {
    return this.executeInTx(async () => {
      const asset = await this.requireAsset(dto.assetId);
      if (actor && actor.role === UserRole.Customer) {
        dto.openedBy = actor.id;
        if (asset.ownerId !== actor.id) {
          throw new ForbiddenException('Cannot open a dispute for another user\'s asset');
        }
      }

      const dashboard = await this.repository.getDashboard();
      const existingDispute = dashboard.disputes.find(
        (d) => d.assetId === dto.assetId && d.status === DisputeStatus.Open
      );
      if (existingDispute) {
        throw new ConflictException('An open dispute already exists for this asset');
      }

      const openedBy = dto.openedBy || 'system';
      const previousStatus = asset.status;
      asset.status = AssetStatus.Disputed;
      await this.repository.saveAsset(asset);

      const dispute = await this.repository.saveDispute({
        id: randomUUID(),
        assetId: dto.assetId,
        openedBy,
        status: DisputeStatus.Open,
        evidenceExportUri: dto.evidenceExportUri,
        createdAt: new Date(),
        previousAssetStatus: previousStatus
      });
      await this.audit(openedBy, 'DISPUTE_OPENED', 'Dispute', dispute.id, { assetId: dto.assetId });
      return dispute;
    });
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    return this.executeInTx(async () => {
      const dispute = await this.repository.findDispute(id);
      if (!dispute) throw new NotFoundException('Dispute not found');
      dispute.status = DisputeStatus.Resolved;
      dispute.resolution = dto.resolution;
      await this.repository.saveDispute(dispute);

      const asset = await this.repository.findAsset(dispute.assetId);
      if (asset) {
        asset.status = (dispute.previousAssetStatus as AssetStatus) || AssetStatus.Received;
        await this.repository.saveAsset(asset);
      }

      await this.audit('admin', 'DISPUTE_RESOLVED', 'Dispute', id, { resolution: dto.resolution });
      return dispute;
    });
  }

  async recordBlockchainWebhook(dto: BlockchainWebhookDto): Promise<BlockchainTransaction> {
    return this.executeInTx(async () => {
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
    });
  }

  async dashboard(actor?: { id: string; role: UserRole }): Promise<PawnDashboard> {
    const dash = await this.repository.getDashboard();
    if (!actor || actor.role === UserRole.Admin || actor.role === UserRole.Staff) {
      return dash;
    }

    return {
      assets: dash.assets.filter(a => a.ownerId === actor.id),
      loans: dash.loans.filter(l => l.borrowerId === actor.id),
      listings: dash.listings,
      disputes: dash.disputes.filter(d => d.openedBy === actor.id),
      layaways: dash.layaways.filter(l => l.buyerId === actor.id || (dash.listings.find(lis => lis.id === l.listingId)?.sellerId === actor.id)),
      auditEvents: dash.auditEvents.filter(e => e.actorId === actor.id),
      protocolFeesCollected: 0
    };
  }

  async listAssets(actor?: { id: string; role: UserRole }): Promise<Asset[]> {
    const assets = await this.repository.listAssets();
    if (actor && actor.role === UserRole.Customer) {
      return assets.filter(asset => asset.ownerId === actor.id);
    }
    return assets;
  }

  async listEvidence(assetId: string, actor?: { id: string; role: UserRole }): Promise<EvidenceFile[]> {
    const asset = await this.requireAsset(assetId);
    if (actor && actor.role === UserRole.Customer) {
      if (asset.ownerId !== actor.id) {
        throw new ForbiddenException('Cannot view evidence for another user\'s asset');
      }
    }
    const files = await this.repository.listEvidence(assetId);
    // Resolve local-object:// URIs to data URLs so the browser can display them
    const storageRoot = path.resolve(process.env.STORAGE_LOCAL_DIR ?? '.local-object-storage/evidence');
    return files.map(ev => {
      if (ev.uri && ev.uri.startsWith('local-object://')) {
        const relativePath = ev.uri.replace('local-object://', '');
        const fullPath = path.join(storageRoot, relativePath);
        try {
          const bytes = fs.readFileSync(fullPath);
          const ext = path.extname(relativePath).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.pdf': 'application/pdf',
            '.mp4': 'video/mp4',
            '.txt': 'text/plain'
          };
          const mime = mimeMap[ext] ?? 'application/octet-stream';
          return { ...ev, uri: `data:${mime};base64,${bytes.toString('base64')}` };
        } catch {
          // If the file is missing, return the raw local-object URI
          return ev;
        }
      }
      return ev;
    });
  }

  async reset(): Promise<void> {
    if (this.repository.reset) {
      await this.repository.reset();
    }
  }

  async fractionalizeAsset(dto: FractionalizeAssetDto, actor?: string | { id: string; role: UserRole; wallet?: string }): Promise<FractionalAsset | WalletExecutionResponse> {
    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';
    const asset = await this.requireAsset(dto.assetId);
    const existingFrac = await this.repository.findFractionalAsset(dto.assetId);
    if (existingFrac) {
      throw new ConflictException('Asset is already fractionalized');
    }
    if (dto.totalShares <= 0) {
      throw new BadRequestException('Shares must be > 0');
    }
    if (dto.targetPrice <= 0) {
      throw new BadRequestException('Price must be > 0');
    }
    if (dto.targetPrice % dto.totalShares !== 0) {
      throw new BadRequestException('Target price must be divisible by total shares');
    }

    const actorObj = typeof actor === 'string' ? { id: actor, role: UserRole.Customer } : actor;
    const actorId = actorObj?.id || 'system';
    const user = await this.repository.findUserById(actorId);
    const isAdmin =
      actorId === 'admin-1' || (actorObj && actorObj.role === UserRole.Admin) || (user && user.role === UserRole.Admin);

    if (!isAdmin && asset.ownerId !== actorId) {
      throw new ForbiddenException('Only asset owner or admin can fractionalize');
    }
    await this.assertAssetCanBeFractionalized(dto.assetId);

    if (isAnvil) {
      const ownerWalletAddress = await this.resolveWalletAddress(actorId, actorObj);
      if (!ownerWalletAddress) {
        throw new BadRequestException(`No wallet found for owner ${actorId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareFractionalizeAsset({
          assetId: dto.assetId,
          ownerWallet: ownerWalletAddress,
          totalShares: dto.totalShares,
          targetPrice: dto.targetPrice
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyAssetFractionalized({
          txHash: dto.txHash,
          assetId: dto.assetId,
          ownerWallet: ownerWalletAddress,
          totalShares: dto.totalShares,
          targetPrice: dto.targetPrice
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify fractionalization on-chain: ${err.message}`);
      }
    }

    return this.executeInTx(async () => {
      const currentAsset = await this.requireAsset(dto.assetId);
      const currentFrac = await this.repository.findFractionalAsset(dto.assetId);
      if (currentFrac) {
        throw new ConflictException('Asset is already fractionalized');
      }
      if (!isAdmin && currentAsset.ownerId !== actorId) {
        throw new ForbiddenException('Only asset owner or admin can fractionalize');
      }
      await this.assertAssetCanBeFractionalized(dto.assetId);

      currentAsset.status = AssetStatus.Fractionalized;
      await this.repository.saveAsset(currentAsset);

      const pricePerShare = dto.targetPrice / dto.totalShares;
      const fractionalAsset = await this.repository.saveFractionalAsset({
        assetId: dto.assetId,
        originalOwner: actorId,
        totalShares: dto.totalShares,
        availableShares: isAdmin ? dto.totalShares : 0,
        pricePerShare,
        status: isAdmin ? 'ACTIVE' : 'SOLD_OUT'
      });

      if (!isAdmin) {
        await this.repository.saveFractionalPosition({
          id: randomUUID(),
          assetId: dto.assetId,
          holderId: actorId,
          shares: dto.totalShares,
          totalShares: dto.totalShares
        });
      }

      await this.audit(actorId, 'ASSET_FRACTIONALIZED', 'Asset', dto.assetId, {
        totalShares: dto.totalShares,
        targetPrice: dto.targetPrice,
        txHash: dto.txHash
      });

      return fractionalAsset;
    });
  }

  async buyFractions(dto: BuyFractionsDto, actor?: string | { id: string; role: UserRole; wallet?: string }): Promise<FractionalAsset | WalletExecutionResponse> {
    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';

    const actorObj = typeof actor === 'string' ? { id: actor, role: UserRole.Customer } : actor;
    const buyerId = actorObj?.id || 'system';
    const buyerWalletAddress = await this.resolveWalletAddress(buyerId, actorObj);
    if (!buyerWalletAddress) {
      throw new BadRequestException(`No wallet found for buyer ${buyerId}`);
    }

    const buyerUser = await this.repository.findUserById(buyerId);
    if (!buyerUser || buyerUser.kycStatus !== KycStatus.Verified) {
      throw new ForbiddenException('KYC verification required to buy fractions');
    }

    const fracAsset = await this.repository.findFractionalAsset(dto.assetId);
    if (!fracAsset) {
      throw new NotFoundException('Fractional asset not found');
    }
    if (fracAsset.status !== 'ACTIVE') {
      throw new BadRequestException('Fractional asset is not active for buying');
    }
    if (dto.sharesToBuy <= 0) {
      throw new BadRequestException('Must buy at least 1 share');
    }
    if (fracAsset.availableShares < dto.sharesToBuy) {
      throw new BadRequestException('Not enough fractions available');
    }

    if (isAnvil) {
      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareBuyFractions({
          assetId: dto.assetId,
          buyerWallet: buyerWalletAddress,
          sharesToBuy: dto.sharesToBuy,
          pricePerShare: fracAsset.pricePerShare
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyFractionsPurchased({
          txHash: dto.txHash,
          assetId: dto.assetId,
          buyerWallet: buyerWalletAddress,
          sharesToBuy: dto.sharesToBuy,
          pricePerShare: fracAsset.pricePerShare
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify buy fractions on-chain: ${err.message}`);
      }
    }

    return this.executeInTx(async () => {
      const currentBuyer = await this.repository.findUserById(buyerId);
      if (!currentBuyer || currentBuyer.kycStatus !== KycStatus.Verified) {
        throw new ForbiddenException('KYC verification required to buy fractions');
      }

      const currentFracAsset = await this.repository.findFractionalAsset(dto.assetId);
      if (!currentFracAsset) {
        throw new NotFoundException('Fractional asset not found');
      }
      if (currentFracAsset.status !== 'ACTIVE') {
        throw new BadRequestException('Fractional asset is not active for buying');
      }
      if (currentFracAsset.availableShares < dto.sharesToBuy) {
        throw new BadRequestException('Not enough fractions available');
      }

      currentFracAsset.availableShares -= dto.sharesToBuy;
      if (currentFracAsset.availableShares === 0) {
        currentFracAsset.status = 'SOLD_OUT';
      }
      await this.repository.saveFractionalAsset(currentFracAsset);

      let position = await this.repository.findFractionalPositionByHolderAndAsset(buyerId, dto.assetId);
      if (position) {
        position.shares += dto.sharesToBuy;
      } else {
        position = {
          id: randomUUID(),
          assetId: dto.assetId,
          holderId: buyerId,
          shares: dto.sharesToBuy,
          totalShares: currentFracAsset.totalShares
        };
      }
      await this.repository.saveFractionalPosition(position);

      await this.audit(buyerId, 'FRACTIONS_BOUGHT', 'Asset', dto.assetId, {
        shares: dto.sharesToBuy,
        cost: dto.sharesToBuy * currentFracAsset.pricePerShare,
        txHash: dto.txHash
      });

      return currentFracAsset;
    });
  }

  async redeemAsset(dto: RedeemAssetDto, actor?: string | { id: string; role: UserRole; wallet?: string }): Promise<FractionalAsset | WalletExecutionResponse> {
    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';

    const actorObj = typeof actor === 'string' ? { id: actor, role: UserRole.Customer } : actor;
    const redeemerId = actorObj?.id || 'system';
    const fracAsset = await this.repository.findFractionalAsset(dto.assetId);
    if (!fracAsset) {
      throw new NotFoundException('Fractional asset not found');
    }
    if (fracAsset.status !== 'ACTIVE' && fracAsset.status !== 'SOLD_OUT') {
      throw new BadRequestException('Asset is not in a redeemable status');
    }

    const position = await this.repository.findFractionalPositionByHolderAndAsset(redeemerId, dto.assetId);
    if (!position || position.shares !== fracAsset.totalShares) {
      throw new BadRequestException('You must own 100% of the fractions to redeem the asset');
    }

    if (isAnvil) {
      const redeemerWalletAddress = await this.resolveWalletAddress(redeemerId, actorObj);
      if (!redeemerWalletAddress) {
        throw new BadRequestException(`No wallet found for redeemer ${redeemerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareRedeemAsset({
          assetId: dto.assetId,
          redeemerWallet: redeemerWalletAddress
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyAssetRedeemed({
          txHash: dto.txHash,
          assetId: dto.assetId,
          redeemerWallet: redeemerWalletAddress
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify redemption on-chain: ${err.message}`);
      }
    }

    return this.executeInTx(async () => {
      const currentFracAsset = await this.repository.findFractionalAsset(dto.assetId);
      if (!currentFracAsset) {
        throw new NotFoundException('Fractional asset not found');
      }
      if (currentFracAsset.status !== 'ACTIVE' && currentFracAsset.status !== 'SOLD_OUT') {
        throw new BadRequestException('Asset is not in a redeemable status');
      }

      const currentPosition = await this.repository.findFractionalPositionByHolderAndAsset(redeemerId, dto.assetId);
      if (!currentPosition || currentPosition.shares !== currentFracAsset.totalShares) {
        throw new BadRequestException('You must own 100% of the fractions to redeem the asset');
      }

      const currentAsset = await this.requireAsset(dto.assetId);
      currentFracAsset.status = 'REDEEMED';
      currentFracAsset.availableShares = 0;
      await this.repository.saveFractionalAsset(currentFracAsset);

      currentAsset.status = AssetStatus.Returning;
      currentAsset.ownerId = redeemerId;
      await this.repository.saveAsset(currentAsset);

      currentPosition.shares = 0;
      await this.repository.saveFractionalPosition(currentPosition);

      await this.audit(redeemerId, 'ASSET_REDEEMED', 'Asset', dto.assetId, {
        txHash: dto.txHash
      });

      return currentFracAsset;
    });
  }

  async listFractionalAssets(): Promise<FractionalAsset[]> {
    return this.repository.listFractionalAssets();
  }

  async findFractionalPositions(holderId: string): Promise<FractionalPosition[]> {
    const all = await this.repository.listFractionalPositions();
    return all.filter(p => p.holderId === holderId);
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
