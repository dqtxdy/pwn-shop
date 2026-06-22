import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { OnApplicationShutdown } from '@nestjs/common';
import { PawnRepository } from '../../../application/ports/pawn-repository';
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
import {
  UserEntity,
  WalletEntity,
  KycVerificationEntity,
  AssetEntity,
  EvidenceFileEntity,
  ShipmentEntity,
  AppraisalEntity,
  LoanEntity,
  RepaymentEntity,
  ListingEntity,
  LayawayEntity,
  FractionalPositionEntity,
  FractionalAssetEntity,
  DisputeEntity,
  AuditEventEntity,
  BlockchainTransactionEntity
} from '../entities';
import { InitialSchema1717580000000 } from '../migrations/1717580000000-InitialSchema';

export class PostgresPawnRepository implements PawnRepository, OnApplicationShutdown {
  private dataSource!: DataSource;

  async initialize(): Promise<void> {
    const runMigrations = process.env.DB_MIGRATIONS_RUN === 'true';
    const synchronize = process.env.DB_SYNCHRONIZE !== 'false' && !runMigrations;

    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'pwn_shop',
      entities: [
        UserEntity,
        WalletEntity,
        KycVerificationEntity,
        AssetEntity,
        EvidenceFileEntity,
        ShipmentEntity,
        AppraisalEntity,
        LoanEntity,
        RepaymentEntity,
        ListingEntity,
        LayawayEntity,
        FractionalPositionEntity,
        FractionalAssetEntity,
        DisputeEntity,
        AuditEventEntity,
        BlockchainTransactionEntity
      ],
      synchronize,
      migrations: [InitialSchema1717580000000],
      migrationsRun: runMigrations,
      logging: false,
    });

    await this.dataSource.initialize();
    await this.initializeSeededDataIfNeeded();
  }

  async close(): Promise<void> {
    if (this.dataSource && this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.close();
  }

  async reset(): Promise<void> {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      return;
    }
    const entities = this.dataSource.entityMetadatas;
    for (const entity of entities) {
      const repository = this.dataSource.getRepository(entity.name);
      await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
    }
    await this.initializeSeededDataIfNeeded();
  }

  private async initializeSeededDataIfNeeded(): Promise<void> {
    const userRepo = this.dataSource.getRepository(UserEntity);
    const userCount = await userRepo.count();
    if (userCount > 0) {
      return; // Already seeded
    }

    const now = new Date();

    // 1. Seed Users
    // Both demo customer accounts use the same CUSTOMER role. The labels are
    // for presentation and cross-customer demo flows only.
    const users: User[] = [
      {
        id: 'customer-1',
        displayName: 'Demo Customer 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
      },
      {
        id: 'customer-2',
        displayName: 'Demo Customer 2',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
      },
      {
        id: 'staff-1',
        displayName: 'Demo Staff / Validator',
        role: UserRole.Staff,
        kycStatus: KycStatus.Verified,
        createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
      },
      {
        id: 'admin-1',
        displayName: 'Demo Admin',
        role: UserRole.Admin,
        kycStatus: KycStatus.Verified,
        createdAt: new Date(now.getTime() - 30 * 24 * 3600000)
      }
    ];
    await userRepo.save(users);

    // 2. Seed Wallets
    const wallets: Wallet[] = [
      {
        id: 'wallet-customer-1',
        userId: 'customer-1',
        address: '0x1111111111111111111111111111111111111111',
        chainId: 1,
        verifiedAt: now
      },
      {
        id: 'wallet-customer-2',
        userId: 'customer-2',
        address: '0x4444444444444444444444444444444444444444',
        chainId: 1,
        verifiedAt: now
      },
      {
        id: 'wallet-staff-1',
        userId: 'staff-1',
        address: '0x2222222222222222222222222222222222222222',
        chainId: 1,
        verifiedAt: now
      },
      {
        id: 'wallet-admin-1',
        userId: 'admin-1',
        address: '0x3333333333333333333333333333333333333333',
        chainId: 1,
        verifiedAt: now
      }
    ];

    if (process.env.BLOCKCHAIN_MODE === 'anvil') {
      wallets[0].address = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
      wallets[0].chainId = 31337;

      wallets[1].address = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
      wallets[1].chainId = 31337;

      wallets[2].address = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
      wallets[2].chainId = 31337;

      wallets[3].address = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
      wallets[3].chainId = 31337;
    }

    for (const w of wallets) {
      w.address = w.address.toLowerCase();
    }

    await this.dataSource.getRepository(WalletEntity).save(wallets);

    // 3. Load local-anvil tokenId Map if applicable
    let tokenIdMap: Record<string, number> = {};
    if (process.env.BLOCKCHAIN_MODE === 'anvil') {
      const pathsToTry = [
        path.resolve(process.cwd(), '../../PawnShop-SmartContract/deployments/local-anvil.json'),
        path.resolve(process.cwd(), 'PawnShop-SmartContract/deployments/local-anvil.json'),
        path.resolve(__dirname, '../../../../../PawnShop-SmartContract/deployments/local-anvil.json'),
        path.resolve(__dirname, '../../../../PawnShop-SmartContract/deployments/local-anvil.json'),
      ];
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
          // ignore
        }
      }
    }

    // 4. Seed Assets
    const assets: Asset[] = [
      {
        id: 'A-1001',
        ownerId: 'customer-1',
        title: '18K gold necklace',
        category: 'gold',
        description: 'Beautiful 18K gold necklace with receipt',
        status: AssetStatus.UnderAppraisal,
        declaredValue: 2400,
        createdAt: new Date(now.getTime() - 2 * 3600000)
      },
      {
        id: 'A-1002',
        ownerId: 'customer-1',
        title: 'MacBook Pro M3',
        category: 'electronics',
        description: '16GB RAM, 512GB SSD, Space Gray',
        status: process.env.BLOCKCHAIN_MODE === 'anvil' ? AssetStatus.Received : AssetStatus.LoanActive,
        declaredValue: 1800,
        createdAt: new Date(now.getTime() - 24 * 3600000)
      },
      {
        id: 'A-1003',
        ownerId: 'customer-1',
        title: 'Rolex Datejust',
        category: 'watch',
        description: 'Steel and gold, blue dial, boxes and papers',
        status: AssetStatus.AwaitingShipment,
        declaredValue: 8000,
        createdAt: new Date(now.getTime() - 1 * 3600000)
      },
      {
        id: 'A-1004',
        ownerId: 'customer-1',
        title: 'Gold ring set',
        category: 'gold',
        description: 'Set of 3 stackable 14K gold rings',
        status: AssetStatus.Received,
        declaredValue: 1500,
        createdAt: new Date(now.getTime() - 3 * 3600000)
      },
      {
        id: 'A-1005',
        ownerId: 'customer-1',
        title: 'Vintage Diamond Brooch',
        category: 'jewelry',
        description: 'Listed protocol-owned or defaulted asset',
        status: AssetStatus.Listed,
        declaredValue: 3000,
        createdAt: new Date(now.getTime() - 48 * 3600000)
      }
    ];

    for (const a of assets) {
      if (tokenIdMap[a.id] !== undefined) {
        a.tokenId = String(tokenIdMap[a.id]);
      }
    }
    await this.dataSource.getRepository(AssetEntity).save(assets);

    // 5. Seed Shipments
    const shipments: Shipment[] = [
      {
        id: 'S-101',
        assetId: 'A-1001',
        direction: ShipmentDirection.ToShop,
        carrier: 'FedEx',
        trackingCode: 'VNPOST-4481',
        status: ShipmentStatus.Delivered,
        codRequired: false,
        updatedAt: new Date(now.getTime() - 1.5 * 3600000)
      },
      {
        id: 'S-102',
        assetId: 'A-1002',
        direction: ShipmentDirection.ToShop,
        carrier: 'DHL',
        trackingCode: 'VIETTEL-9104',
        status: ShipmentStatus.Delivered,
        codRequired: false,
        updatedAt: new Date(now.getTime() - 23 * 3600000)
      }
    ];
    await this.dataSource.getRepository(ShipmentEntity).save(shipments);

    // 6. Seed Appraisals
    const appraisals: Appraisal[] = [
      {
        id: 'AP-101',
        assetId: 'A-1001',
        appraiserId: 'staff-1',
        estimatedValue: 2400,
        ltvBps: 6000,
        interestAprBps: 500,
        acceptedByCustomer: false,
        createdAt: new Date(now.getTime() - 1.2 * 3600000)
      }
    ];

    if (process.env.BLOCKCHAIN_MODE !== 'anvil') {
      appraisals.push({
        id: 'AP-102',
        assetId: 'A-1002',
        appraiserId: 'staff-1',
        estimatedValue: 1800,
        ltvBps: 6000,
        interestAprBps: 500,
        acceptedByCustomer: true,
        createdAt: new Date(now.getTime() - 22 * 3600000)
      });
    }
    await this.dataSource.getRepository(AppraisalEntity).save(appraisals);

    // 7. Seed Loans
    if (process.env.BLOCKCHAIN_MODE !== 'anvil') {
      const loan: Loan = {
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
      await this.dataSource.getRepository(LoanEntity).save(loan);
    }

    // 8. Seed Listings
    const listing: Listing = {
      id: 'LIST-001',
      assetId: 'A-1005',
      sellerId: 'admin-1',
      price: 3200,
      status: ListingStatus.Active,
      isProtocolOwned: true,
      createdAt: new Date(now.getTime() - 24 * 3600000)
    };
    await this.dataSource.getRepository(ListingEntity).save(listing);

    // 9. Seed Audit Events
    const events: AuditEvent[] = [
      {
        id: 'E-1',
        actorId: 'customer-1',
        action: 'ASSET_SUBMITTED',
        aggregateType: 'Asset',
        aggregateId: 'A-1001',
        metadata: { category: 'gold' },
        createdAt: new Date(now.getTime() - 2 * 3600000)
      },
      {
        id: 'E-3',
        actorId: 'system',
        action: 'SHIPMENT_CREATED',
        aggregateType: 'Asset',
        aggregateId: 'A-1001',
        metadata: { trackingCode: 'VNPOST-4481' },
        createdAt: new Date(now.getTime() - 1.5 * 3600000)
      }
    ];

    if (process.env.BLOCKCHAIN_MODE !== 'anvil') {
      events.push({
        id: 'E-2',
        actorId: 'customer-1',
        action: 'LOAN_ACCEPTED',
        aggregateType: 'Loan',
        aggregateId: 'L-202',
        metadata: { txHash: '0x3a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f901a2b3c4d5e6f' },
        createdAt: new Date(now.getTime() - 22 * 3600000)
      });
    }
    await this.dataSource.getRepository(AuditEventEntity).save(events);

    // 10. Seed Evidence Files
    const evidenceFiles: EvidenceFile[] = [];
    const getEvidenceData = (filename: string) => {
      try {
        const pathsToTry = [
          path.resolve(process.cwd(), 'seed-images', filename),
          path.resolve(process.cwd(), 'apps/api/seed-images', filename),
          path.resolve(__dirname, '../../../../seed-images', filename),
          path.resolve(__dirname, '../../../../../seed-images', filename),
          path.resolve(__dirname, 'seed-images', filename),
        ];
        for (const p of pathsToTry) {
          if (fs.existsSync(p)) {
            const bytes = fs.readFileSync(p);
            const base64 = bytes.toString('base64');
            const hash = crypto.createHash('sha256').update(bytes).digest('hex');
            return { uri: `data:image/png;base64,${base64}`, hash };
          }
        }
      } catch (err) {
        // ignore
      }
      return {
        uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      };
    };

    const seeds = [
      { assetId: 'A-1001', file: 'gold_necklace.png', hasStaff: true },
      { assetId: 'A-1002', file: 'macbook_pro.png', hasStaff: true },
      { assetId: 'A-1003', file: 'rolex_watch.png', hasStaff: false },
      { assetId: 'A-1004', file: 'gold_rings.png', hasStaff: true },
      { assetId: 'A-1005', file: 'diamond_brooch.png', hasStaff: true },
    ];

    for (const s of seeds) {
      const data = getEvidenceData(s.file);
      evidenceFiles.push({
        id: `EV-C-${s.assetId}`,
        assetId: s.assetId,
        uploadedBy: 'customer-1',
        kind: EvidenceKind.CustomerPreShipment,
        uri: data.uri,
        contentHash: data.hash,
        capturedAt: new Date(now.getTime() - 2.5 * 3600000)
      });
      if (s.hasStaff) {
        evidenceFiles.push({
          id: `EV-S-${s.assetId}`,
          assetId: s.assetId,
          uploadedBy: 'staff-1',
          kind: EvidenceKind.StaffUnboxing,
          uri: data.uri,
          contentHash: data.hash,
          capturedAt: new Date(now.getTime() - 1.1 * 3600000)
        });
      }
    }
    await this.dataSource.getRepository(EvidenceFileEntity).save(evidenceFiles);
  }

  // --- PawnRepository Port Methods Implementation ---

  async saveUser(user: User): Promise<User> {
    await this.dataSource.getRepository(UserEntity).save(user);
    return user;
  }

  async findUserByWallet(address: string): Promise<User | undefined> {
    const wallet = await this.dataSource.getRepository(WalletEntity).findOne({
      where: { address: address.toLowerCase() }
    });
    if (!wallet) return undefined;
    const user = await this.dataSource.getRepository(UserEntity).findOne({
      where: { id: wallet.userId }
    });
    return user || undefined;
  }

  async saveWallet(wallet: Wallet): Promise<Wallet> {
    wallet.address = wallet.address.toLowerCase();
    await this.dataSource.getRepository(WalletEntity).save(wallet);
    return wallet;
  }

  async saveKycVerification(verification: KycVerification): Promise<KycVerification> {
    await this.dataSource.getRepository(KycVerificationEntity).save(verification);
    return verification;
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    await this.dataSource.getRepository(AssetEntity).save(asset);
    return asset;
  }

  async findAsset(id: string): Promise<Asset | undefined> {
    const asset = await this.dataSource.getRepository(AssetEntity).findOne({ where: { id } });
    return asset || undefined;
  }

  async listAssets(): Promise<Asset[]> {
    return this.dataSource.getRepository(AssetEntity).find();
  }

  async saveEvidence(file: EvidenceFile): Promise<EvidenceFile> {
    await this.dataSource.getRepository(EvidenceFileEntity).save(file);
    return file;
  }

  async listEvidence(assetId: string): Promise<EvidenceFile[]> {
    return this.dataSource.getRepository(EvidenceFileEntity).find({
      where: { assetId }
    });
  }

  async saveShipment(shipment: Shipment): Promise<Shipment> {
    await this.dataSource.getRepository(ShipmentEntity).save(shipment);
    return shipment;
  }

  async findShipment(assetId: string): Promise<Shipment | undefined> {
    const shipment = await this.dataSource.getRepository(ShipmentEntity).findOne({
      where: { assetId }
    });
    return shipment || undefined;
  }

  async saveAppraisal(appraisal: Appraisal): Promise<Appraisal> {
    await this.dataSource.getRepository(AppraisalEntity).save(appraisal);
    return appraisal;
  }

  async saveLoan(loan: Loan): Promise<Loan> {
    await this.dataSource.getRepository(LoanEntity).save(loan);
    return loan;
  }

  async findLoan(id: string): Promise<Loan | undefined> {
    const loan = await this.dataSource.getRepository(LoanEntity).findOne({ where: { id } });
    return loan || undefined;
  }

  async saveRepayment(repayment: Repayment): Promise<Repayment> {
    await this.dataSource.getRepository(RepaymentEntity).save(repayment);
    return repayment;
  }

  async saveListing(listing: Listing): Promise<Listing> {
    await this.dataSource.getRepository(ListingEntity).save(listing);
    return listing;
  }

  async findListing(id: string): Promise<Listing | undefined> {
    const listing = await this.dataSource.getRepository(ListingEntity).findOne({ where: { id } });
    return listing || undefined;
  }

  async listListings(): Promise<Listing[]> {
    return this.dataSource.getRepository(ListingEntity).find();
  }

  async saveLayaway(layaway: Layaway): Promise<Layaway> {
    await this.dataSource.getRepository(LayawayEntity).save(layaway);
    return layaway;
  }

  async findLayaway(id: string): Promise<Layaway | undefined> {
    const layaway = await this.dataSource.getRepository(LayawayEntity).findOne({ where: { id } });
    return layaway || undefined;
  }

  async listLayaways(): Promise<Layaway[]> {
    return this.dataSource.getRepository(LayawayEntity).find();
  }

  async saveDispute(dispute: Dispute): Promise<Dispute> {
    await this.dataSource.getRepository(DisputeEntity).save(dispute);
    return dispute;
  }

  async findDispute(id: string): Promise<Dispute | undefined> {
    const dispute = await this.dataSource.getRepository(DisputeEntity).findOne({ where: { id } });
    return dispute || undefined;
  }

  async saveAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    await this.dataSource.getRepository(AuditEventEntity).save(event);
    return event;
  }

  async saveBlockchainTransaction(tx: BlockchainTransaction): Promise<BlockchainTransaction> {
    await this.dataSource.getRepository(BlockchainTransactionEntity).save(tx);
    return tx;
  }

  async getDashboard(): Promise<PawnDashboard> {
    const repaymentCount = await this.dataSource.getRepository(RepaymentEntity).count();
    const protocolFeesCollected = 8420 + repaymentCount * 50;

    return {
      assets: await this.dataSource.getRepository(AssetEntity).find(),
      loans: await this.dataSource.getRepository(LoanEntity).find(),
      listings: await this.dataSource.getRepository(ListingEntity).find(),
      disputes: await this.dataSource.getRepository(DisputeEntity).find(),
      auditEvents: await this.dataSource.getRepository(AuditEventEntity).find(),
      layaways: await this.dataSource.getRepository(LayawayEntity).find(),
      protocolFeesCollected
    };
  }

  async findWalletByUserId(userId: string): Promise<Wallet | undefined> {
    const wallet = await this.dataSource.getRepository(WalletEntity).findOne({
      where: { userId }
    });
    return wallet || undefined;
  }

  async saveFractionalAsset(asset: FractionalAsset): Promise<FractionalAsset> {
    await this.dataSource.getRepository(FractionalAssetEntity).save(asset);
    return asset;
  }

  async findFractionalAsset(assetId: string): Promise<FractionalAsset | undefined> {
    const asset = await this.dataSource.getRepository(FractionalAssetEntity).findOne({
      where: { assetId }
    });
    return asset || undefined;
  }

  async listFractionalAssets(): Promise<FractionalAsset[]> {
    return this.dataSource.getRepository(FractionalAssetEntity).find();
  }

  async saveFractionalPosition(position: FractionalPosition): Promise<FractionalPosition> {
    await this.dataSource.getRepository(FractionalPositionEntity).save(position);
    return position;
  }

  async findFractionalPosition(id: string): Promise<FractionalPosition | undefined> {
    const pos = await this.dataSource.getRepository(FractionalPositionEntity).findOne({ where: { id } });
    return pos || undefined;
  }

  async findFractionalPositionByHolderAndAsset(holderId: string, assetId: string): Promise<FractionalPosition | undefined> {
    const pos = await this.dataSource.getRepository(FractionalPositionEntity).findOne({
      where: { holderId, assetId }
    });
    return pos || undefined;
  }

  async listFractionalPositions(): Promise<FractionalPosition[]> {
    return this.dataSource.getRepository(FractionalPositionEntity).find();
  }
}
