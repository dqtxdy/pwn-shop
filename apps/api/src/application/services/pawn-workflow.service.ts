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
  UserRole
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

  async createAsset(dto: CreateAssetDto, actor?: { id: string; role: UserRole }): Promise<Asset> {
    if (actor && actor.role === UserRole.Customer) {
      dto.ownerId = actor.id;
    }
    const ownerId = dto.ownerId || 'system';
    const quote = await this.priceOracle.quoteAssetCategory(dto.category);
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
  }

  async uploadEvidence(dto: UploadEvidenceDto, actor?: { id: string; role: UserRole }): Promise<EvidenceFile> {
    const asset = await this.requireAsset(dto.assetId);
    if (actor) {
      dto.uploadedBy = actor.id;
      if (actor.role === UserRole.Customer) {
        if (asset.ownerId !== actor.id) {
          throw new ForbiddenException('Cannot upload evidence for another user\'s asset');
        }
      }
    }
    const uploadedBy = dto.uploadedBy || 'system';
    const stored = await this.storageProvider.storeEvidence({
      assetId: dto.assetId,
      uploadedBy,
      kind: dto.kind,
      fileName: dto.fileName,
      bytesBase64: dto.bytesBase64
    });
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
  }

  async createShipment(dto: CreateShipmentDto, actor?: { id: string; role: UserRole }): Promise<Shipment> {
    const asset = await this.requireAsset(dto.assetId);
    if (actor && actor.role === UserRole.Customer) {
      if (asset.ownerId !== actor.id) {
        throw new ForbiddenException('Cannot ship another user\'s asset');
      }
    }
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

    asset.status = result.status === ShipmentStatus.Delivered ? AssetStatus.Received : AssetStatus.InTransit;
    await this.repository.saveAsset(asset);
    await this.audit('system', 'SHIPMENT_CREATED', 'Asset', dto.assetId, { trackingCode: shipment.trackingCode });
    return shipment;
  }

  async trackShipment(assetId: string, actor?: { id: string; role: UserRole }): Promise<Shipment> {
    const asset = await this.repository.findAsset(assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    if (actor && actor.role === UserRole.Customer) {
      if (asset.ownerId !== actor.id) {
        throw new ForbiddenException('Cannot track shipment for an asset you do not own');
      }
    }

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

    const appraiserId = dto.appraiserId || 'system';

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

    await this.audit(appraiserId, 'APPRAISAL_CREATED', 'Asset', dto.assetId, {
      estimatedValue: dto.estimatedValue,
      txHash
    });
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

  async acceptLoan(loanId: string, dto: AcceptLoanDto, actor?: { id: string; role: UserRole }): Promise<Loan | WalletExecutionResponse> {
    const loan = await this.requireLoan(loanId);
    if (actor && actor.role === UserRole.Customer) {
      if (loan.borrowerId !== actor.id) {
        throw new ForbiddenException('Cannot accept a loan offer for another user');
      }
    }
    const config = this.blockchainGateway.getBlockchainConfig();

    if (config.mode === 'mock') {
      const tx = await this.blockchainGateway.prepareLoanDisbursement({
        assetId: loan.assetId,
        borrowerWallet: dto.borrowerWallet,
        principal: loan.principal,
        durationDays: loan.durationDays
      });
      const txHash = this.requirePreparedTx(tx);
      loan.status = LoanStatus.Active;
      loan.contractTxHash = txHash;
      loan.dueAt = new Date(Date.now() + loan.durationDays * 24 * 60 * 60 * 1000);
      await this.repository.saveLoan(loan);

      const asset = await this.requireAsset(loan.assetId);
      asset.status = AssetStatus.LoanActive;
      await this.repository.saveAsset(asset);
      await this.audit(loan.borrowerId, 'LOAN_ACCEPTED', 'Loan', loan.id, { txHash });
      return loan;
    } else {
      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareLoanDisbursement({
          assetId: loan.assetId,
          borrowerWallet: dto.borrowerWallet,
          principal: loan.principal,
          durationDays: loan.durationDays
        });
        return this.requireWalletExecution(result);
      }

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

      loan.status = LoanStatus.Active;
      loan.contractTxHash = dto.txHash;
      loan.dueAt = new Date(Date.now() + loan.durationDays * 24 * 60 * 60 * 1000);
      await this.repository.saveLoan(loan);

      const asset = await this.requireAsset(loan.assetId);
      asset.status = AssetStatus.LoanActive;
      await this.repository.saveAsset(asset);
      await this.audit(loan.borrowerId, 'LOAN_ACCEPTED', 'Loan', loan.id, { txHash: dto.txHash });
      return loan;
    }
  }

  async rejectLoan(loanId: string, actor?: { id: string; role: UserRole }): Promise<Loan> {
    const loan = await this.requireLoan(loanId);
    if (actor && actor.role === UserRole.Customer) {
      if (loan.borrowerId !== actor.id) {
        throw new ForbiddenException('Cannot reject a loan offer for another user');
      }
    }
    if (loan.status !== LoanStatus.Offered) {
      throw new BadRequestException('Loan is not in OFFERED status');
    }
    
    // Invalidate the loan offer and revert asset back to RECEIVED
    loan.status = LoanStatus.Defaulted;
    await this.repository.saveLoan(loan);

    const asset = await this.requireAsset(loan.assetId);
    asset.status = AssetStatus.Received;
    await this.repository.saveAsset(asset);

    await this.audit(loan.borrowerId, 'LOAN_REJECTED', 'Loan', loan.id, {});
    return loan;
  }

  async recordRepayment(dto: RecordRepaymentDto, actor?: { id: string; role: UserRole }): Promise<Repayment> {
    const loan = await this.requireLoan(dto.loanId);
    if (actor && actor.role === UserRole.Customer) {
      if (loan.borrowerId !== actor.id) {
        throw new ForbiddenException('Cannot repay a loan for another user');
      }
    }
    const borrowerWallet = await this.repository.findWalletByUserId(loan.borrowerId);
    if (!borrowerWallet) {
      throw new BadRequestException(`Borrower wallet not found for user ${loan.borrowerId}`);
    }

    try {
      await this.blockchainGateway.recordRepayment({
        loanId: dto.loanId,
        amount: dto.amount,
        txHash: dto.txHash,
        assetId: loan.assetId,
        borrowerWallet: borrowerWallet.address
      });
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
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

  async createListing(dto: CreateListingDto, actor?: { id: string; role: UserRole }): Promise<Listing | WalletExecutionResponse> {
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

    const asset = await this.requireAsset(dto.assetId);
    if (actor && actor.role === UserRole.Customer) {
      if (asset.ownerId !== actor.id) {
        throw new ForbiddenException('Cannot list another user\'s asset');
      }
    }

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
    }

    if (isAnvil) {
      const sellerWallet = await this.repository.findWalletByUserId(dto.sellerId);
      if (!sellerWallet) {
        throw new BadRequestException(`No wallet found for seller ${dto.sellerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareCreateListing({
          assetId: dto.assetId,
          sellerWallet: sellerWallet.address,
          price: dto.price,
          isConsigned: true
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyListingCreated(
          dto.txHash,
          dto.assetId,
          sellerWallet.address,
          dto.price
        );
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify listing on-chain: ${err.message}`);
      }
    }

    if (!dto.isProtocolOwned) {
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
      sellerId: dto.sellerId,
      txHash: dto.txHash
    });

    return listing;
  }

  listListings(): Promise<Listing[]> {
    return this.repository.listListings();
  }

  async createLayaway(dto: CreateLayawayDto, actor?: { id: string; role: UserRole }): Promise<Layaway | WalletExecutionResponse> {
    if (actor && actor.role === UserRole.Customer) {
      dto.buyerId = actor.id;
    }
    const buyerId = dto.buyerId || 'system';
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

    const layaways = await this.repository.listLayaways();
    const activeLayaway = layaways.find(
      (l) => l.listingId === dto.listingId && l.status === LayawayStatus.Active
    );
    if (activeLayaway) {
      throw new ConflictException('Active layaway already exists for this listing');
    }

    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';

    if (isAnvil) {
      const buyerWallet = await this.repository.findWalletByUserId(buyerId);
      if (!buyerWallet) {
        throw new BadRequestException(`No wallet found for buyer ${buyerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareStartLayaway({
          assetId: listing.assetId,
          buyerWallet: buyerWallet.address,
          downPayment: dto.downPayment,
          monthsDuration: dto.monthsDuration
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyLayawayStarted(
          dto.txHash,
          listing.assetId,
          buyerWallet.address,
          dto.downPayment
        );
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify layaway on-chain: ${err.message}`);
      }
    }

    const { ethers } = await import('ethers');
    const downPaymentWei = ethers.parseEther(dto.downPayment.toString()).toString();

    // installmentAmount mirrors Solidity: (totalPrice - initialPayment) / monthsDuration
    const remainingAfterDown = listing.price - dto.downPayment;
    const installmentAmount = Math.floor(remainingAfterDown / dto.monthsDuration);

    const layaway = await this.repository.saveLayaway({
      id: randomUUID(),
      listingId: dto.listingId,
      buyerId,
      totalPrice: listing.price,
      amountPaid: dto.downPayment,
      deadline: new Date(Date.now() + dto.monthsDuration * 30 * 24 * 60 * 60 * 1000),
      status: LayawayStatus.Active,
      monthsDuration: dto.monthsDuration,
      installmentAmount,
      downPayment: dto.downPayment,
      paidInstallments: 0,
      amountPaidWei: downPaymentWei,
      downPaymentWei: downPaymentWei
    });

    listing.status = ListingStatus.Reserved;
    await this.repository.saveListing(listing);

    await this.audit(buyerId, 'LAYAWAY_STARTED', 'Layaway', layaway.id, {
      downPayment: dto.downPayment,
      monthsDuration: dto.monthsDuration,
      installmentAmount,
      txHash: dto.txHash
    });
    return layaway;
  }

  async payLayaway(layawayId: string, dto: PayLayawayDto, actor?: { id: string; role: UserRole }): Promise<Layaway | LayawayWalletExecutionResponse> {
    const layaway = await this.repository.findLayaway(layawayId);
    if (!layaway) throw new NotFoundException('Layaway not found');
    if (actor && actor.role === UserRole.Customer) {
      if (layaway.buyerId !== actor.id) {
        throw new ForbiddenException('Cannot pay layaway installments for another user');
      }
    }
    if (layaway.status !== LayawayStatus.Active) {
      throw new BadRequestException('Layaway is not active');
    }

    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';
    const { ethers } = await import('ethers');

    if (isAnvil) {
      // Find the listing and asset
      const listing = await this.repository.findListing(layaway.listingId);
      if (!listing) throw new NotFoundException('Listing not found for layaway');

      const asset = await this.requireAsset(listing.assetId);

      // Find buyer wallet
      const buyerWallet = await this.repository.findWalletByUserId(layaway.buyerId);
      if (!buyerWallet) {
        throw new BadRequestException(`No wallet found for buyer ${layaway.buyerId}`);
      }

      // Calculate required installment amount (must match Solidity logic exactly)
      const totalPriceWei = ethers.parseEther(layaway.totalPrice.toString());

      // Calculate exact installmentAmount in Wei using downPayment to avoid JS float precision issues
      const downPaymentVal = layaway.downPayment ?? (layaway.totalPrice - (layaway.installmentAmount ?? 0) * (layaway.monthsDuration ?? 6));
      const downPaymentWei = BigInt(layaway.downPaymentWei ?? ethers.parseEther(downPaymentVal.toString()).toString());
      const remainingAfterDownWei = totalPriceWei - downPaymentWei;
      const installmentWei = remainingAfterDownWei / BigInt(layaway.monthsDuration ?? 6);

      // Read amountPaidWei and paidInstallments from precise state, falling back to derived values only if absent
      const amountPaidWei = BigInt(layaway.amountPaidWei ?? downPaymentWei.toString());
      const remainingWei = totalPriceWei - amountPaidWei;

      // Mirror Solidity last-payment edge case:
      // if (remaining < requiredAmount || remaining - requiredAmount < requiredAmount) → requiredAmount = remaining
      let requiredAmountWei: bigint;
      if (remainingWei <= installmentWei || (remainingWei - installmentWei) < installmentWei) {
        requiredAmountWei = remainingWei;
      } else {
        requiredAmountWei = installmentWei;
      }

      const isFinal = (amountPaidWei + requiredAmountWei) >= totalPriceWei;

      if (!dto.txHash) {
        // Phase 1: Prepare wallet actions
        const result = await this.blockchainGateway.preparePayLayawayInstallment({
          assetId: asset.id,
          buyerWallet: buyerWallet.address,
          installmentAmount: requiredAmountWei
        });
        return {
          ...this.requireWalletExecution(result),
          nextInstallmentAmountWei: requiredAmountWei.toString(),
          nextInstallmentAmountDisplay: ethers.formatEther(requiredAmountWei)
        };
      }

      // Phase 2: Verify and commit
      try {
        await this.blockchainGateway.verifyLayawayInstallmentPaid({
          txHash: dto.txHash,
          assetId: asset.id,
          buyerWallet: buyerWallet.address,
          installmentAmount: requiredAmountWei,
          isFinal
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify installment payment on-chain: ${err.message}`);
      }

      // Convert requiredAmountWei back to USDC units (integer) by parsing formatted ether
      const paidAmountUsdc = Number(ethers.formatEther(requiredAmountWei));
      layaway.amountPaid += paidAmountUsdc;
      layaway.paidInstallments = (layaway.paidInstallments ?? 0) + 1;
      layaway.amountPaidWei = (amountPaidWei + requiredAmountWei).toString();
      layaway.lastPaymentTxHash = dto.txHash;

      await this.audit(layaway.buyerId, 'LAYAWAY_INSTALLMENT_PAID', 'Layaway', layawayId, {
        amount: paidAmountUsdc,
        txHash: dto.txHash,
        isFinal
      });

      if (isFinal) {
        layaway.status = LayawayStatus.Completed;
        layaway.completedTxHash = dto.txHash;

        const listing = await this.repository.findListing(layaway.listingId);
        if (listing) {
          listing.status = ListingStatus.Sold;
          await this.repository.saveListing(listing);
        }

        // Transfer asset ownership to buyer
        asset.ownerId = layaway.buyerId;
        asset.status = AssetStatus.Returning;
        await this.repository.saveAsset(asset);

        await this.audit(layaway.buyerId, 'LAYAWAY_COMPLETED', 'Layaway', layawayId, {
          txHash: dto.txHash,
          newOwnerId: layaway.buyerId
        });
      }

      await this.repository.saveLayaway(layaway);
      return layaway;
    }

    // Mock mode: simple amount accumulation using either passed or default installment amount
    const mockInstallment = dto.amount ?? layaway.installmentAmount ?? 0;
    layaway.amountPaid += mockInstallment;
    layaway.paidInstallments = (layaway.paidInstallments ?? 0) + 1;

    const mockDownPaymentWei = BigInt(layaway.downPaymentWei ?? ethers.parseEther((layaway.downPayment ?? 0).toString()).toString());
    const mockAmountPaidWei = BigInt(layaway.amountPaidWei ?? mockDownPaymentWei.toString());
    const mockInstallmentWei = ethers.parseEther(mockInstallment.toString());
    layaway.amountPaidWei = (mockAmountPaidWei + mockInstallmentWei).toString();

    if (layaway.amountPaid >= layaway.totalPrice || (layaway.paidInstallments ?? 0) >= (layaway.monthsDuration ?? 6)) {
      layaway.status = LayawayStatus.Completed;
      const listing = await this.repository.findListing(layaway.listingId);
      if (listing) {
        listing.status = ListingStatus.Sold;
        await this.repository.saveListing(listing);
      }
      const asset = await this.requireAsset(
        (await this.repository.findListing(layaway.listingId))?.assetId ?? ''
      ).catch(() => null);
      if (asset) {
        asset.ownerId = layaway.buyerId;
        asset.status = AssetStatus.Returning;
        await this.repository.saveAsset(asset);
      }
      await this.audit(layaway.buyerId, 'LAYAWAY_COMPLETED', 'Layaway', layawayId, { amount: mockInstallment });
    }

    await this.repository.saveLayaway(layaway);
    await this.audit(layaway.buyerId, 'LAYAWAY_INSTALLMENT_PAID', 'Layaway', layawayId, { amount: mockInstallment });
    return layaway;
  }

  async createDispute(dto: CreateDisputeDto, actor?: { id: string; role: UserRole }): Promise<Dispute> {
    const asset = await this.requireAsset(dto.assetId);
    if (actor && actor.role === UserRole.Customer) {
      dto.openedBy = actor.id;
      if (asset.ownerId !== actor.id) {
        throw new ForbiddenException('Cannot open a dispute for another user\'s asset');
      }
    }
    const openedBy = dto.openedBy || 'system';
    asset.status = AssetStatus.Disputed;
    await this.repository.saveAsset(asset);

    const dispute = await this.repository.saveDispute({
      id: randomUUID(),
      assetId: dto.assetId,
      openedBy,
      status: DisputeStatus.Open,
      evidenceExportUri: dto.evidenceExportUri,
      createdAt: new Date()
    });
    await this.audit(openedBy, 'DISPUTE_OPENED', 'Dispute', dispute.id, { assetId: dto.assetId });
    return dispute;
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.repository.findDispute(id);
    if (!dispute) throw new NotFoundException('Dispute not found');
    dispute.status = DisputeStatus.Resolved;
    dispute.resolution = dto.resolution;
    await this.repository.saveDispute(dispute);

    // Also update asset status back to RECEIVED so it can be listed/re-appraised
    const asset = await this.repository.findAsset(dispute.assetId);
    if (asset) {
      asset.status = AssetStatus.Received;
      await this.repository.saveAsset(asset);
    }

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

  async fractionalizeAsset(dto: FractionalizeAssetDto, actorId: string): Promise<FractionalAsset | WalletExecutionResponse> {
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

    const wallet = await this.repository.findWalletByUserId(actorId);
    const user = wallet ? await this.repository.findUserByWallet(wallet.address) : undefined;
    const isAdmin = actorId === 'admin-1' || (user && user.role === 'ADMIN');

    if (!isAdmin && asset.ownerId !== actorId) {
      throw new ForbiddenException('Only asset owner or admin can fractionalize');
    }

    const dashboard = await this.repository.getDashboard();

    // Check for active loan
    const activeLoan = dashboard.loans.find(l => l.assetId === asset.id && l.status === LoanStatus.Active);
    if (activeLoan) {
      throw new BadRequestException('Asset has an active loan');
    }

    // Check for active listing/layaway
    const activeListing = dashboard.listings.find(l => l.assetId === asset.id && l.status === ListingStatus.Active);
    if (activeListing) {
      const activeLayaway = dashboard.layaways.find(lay => lay.listingId === activeListing.id && lay.status === LayawayStatus.Active);
      if (activeLayaway) {
        throw new BadRequestException('Asset has an active layaway');
      }
    }

    // Check for active dispute
    const activeDispute = dashboard.disputes.find(d => d.assetId === asset.id && d.status === DisputeStatus.Open);
    if (activeDispute) {
      throw new BadRequestException('Asset has an active dispute');
    }

    if (isAnvil) {
      const ownerWallet = await this.repository.findWalletByUserId(actorId);
      if (!ownerWallet) {
        throw new BadRequestException(`No wallet found for owner ${actorId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareFractionalizeAsset({
          assetId: dto.assetId,
          ownerWallet: ownerWallet.address,
          totalShares: dto.totalShares,
          targetPrice: dto.targetPrice
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyAssetFractionalized({
          txHash: dto.txHash,
          assetId: dto.assetId,
          ownerWallet: ownerWallet.address,
          totalShares: dto.totalShares,
          targetPrice: dto.targetPrice
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify fractionalization on-chain: ${err.message}`);
      }
    }

    // State updates
    asset.status = AssetStatus.Fractionalized;
    await this.repository.saveAsset(asset);

    const pricePerShare = dto.targetPrice / dto.totalShares;
    const fractionalAsset = await this.repository.saveFractionalAsset({
      assetId: dto.assetId,
      originalOwner: isAdmin ? 'system' : actorId,
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
  }

  async buyFractions(dto: BuyFractionsDto, buyerId: string): Promise<FractionalAsset | WalletExecutionResponse> {
    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';

    const buyerWallet = await this.repository.findWalletByUserId(buyerId);
    if (!buyerWallet) {
      throw new BadRequestException(`No wallet found for buyer ${buyerId}`);
    }

    const buyerUser = await this.repository.findUserByWallet(buyerWallet.address);
    if (!buyerUser || buyerUser.kycStatus !== 'VERIFIED') {
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
          buyerWallet: buyerWallet.address,
          sharesToBuy: dto.sharesToBuy,
          pricePerShare: fracAsset.pricePerShare
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyFractionsPurchased({
          txHash: dto.txHash,
          assetId: dto.assetId,
          buyerWallet: buyerWallet.address,
          sharesToBuy: dto.sharesToBuy,
          pricePerShare: fracAsset.pricePerShare
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify buy fractions on-chain: ${err.message}`);
      }
    }

    fracAsset.availableShares -= dto.sharesToBuy;
    if (fracAsset.availableShares === 0) {
      fracAsset.status = 'SOLD_OUT';
    }
    await this.repository.saveFractionalAsset(fracAsset);

    let position = await this.repository.findFractionalPositionByHolderAndAsset(buyerId, dto.assetId);
    if (position) {
      position.shares += dto.sharesToBuy;
    } else {
      position = {
        id: randomUUID(),
        assetId: dto.assetId,
        holderId: buyerId,
        shares: dto.sharesToBuy,
        totalShares: fracAsset.totalShares
      };
    }
    await this.repository.saveFractionalPosition(position);

    await this.audit(buyerId, 'FRACTIONS_BOUGHT', 'Asset', dto.assetId, {
      shares: dto.sharesToBuy,
      cost: dto.sharesToBuy * fracAsset.pricePerShare,
      txHash: dto.txHash
    });

    return fracAsset;
  }

  async redeemAsset(dto: RedeemAssetDto, redeemerId: string): Promise<FractionalAsset | WalletExecutionResponse> {
    const config = this.blockchainGateway.getBlockchainConfig();
    const isAnvil = config.mode === 'anvil';

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
      const redeemerWallet = await this.repository.findWalletByUserId(redeemerId);
      if (!redeemerWallet) {
        throw new BadRequestException(`No wallet found for redeemer ${redeemerId}`);
      }

      if (!dto.txHash) {
        const result = await this.blockchainGateway.prepareRedeemAsset({
          assetId: dto.assetId,
          redeemerWallet: redeemerWallet.address
        });
        return this.requireWalletExecution(result);
      }

      try {
        await this.blockchainGateway.verifyAssetRedeemed({
          txHash: dto.txHash,
          assetId: dto.assetId,
          redeemerWallet: redeemerWallet.address
        });
      } catch (err: any) {
        throw new BadRequestException(`Failed to verify redemption on-chain: ${err.message}`);
      }
    }

    fracAsset.status = 'REDEEMED';
    fracAsset.availableShares = 0;
    await this.repository.saveFractionalAsset(fracAsset);

    const asset = await this.requireAsset(dto.assetId);
    asset.status = AssetStatus.Returning;
    asset.ownerId = redeemerId;
    await this.repository.saveAsset(asset);

    position.shares = 0;
    await this.repository.saveFractionalPosition(position);

    await this.audit(redeemerId, 'ASSET_REDEEMED', 'Asset', dto.assetId, {
      txHash: dto.txHash
    });

    return fracAsset;
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
