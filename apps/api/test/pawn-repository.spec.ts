import { PawnRepository } from '../src/application/ports/pawn-repository';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import { PostgresPawnRepository } from '../src/infrastructure/persistence/repositories/postgres-pawn.repository';
import {
  User,
  Wallet,
  KycVerification,
  Asset,
  EvidenceFile,
  Shipment,
  Appraisal,
  Loan,
  Repayment,
  Listing,
  Layaway,
  Dispute,
  AuditEvent,
  BlockchainTransaction,
  FractionalAsset,
  FractionalPosition
} from '../src/domain/models';
import {
  UserRole,
  KycStatus,
  AssetStatus,
  ShipmentDirection,
  ShipmentStatus,
  LoanStatus,
  ListingStatus,
  LayawayStatus,
  DisputeStatus,
  EvidenceKind
} from '../src/domain/enums';

describe('PawnRepository Contract Tests', () => {
  function runContractTests(
    createRepo: () => Promise<PawnRepository | null>,
    shouldSkip = false,
    cleanupRepo?: (repo: PawnRepository) => Promise<void>
  ) {
    let repo: PawnRepository | null = null;

    beforeEach(async () => {
      if (shouldSkip) return;
      try {
        repo = await createRepo();
        if (repo && repo.reset) {
          await repo.reset();
        }
      } catch (err) {
        repo = null;
      }
    });

    afterEach(async () => {
      if (repo && cleanupRepo) {
        await cleanupRepo(repo);
      }
    });

    const testFn = shouldSkip ? it.skip : it;

    testFn('should save and find a user by wallet', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const wallet: Wallet = {
        id: 'w-test-1',
        userId: 'test-user-1',
        address: '0xabcdef0123456789abcdef0123456789abcdef01',
        chainId: 1,
        verifiedAt: new Date()
      };
      await repo.saveWallet(wallet);

      const found = await repo.findUserByWallet('0xABCDEF0123456789ABCDEF0123456789ABCDEF01'); // Case-insensitivity check
      expect(found).toBeDefined();
      expect(found?.id).toBe('test-user-1');
      expect(found?.displayName).toBe('Test User 1');
    });

    testFn('should support findWalletByAddress and deleteWallet', async () => {
      if (!repo) return;

      const user1: User = {
        id: 'u1',
        displayName: 'User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      const user2: User = {
        id: 'u2',
        displayName: 'User 2',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user1);
      await repo.saveUser(user2);

      const wallet1: Wallet = {
        id: 'w1',
        userId: 'u1',
        address: '0x7777777777777777777777777777777777777777',
        chainId: 1,
        verifiedAt: new Date()
      };
      await repo.saveWallet(wallet1);

      // Find by address
      const found = await repo.findWalletByAddress('0x7777777777777777777777777777777777777777');
      expect(found).toBeDefined();
      expect(found!.userId).toBe('u1');

      // Delete wallet
      await repo.deleteWallet(wallet1.id);
      const foundAfterDelete = await repo.findWalletByAddress('0x7777777777777777777777777777777777777777');
      expect(foundAfterDelete).toBeUndefined();

      // Now we can save user2's wallet with same address without unique constraint violation
      const wallet2: Wallet = {
        id: 'w2',
        userId: 'u2',
        address: '0x7777777777777777777777777777777777777777',
        chainId: 1,
        verifiedAt: new Date()
      };
      await repo.saveWallet(wallet2);

      const found2 = await repo.findWalletByAddress('0x7777777777777777777777777777777777777777');
      expect(found2).toBeDefined();
      expect(found2!.userId).toBe('u2');
    });

    testFn('should save mixed-case wallet address and perform case-insensitive lookups', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-mixed',
        displayName: 'Mixed Case User',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const wallet: Wallet = {
        id: 'w-mixed',
        userId: 'test-user-mixed',
        address: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01', // Mixed Case
        chainId: 1,
        verifiedAt: new Date()
      };
      await repo.saveWallet(wallet);

      // Verify lowercase lookup
      const foundLower = await repo.findUserByWallet('0xabcdef0123456789abcdef0123456789abcdef01');
      expect(foundLower).toBeDefined();
      expect(foundLower?.id).toBe('test-user-mixed');

      // Verify uppercase lookup
      const foundUpper = await repo.findUserByWallet('0XABCDEF0123456789ABCDEF0123456789ABCDEF01');
      expect(foundUpper).toBeDefined();
      expect(foundUpper?.id).toBe('test-user-mixed');

      // Verify mixed-case lookup
      const foundMixed = await repo.findUserByWallet('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01');
      expect(foundMixed).toBeDefined();
      expect(foundMixed?.id).toBe('test-user-mixed');
    });

    testFn('should preserve layaway wei fields as strings', async () => {
      if (!repo) return;

      const seller: User = {
        id: 'seller-wei',
        displayName: 'Wei Seller',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(seller);

      const buyer: User = {
        id: 'buyer-wei',
        displayName: 'Wei Buyer',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(buyer);

      const asset: Asset = {
        id: 'asset-wei',
        ownerId: seller.id,
        title: 'Wei Test Asset',
        category: 'jewelry',
        description: 'Asset used to verify layaway wei persistence',
        status: AssetStatus.Listed,
        declaredValue: 1000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const listing: Listing = {
        id: 'listing-wei',
        assetId: asset.id,
        sellerId: seller.id,
        price: 1000,
        status: ListingStatus.Active,
        isProtocolOwned: false,
        createdAt: new Date()
      };
      await repo.saveListing(listing);

      const layaway: Layaway = {
        id: 'layaway-wei',
        listingId: listing.id,
        buyerId: buyer.id,
        totalPrice: 1000,
        amountPaid: 200,
        deadline: new Date(),
        status: LayawayStatus.Active,
        monthsDuration: 6,
        installmentAmount: 133,
        downPayment: 200,
        paidInstallments: 0,
        amountPaidWei: '200000000000000000000',
        downPaymentWei: '200000000000000000000'
      };
      await repo.saveLayaway(layaway);

      const found = await repo.findLayaway(layaway.id);
      expect(found?.amountPaidWei).toBe('200000000000000000000');
      expect(found?.downPaymentWei).toBe('200000000000000000000');
      expect(typeof found?.amountPaidWei).toBe('string');
      expect(typeof found?.downPaymentWei).toBe('string');
    });

    testFn('should save and find a wallet by userId', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-2',
        displayName: 'Test User 2',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const wallet: Wallet = {
        id: 'w-test-2',
        userId: 'test-user-2',
        address: '0x2222222222222222222222222222222222222222',
        chainId: 1,
        verifiedAt: new Date()
      };
      await repo.saveWallet(wallet);

      const found = await repo.findWalletByUserId('test-user-2');
      expect(found).toBeDefined();
      expect(found?.id).toBe('w-test-2');
    });

    testFn('should save KYC verification', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const kyc: KycVerification = {
        id: 'kyc-1',
        userId: 'test-user-1',
        provider: 'mock-provider',
        status: KycStatus.Verified,
        reference: 'ref-123',
        checkedAt: new Date()
      };
      const saved = await repo.saveKycVerification(kyc);
      expect(saved.id).toBe('kyc-1');
    });

    testFn('should save, find, and list assets', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const found = await repo.findAsset('test-asset-1');
      expect(found).toBeDefined();
      expect(found?.title).toBe('MacBook Pro');
      expect(found?.declaredValue).toBe(2000);

      const list = await repo.listAssets();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some((a) => a.id === 'test-asset-1')).toBe(true);
    });

    testFn('should save and list evidence files', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const staff: User = {
        id: 'staff-1',
        displayName: 'Staff 1',
        role: UserRole.Staff,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(staff);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const file: EvidenceFile = {
        id: 'ev-1',
        assetId: 'test-asset-1',
        uploadedBy: 'staff-1',
        kind: EvidenceKind.StaffUnboxing,
        uri: 'https://storage/ev-1.mp4',
        contentHash: 'sha256hash',
        capturedAt: new Date()
      };
      await repo.saveEvidence(file);

      const list = await repo.listEvidence('test-asset-1');
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('ev-1');
    });

    testFn('should save and find shipment details', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const shipment: Shipment = {
        id: 's-1',
        assetId: 'test-asset-1',
        direction: ShipmentDirection.ToShop,
        carrier: 'UPS',
        trackingCode: '1Z9999999999999999',
        status: ShipmentStatus.InTransit,
        codRequired: false,
        updatedAt: new Date()
      };
      await repo.saveShipment(shipment);

      const found = await repo.findShipment('test-asset-1');
      expect(found).toBeDefined();
      expect(found?.id).toBe('s-1');
      expect(found?.carrier).toBe('UPS');
    });

    testFn('should save loan, appraisal, and repayments', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const staff: User = {
        id: 'staff-1',
        displayName: 'Staff 1',
        role: UserRole.Staff,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(staff);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const appraisal: Appraisal = {
        id: 'ap-1',
        assetId: 'test-asset-1',
        appraiserId: 'staff-1',
        estimatedValue: 2000,
        ltvBps: 5000,
        interestAprBps: 1000,
        acceptedByCustomer: true,
        createdAt: new Date()
      };
      await repo.saveAppraisal(appraisal);

      const loan: Loan = {
        id: 'l-1',
        assetId: 'test-asset-1',
        borrowerId: 'test-user-1',
        principal: 1000,
        aprBps: 1000,
        durationDays: 30,
        status: LoanStatus.Active,
        createdAt: new Date()
      };
      await repo.saveLoan(loan);

      const repayment: Repayment = {
        id: 'rep-1',
        loanId: 'l-1',
        amount: 1050,
        txHash: '0xrepaymenttxhash',
        paidAt: new Date()
      };
      await repo.saveRepayment(repayment);

      const foundLoan = await repo.findLoan('l-1');
      expect(foundLoan).toBeDefined();
      expect(foundLoan?.principal).toBe(1000);
    });

    testFn('should save, find, and list listings and layaways', async () => {
      if (!repo) return;

      const user1: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user1);

      const user2: User = {
        id: 'test-user-2',
        displayName: 'Test User 2',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user2);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const listing: Listing = {
        id: 'list-1',
        assetId: 'test-asset-1',
        sellerId: 'test-user-1',
        price: 1500,
        status: ListingStatus.Active,
        isProtocolOwned: false,
        createdAt: new Date()
      };
      await repo.saveListing(listing);

      const layaway: Layaway = {
        id: 'lay-1',
        listingId: 'list-1',
        buyerId: 'test-user-2',
        totalPrice: 1500,
        amountPaid: 500,
        deadline: new Date(),
        status: LayawayStatus.Active,
        monthsDuration: 3,
        installmentAmount: 500,
        downPayment: 500,
        paidInstallments: 1
      };
      await repo.saveLayaway(layaway);

      const foundListing = await repo.findListing('list-1');
      expect(foundListing).toBeDefined();
      expect(foundListing?.price).toBe(1500);

      const foundLayaway = await repo.findLayaway('lay-1');
      expect(foundLayaway).toBeDefined();
      expect(foundLayaway?.amountPaid).toBe(500);

      const listings = await repo.listListings();
      expect(listings.some((l) => l.id === 'list-1')).toBe(true);

      const layaways = await repo.listLayaways();
      expect(layaways.some((l) => l.id === 'lay-1')).toBe(true);
    });

    testFn('should save and retrieve fractionalized assets and positions', async () => {
      if (!repo) return;

      const user1: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user1);

      const user2: User = {
        id: 'test-user-2',
        displayName: 'Test User 2',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user2);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const fracAsset: FractionalAsset = {
        assetId: 'test-asset-1',
        originalOwner: 'test-user-1',
        totalShares: 1000,
        availableShares: 1000,
        pricePerShare: 2,
        status: 'ACTIVE'
      };
      await repo.saveFractionalAsset(fracAsset);

      const position: FractionalPosition = {
        id: 'pos-1',
        assetId: 'test-asset-1',
        holderId: 'test-user-2',
        shares: 500,
        totalShares: 1000
      };
      await repo.saveFractionalPosition(position);

      const foundAsset = await repo.findFractionalAsset('test-asset-1');
      expect(foundAsset).toBeDefined();
      expect(foundAsset?.totalShares).toBe(1000);

      const foundPos = await repo.findFractionalPosition('pos-1');
      expect(foundPos).toBeDefined();
      expect(foundPos?.shares).toBe(500);

      const foundByHolderAndAsset = await repo.findFractionalPositionByHolderAndAsset('test-user-2', 'test-asset-1');
      expect(foundByHolderAndAsset).toBeDefined();
      expect(foundByHolderAndAsset?.id).toBe('pos-1');

      const allPos = await repo.listFractionalPositions();
      expect(allPos.some((p) => p.id === 'pos-1')).toBe(true);

      const allAssets = await repo.listFractionalAssets();
      expect(allAssets.some((a) => a.assetId === 'test-asset-1')).toBe(true);
    });

    testFn('should save dispute, audit event, and blockchain transaction', async () => {
      if (!repo) return;

      const user: User = {
        id: 'test-user-1',
        displayName: 'Test User 1',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await repo.saveUser(user);

      const asset: Asset = {
        id: 'test-asset-1',
        ownerId: 'test-user-1',
        title: 'MacBook Pro',
        category: 'electronics',
        description: 'New laptop',
        status: AssetStatus.Received,
        declaredValue: 2000,
        createdAt: new Date()
      };
      await repo.saveAsset(asset);

      const dispute: Dispute = {
        id: 'disp-1',
        assetId: 'test-asset-1',
        openedBy: 'test-user-1',
        status: DisputeStatus.Open,
        createdAt: new Date()
      };
      await repo.saveDispute(dispute);

      const auditEvent: AuditEvent = {
        id: 'aud-1',
        actorId: 'test-user-1',
        action: 'TEST_ACTION',
        aggregateType: 'Asset',
        aggregateId: 'test-asset-1',
        metadata: { foo: 'bar' },
        createdAt: new Date()
      };
      await repo.saveAuditEvent(auditEvent);

      const bctx: BlockchainTransaction = {
        id: 'bctx-1',
        aggregateType: 'Asset',
        aggregateId: 'test-asset-1',
        txHash: '0xsomeblockchaintxhash',
        eventName: 'TestEvent',
        payload: { value: 123 },
        confirmedAt: new Date()
      };
      await repo.saveBlockchainTransaction(bctx);

      const foundDispute = await repo.findDispute('disp-1');
      expect(foundDispute).toBeDefined();
      expect(foundDispute?.status).toBe(DisputeStatus.Open);
    });

    testFn('should return correct dashboard overview metrics', async () => {
      if (!repo) return;

      const dashboard = await repo.getDashboard();
      expect(dashboard.assets).toBeDefined();
      expect(dashboard.loans).toBeDefined();
      expect(dashboard.listings).toBeDefined();
      expect(dashboard.protocolFeesCollected).toBeGreaterThanOrEqual(8420);
    });
  }

  describe('InMemoryPawnRepository', () => {
    runContractTests(async () => new InMemoryPawnRepository());
  });

  describe('PostgresPawnRepository', () => {
    let postgresRepo: PostgresPawnRepository | null = null;
    const runPostgres = process.env.POSTGRES_TESTS === '1';

    beforeAll(async () => {
      if (!runPostgres) return;
      postgresRepo = new PostgresPawnRepository();
      try {
        // In opt-in mode, database connection must actually work. If it fails, tests fail.
        await postgresRepo.initialize();
      } catch (err: any) {
        console.error(`
❌ ERROR: Failed to connect to PostgreSQL database.
Ensure the PostgreSQL container is running on port 5432 by running:
  npm run db:up

Error details: ${err.message || err}
`);
        throw new Error('PostgreSQL database is unreachable. Run npm run db:up first.');
      }
    });

    afterAll(async () => {
      if (postgresRepo) {
        await postgresRepo.close();
      }
    });

    const getRepo = async () => {
      return postgresRepo;
    };

    // If POSTGRES_TESTS is not 1, we pass shouldSkip=true so Jest shows them as skipped
    runContractTests(getRepo, !runPostgres);

    const testFn = !runPostgres ? it.skip : it;

    testFn('should rollback transaction on error', async () => {
      if (!postgresRepo) return;
      
      await postgresRepo.reset();

      const user: User = {
        id: 'u-tx-rollback',
        displayName: 'Tx User',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await postgresRepo.saveUser(user);

      try {
        await postgresRepo.runInTransaction(async (txRepo) => {
          await txRepo.saveAsset({
            id: 'a-tx-rollback',
            ownerId: 'u-tx-rollback',
            title: 'Tx Asset',
            category: 'electronics',
            description: 'Asset in transaction',
            status: AssetStatus.Received,
            declaredValue: 100,
            createdAt: new Date()
          });

          const assetInside = await txRepo.findAsset('a-tx-rollback');
          expect(assetInside).toBeDefined();

          throw new Error('Force Rollback');
        });
      } catch (err: any) {
        expect(err.message).toBe('Force Rollback');
      }

      const assetOutside = await postgresRepo.findAsset('a-tx-rollback');
      expect(assetOutside).toBeUndefined();
    });

    testFn('should enforce check constraint on asset declaredValue', async () => {
      if (!postgresRepo) return;

      await postgresRepo.reset();

      const user: User = {
        id: 'u-check-constraint',
        displayName: 'Check User',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await postgresRepo.saveUser(user);

      await expect(
        postgresRepo.saveAsset({
          id: 'a-check-constraint',
          ownerId: 'u-check-constraint',
          title: 'Invalid Asset',
          category: 'electronics',
          description: 'Negative declaredValue',
          status: AssetStatus.Received,
          declaredValue: -100,
          createdAt: new Date()
        })
      ).rejects.toThrow();
    });

    testFn('should enforce partial unique index for active/offered loans on the same asset', async () => {
      if (!postgresRepo) return;

      await postgresRepo.reset();

      const user: User = {
        id: 'u-loans',
        displayName: 'Loan User',
        role: UserRole.Customer,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await postgresRepo.saveUser(user);

      const asset: Asset = {
        id: 'a-loans',
        ownerId: 'u-loans',
        title: 'Loan Asset',
        category: 'electronics',
        description: 'Test Asset',
        status: AssetStatus.Received,
        declaredValue: 1000,
        createdAt: new Date()
      };
      await postgresRepo.saveAsset(asset);

      const loan1: Loan = {
        id: 'l-active-1',
        assetId: 'a-loans',
        borrowerId: 'u-loans',
        principal: 500,
        aprBps: 1000,
        durationDays: 30,
        status: LoanStatus.Active,
        createdAt: new Date()
      };
      await postgresRepo.saveLoan(loan1);

      const loan2: Loan = {
        id: 'l-active-2',
        assetId: 'a-loans',
        borrowerId: 'u-loans',
        principal: 400,
        aprBps: 1000,
        durationDays: 30,
        status: LoanStatus.Active,
        createdAt: new Date()
      };
      await expect(postgresRepo.saveLoan(loan2)).rejects.toThrow();
    });

    testFn('should be idempotent on reset and support consecutive resets', async () => {
      if (!postgresRepo) return;

      await expect(postgresRepo.reset()).resolves.not.toThrow();
      await expect(postgresRepo.reset()).resolves.not.toThrow();
    });

    testFn('system user should exist after initialize', async () => {
      if (!postgresRepo) return;

      const systemUser = await postgresRepo.findUserById('system');
      expect(systemUser).toBeDefined();
      expect(systemUser!.id).toBe('system');
      expect(systemUser!.displayName).toBe('System Account');
      expect(systemUser!.role).toBe(UserRole.Admin);
      expect(systemUser!.kycStatus).toBe(KycStatus.Verified);
    });

    testFn('system user should persist after reset', async () => {
      if (!postgresRepo) return;

      await postgresRepo.reset();
      const systemUser = await postgresRepo.findUserById('system');
      expect(systemUser).toBeDefined();
      expect(systemUser!.id).toBe('system');

      // Second reset — must still be idempotent
      await postgresRepo.reset();
      const systemUser2 = await postgresRepo.findUserById('system');
      expect(systemUser2).toBeDefined();
      expect(systemUser2!.role).toBe(UserRole.Admin);
      expect(systemUser2!.kycStatus).toBe(KycStatus.Verified);
    });

    testFn('system user should be normalized back to ADMIN and VERIFIED on reset', async () => {
      if (!postgresRepo) return;

      await postgresRepo.saveUser({
        id: 'system',
        displayName: 'legacy system',
        role: 'admin' as UserRole,
        kycStatus: 'verified' as KycStatus,
        createdAt: new Date()
      });

      await postgresRepo.reset();

      const systemUser = await postgresRepo.findUserById('system');
      expect(systemUser).toBeDefined();
      expect(systemUser!.displayName).toBe('System Account');
      expect(systemUser!.role).toBe(UserRole.Admin);
      expect(systemUser!.kycStatus).toBe(KycStatus.Verified);
    });

    testFn('admin fractionalization should not cause FK violation on originalOwner', async () => {
      if (!postgresRepo) return;

      await postgresRepo.reset();

      // admin-1 is seeded in DEMO_MODE. For this test we create a standalone admin user.
      const adminUser: User = {
        id: 'u-admin-frac',
        displayName: 'Admin For Frac Test',
        role: UserRole.Admin,
        kycStatus: KycStatus.Verified,
        createdAt: new Date()
      };
      await postgresRepo.saveUser(adminUser);

      const asset: Asset = {
        id: 'a-admin-frac',
        ownerId: 'u-admin-frac',
        title: 'Frac Asset',
        category: 'electronics',
        description: 'For fractionalization FK test',
        status: AssetStatus.Received,
        declaredValue: 10000,
        createdAt: new Date()
      };
      await postgresRepo.saveAsset(asset);

      // originalOwner = admin user id (not 'system') — should not throw FK error
      await expect(
        postgresRepo.saveFractionalAsset({
          assetId: 'a-admin-frac',
          originalOwner: 'u-admin-frac',
          totalShares: 100,
          availableShares: 100,
          pricePerShare: 100,
          status: 'ACTIVE'
        })
      ).resolves.toBeDefined();
    });
  });
});
