import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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
  Wallet,
  FractionalAsset,
  FractionalPosition
} from '../../../domain/models';
import {
  AssetStatus,
  EvidenceKind,
  ShipmentDirection,
  ShipmentStatus,
  LoanStatus,
  ListingStatus,
  UserRole,
  KycStatus
} from '../../../domain/enums';
import { PawnRepository } from '../../../application/ports/pawn-repository';

@Injectable()
export class InMemoryPawnRepository implements PawnRepository {
  constructor() {
    this.initializeSeededData();
  }

  private initializeSeededData() {
    const now = new Date();

    // Seed demo users. Both customer accounts share the CUSTOMER role and can
    // buy, sell, fractionalize, and redeem under the same business rules.
    const customerUser: User = {
      id: 'customer-1',
      displayName: 'Demo Customer 1',
      role: UserRole.Customer,
      kycStatus: KycStatus.Verified,
      createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
    };
    const customer2User: User = {
      id: 'customer-2',
      displayName: 'Demo Customer 2',
      role: UserRole.Customer,
      kycStatus: KycStatus.Verified,
      createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
    };
    const staffUser: User = {
      id: 'staff-1',
      displayName: 'Demo Staff / Validator',
      role: UserRole.Staff,
      kycStatus: KycStatus.Verified,
      createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
    };
    const adminUser: User = {
      id: 'admin-1',
      displayName: 'Demo Admin',
      role: UserRole.Admin,
      kycStatus: KycStatus.Verified,
      createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
    };
    this.users.set(customerUser.id, customerUser);
    this.users.set(customer2User.id, customer2User);
    this.users.set(staffUser.id, staffUser);
    this.users.set(adminUser.id, adminUser);

    // Seed wallets
    const customerWallet: Wallet = {
      id: 'wallet-customer-1',
      userId: 'customer-1',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      verifiedAt: now
    };
    const customer2Wallet: Wallet = {
      id: 'wallet-customer-2',
      userId: 'customer-2',
      address: '0x4444444444444444444444444444444444444444',
      chainId: 1,
      verifiedAt: now
    };
    const staffWallet: Wallet = {
      id: 'wallet-staff-1',
      userId: 'staff-1',
      address: '0x2222222222222222222222222222222222222222',
      chainId: 1,
      verifiedAt: now
    };
    const adminWallet: Wallet = {
      id: 'wallet-admin-1',
      userId: 'admin-1',
      address: '0x3333333333333333333333333333333333333333',
      chainId: 1,
      verifiedAt: now
    };
    this.wallets.set(customerWallet.id, customerWallet);
    this.wallets.set(customer2Wallet.id, customer2Wallet);
    this.wallets.set(staffWallet.id, staffWallet);
    this.wallets.set(adminWallet.id, adminWallet);

    const asset1: Asset = {
      id: 'A-1001',
      ownerId: 'customer-1',
      title: '18K gold necklace',
      category: 'gold',
      description: 'Beautiful 18K gold necklace with receipt',
      status: AssetStatus.UnderAppraisal,
      declaredValue: 2400,
      createdAt: new Date(now.getTime() - 2 * 3600000)
    };
    const asset2: Asset = {
      id: 'A-1002',
      ownerId: 'customer-1',
      title: 'MacBook Pro M3',
      category: 'electronics',
      description: '16GB RAM, 512GB SSD, Space Gray',
      status: process.env.BLOCKCHAIN_MODE === 'anvil' ? AssetStatus.Received : AssetStatus.LoanActive,
      declaredValue: 1800,
      createdAt: new Date(now.getTime() - 24 * 3600000)
    };
    const asset3: Asset = {
      id: 'A-1003',
      ownerId: 'customer-1',
      title: 'Rolex Datejust',
      category: 'watch',
      description: 'Steel and gold, blue dial, boxes and papers',
      status: AssetStatus.AwaitingShipment,
      declaredValue: 8000,
      createdAt: new Date(now.getTime() - 1 * 3600000)
    };
    const asset4: Asset = {
      id: 'A-1004',
      ownerId: 'customer-1',
      title: 'Gold ring set',
      category: 'gold',
      description: 'Set of 3 stackable 14K gold rings',
      status: AssetStatus.Received,
      declaredValue: 1500,
      createdAt: new Date(now.getTime() - 3 * 3600000)
    };
    const asset5: Asset = {
      id: 'A-1005',
      ownerId: 'customer-1',
      title: 'Vintage Diamond Brooch',
      category: 'jewelry',
      description: 'Listed protocol-owned or defaulted asset',
      status: AssetStatus.Listed,
      declaredValue: 3000,
      createdAt: new Date(now.getTime() - 48 * 3600000)
    };

    this.assets.set(asset1.id, asset1);
    this.assets.set(asset2.id, asset2);
    this.assets.set(asset3.id, asset3);
    this.assets.set(asset4.id, asset4);
    this.assets.set(asset5.id, asset5);

    const shipment1: Shipment = {
      id: 'S-101',
      assetId: 'A-1001',
      direction: ShipmentDirection.ToShop,
      carrier: 'FedEx',
      trackingCode: 'VNPOST-4481',
      status: ShipmentStatus.Delivered,
      codRequired: false,
      updatedAt: new Date(now.getTime() - 1.5 * 3600000)
    };
    const shipment2: Shipment = {
      id: 'S-102',
      assetId: 'A-1002',
      direction: ShipmentDirection.ToShop,
      carrier: 'DHL',
      trackingCode: 'VIETTEL-9104',
      status: ShipmentStatus.Delivered,
      codRequired: false,
      updatedAt: new Date(now.getTime() - 23 * 3600000)
    };
    this.shipments.set(shipment1.id, shipment1);
    this.shipments.set(shipment2.id, shipment2);

    const appraisal1: Appraisal = {
      id: 'AP-101',
      assetId: 'A-1001',
      appraiserId: 'staff-1',
      estimatedValue: 2400,
      ltvBps: 6000,
      interestAprBps: 500,
      acceptedByCustomer: false,
      createdAt: new Date(now.getTime() - 1.2 * 3600000)
    };
    const appraisal2: Appraisal = {
      id: 'AP-102',
      assetId: 'A-1002',
      appraiserId: 'staff-1',
      estimatedValue: 1800,
      ltvBps: 6000,
      interestAprBps: 500,
      acceptedByCustomer: true,
      createdAt: new Date(now.getTime() - 22 * 3600000)
    };
    this.appraisals.set(appraisal1.id, appraisal1);

    if (process.env.BLOCKCHAIN_MODE !== 'anvil') {
      this.appraisals.set(appraisal2.id, appraisal2);

      const loan2: Loan = {
        id: 'L-202',
        assetId: 'A-1002',
        borrowerId: 'customer-1',
        principal: 1080,
        aprBps: 500,
        durationDays: 30,
        status: LoanStatus.Active,
        contractTxHash: '0x3a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f901a2b3c4d5e6f',
        dueAt: new Date(now.getTime() + 29 * 24 * 3600000),
        createdAt: new Date(now.getTime() - 22 * 3600000)
      };
      this.loans.set(loan2.id, loan2);
    }

    const listing1: Listing = {
      id: 'LIST-001',
      assetId: 'A-1005',
      sellerId: 'admin-1',
      price: 3200,
      status: ListingStatus.Active,
      isProtocolOwned: true,
      createdAt: new Date(now.getTime() - 24 * 3600000)
    };
    this.listings.set(listing1.id, listing1);

    const event1: AuditEvent = {
      id: 'E-1',
      actorId: 'customer-1',
      action: 'ASSET_SUBMITTED',
      aggregateType: 'Asset',
      aggregateId: 'A-1001',
      metadata: { category: 'gold' },
      createdAt: new Date(now.getTime() - 2 * 3600000)
    };
    const event2: AuditEvent = {
      id: 'E-2',
      actorId: 'customer-1',
      action: 'LOAN_ACCEPTED',
      aggregateType: 'Loan',
      aggregateId: 'L-202',
      metadata: { txHash: '0x3a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f901a2b3c4d5e6f' },
      createdAt: new Date(now.getTime() - 22 * 3600000)
    };
    const event3: AuditEvent = {
      id: 'E-3',
      actorId: 'system',
      action: 'SHIPMENT_CREATED',
      aggregateType: 'Asset',
      aggregateId: 'A-1001',
      metadata: { trackingCode: 'VNPOST-4481' },
      createdAt: new Date(now.getTime() - 1.5 * 3600000)
    };
    this.auditEvents.set(event1.id, event1);
    if (process.env.BLOCKCHAIN_MODE !== 'anvil') {
      this.auditEvents.set(event2.id, event2);
    }
    this.auditEvents.set(event3.id, event3);

    if (process.env.BLOCKCHAIN_MODE === 'anvil') {
      // update seeded wallets
       const walletCustomer = this.wallets.get('wallet-customer-1');
      if (walletCustomer) {
        walletCustomer.address = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
        walletCustomer.chainId = 31337;
      }
      const walletCustomer2 = this.wallets.get('wallet-customer-2');
      if (walletCustomer2) {
        walletCustomer2.address = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
        walletCustomer2.chainId = 31337;
      }
      const walletStaff = this.wallets.get('wallet-staff-1');
      if (walletStaff) {
        walletStaff.address = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
        walletStaff.chainId = 31337;
      }
      const walletAdmin = this.wallets.get('wallet-admin-1');
      if (walletAdmin) {
        walletAdmin.address = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
        walletAdmin.chainId = 31337;
      }

      // load local-anvil.json
      const pathsToTry = [
        path.resolve(process.cwd(), '../../PawnShop-SmartContract/deployments/local-anvil.json'),
        path.resolve(process.cwd(), 'PawnShop-SmartContract/deployments/local-anvil.json'),
        path.resolve(__dirname, '../../../../../PawnShop-SmartContract/deployments/local-anvil.json'),
        path.resolve(__dirname, '../../../../PawnShop-SmartContract/deployments/local-anvil.json'),
      ];

      let tokenIdMap: Record<string, number> = {};
      for (const p of pathsToTry) {
        try {
          if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const artifact = JSON.parse(content);
            if (artifact.tokenIdMap) {
              tokenIdMap = typeof artifact.tokenIdMap === 'string'
                ? JSON.parse(artifact.tokenIdMap)
                : artifact.tokenIdMap;
            }
            break;
          }
        } catch (err) {
          // continue
        }
      }

      // Populate tokenId on seeded assets
      for (const [id, asset] of this.assets.entries()) {
        if (tokenIdMap[id] !== undefined) {
          asset.tokenId = String(tokenIdMap[id]);
        }
      }
    }
  }

  async reset(): Promise<void> {
    this.users.clear();
    this.wallets.clear();
    this.kycVerifications.clear();
    this.assets.clear();
    this.evidence.clear();
    this.shipments.clear();
    this.appraisals.clear();
    this.loans.clear();
    this.repayments.clear();
    this.listings.clear();
    this.layaways.clear();
    this.disputes.clear();
    this.auditEvents.clear();
    this.blockchainTransactions.clear();
    this.fractionalAssets.clear();
    this.fractionalPositions.clear();
    this.protocolFeesCollected = 8420;

    this.initializeSeededData();
  }

  private protocolFeesCollected = 8420;

  private readonly users = new Map<string, User>();
  private readonly wallets = new Map<string, Wallet>();
  private readonly kycVerifications = new Map<string, KycVerification>();
  private readonly assets = new Map<string, Asset>();
  private readonly evidence = new Map<string, EvidenceFile>();
  private readonly shipments = new Map<string, Shipment>();
  private readonly appraisals = new Map<string, Appraisal>();
  private readonly loans = new Map<string, Loan>();
  private readonly repayments = new Map<string, Repayment>();
  private readonly listings = new Map<string, Listing>();
  private readonly layaways = new Map<string, Layaway>();
  private readonly disputes = new Map<string, Dispute>();
  private readonly auditEvents = new Map<string, AuditEvent>();
  private readonly blockchainTransactions = new Map<string, BlockchainTransaction>();
  private readonly fractionalAssets = new Map<string, FractionalAsset>();
  private readonly fractionalPositions = new Map<string, FractionalPosition>();

  async saveUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  async findUserByWallet(address: string): Promise<User | undefined> {
    const wallet = [...this.wallets.values()].find((candidate) => candidate.address === address.toLowerCase());
    return wallet ? this.users.get(wallet.userId) : undefined;
  }

  async saveWallet(wallet: Wallet): Promise<Wallet> {
    wallet.address = wallet.address.toLowerCase();
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  async saveKycVerification(verification: KycVerification): Promise<KycVerification> {
    this.kycVerifications.set(verification.id, verification);
    return verification;
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    this.assets.set(asset.id, asset);
    return asset;
  }

  async findAsset(id: string): Promise<Asset | undefined> {
    return this.assets.get(id);
  }

  async listAssets(): Promise<Asset[]> {
    return [...this.assets.values()];
  }

  async saveEvidence(file: EvidenceFile): Promise<EvidenceFile> {
    this.evidence.set(file.id, file);
    return file;
  }

  async listEvidence(assetId: string): Promise<EvidenceFile[]> {
    return [...this.evidence.values()].filter((file) => file.assetId === assetId);
  }

  async saveShipment(shipment: Shipment): Promise<Shipment> {
    this.shipments.set(shipment.id, shipment);
    return shipment;
  }

  async findShipment(assetId: string): Promise<Shipment | undefined> {
    return [...this.shipments.values()].find((shipment) => shipment.assetId === assetId);
  }

  async saveAppraisal(appraisal: Appraisal): Promise<Appraisal> {
    this.appraisals.set(appraisal.id, appraisal);
    return appraisal;
  }

  async saveLoan(loan: Loan): Promise<Loan> {
    this.loans.set(loan.id, loan);
    return loan;
  }

  async findLoan(id: string): Promise<Loan | undefined> {
    return this.loans.get(id);
  }

  async saveRepayment(repayment: Repayment): Promise<Repayment> {
    this.repayments.set(repayment.id, repayment);
    this.protocolFeesCollected += 50;
    return repayment;
  }

  async saveListing(listing: Listing): Promise<Listing> {
    this.listings.set(listing.id, listing);
    return listing;
  }

  async findListing(id: string): Promise<Listing | undefined> {
    return this.listings.get(id);
  }

  async listListings(): Promise<Listing[]> {
    return [...this.listings.values()];
  }

  async saveLayaway(layaway: Layaway): Promise<Layaway> {
    this.layaways.set(layaway.id, layaway);
    return layaway;
  }

  async findLayaway(id: string): Promise<Layaway | undefined> {
    return this.layaways.get(id);
  }

  async listLayaways(): Promise<Layaway[]> {
    return [...this.layaways.values()];
  }

  async saveDispute(dispute: Dispute): Promise<Dispute> {
    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  async findDispute(id: string): Promise<Dispute | undefined> {
    return this.disputes.get(id);
  }

  async saveAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    this.auditEvents.set(event.id, event);
    return event;
  }

  async saveBlockchainTransaction(tx: BlockchainTransaction): Promise<BlockchainTransaction> {
    this.blockchainTransactions.set(tx.id, tx);
    return tx;
  }

  async getDashboard(): Promise<PawnDashboard> {
    return {
      assets: [...this.assets.values()],
      loans: [...this.loans.values()],
      listings: [...this.listings.values()],
      disputes: [...this.disputes.values()],
      auditEvents: [...this.auditEvents.values()],
      layaways: [...this.layaways.values()],
      protocolFeesCollected: this.protocolFeesCollected
    };
  }

  async findWalletByUserId(userId: string): Promise<Wallet | undefined> {
    return [...this.wallets.values()].find((w) => w.userId === userId);
  }

  async saveFractionalAsset(asset: FractionalAsset): Promise<FractionalAsset> {
    this.fractionalAssets.set(asset.assetId, asset);
    return asset;
  }

  async findFractionalAsset(assetId: string): Promise<FractionalAsset | undefined> {
    return this.fractionalAssets.get(assetId);
  }

  async listFractionalAssets(): Promise<FractionalAsset[]> {
    return [...this.fractionalAssets.values()];
  }

  async saveFractionalPosition(position: FractionalPosition): Promise<FractionalPosition> {
    this.fractionalPositions.set(position.id, position);
    return position;
  }

  async findFractionalPosition(id: string): Promise<FractionalPosition | undefined> {
    return this.fractionalPositions.get(id);
  }

  async findFractionalPositionByHolderAndAsset(holderId: string, assetId: string): Promise<FractionalPosition | undefined> {
    return [...this.fractionalPositions.values()].find(
      (p) => p.holderId === holderId && p.assetId === assetId
    );
  }

  async listFractionalPositions(): Promise<FractionalPosition[]> {
    return [...this.fractionalPositions.values()];
  }
}
