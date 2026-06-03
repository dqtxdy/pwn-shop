import { Test } from '@nestjs/testing';
import {
  BLOCKCHAIN_GATEWAY,
  KYC_PROVIDER,
  LOGISTICS_PROVIDER,
  PAWN_REPOSITORY,
  PRICE_ORACLE,
  STORAGE_PROVIDER
} from '../src/common/tokens';
import { PawnWorkflowService } from '../src/application/services/pawn-workflow.service';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import {
  MockBlockchainGateway,
  MockKycProvider,
  MockLogisticsProvider,
  MockPriceOracle,
  MockStorageProvider
} from '../src/infrastructure/adapters/mock-external.adapters';
import { AssetStatus } from '../src/domain/enums';

describe('PawnWorkflowService', () => {
  let service: PawnWorkflowService;
  let repository: InMemoryPawnRepository;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PawnWorkflowService,
        { provide: PAWN_REPOSITORY, useClass: InMemoryPawnRepository },
        { provide: KYC_PROVIDER, useClass: MockKycProvider },
        { provide: LOGISTICS_PROVIDER, useClass: MockLogisticsProvider },
        { provide: PRICE_ORACLE, useClass: MockPriceOracle },
        { provide: STORAGE_PROVIDER, useClass: MockStorageProvider },
        { provide: BLOCKCHAIN_GATEWAY, useClass: MockBlockchainGateway }
      ]
    }).compile();

    service = moduleRef.get(PawnWorkflowService);
    repository = moduleRef.get<InMemoryPawnRepository>(PAWN_REPOSITORY);
  });

  it('creates an asset and records it in the dashboard', async () => {
    const asset = await service.createAsset({
      ownerId: 'user-1',
      title: 'Gold ring',
      category: 'gold',
      description: '18K ring with receipt',
      declaredValue: 500
    });

    const dashboard = await service.dashboard();
    expect(dashboard.assets).toContainEqual(asset);
    expect(dashboard.auditEvents[0].action).toBe('ASSET_SUBMITTED');
  });

  describe('createListing', () => {
    it('succeeds for a valid RECEIVED asset and updates status to LISTED', async () => {
      // A-1004 has status RECEIVED by default
      const listing = await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1500,
        isProtocolOwned: false
      });

      expect(listing).toBeDefined();
      expect(listing.status).toBe('ACTIVE');

      const dashboard = await service.dashboard();
      const updatedAsset = dashboard.assets.find(a => a.id === 'A-1004');
      expect(updatedAsset?.status).toBe('LISTED');
    });

    it('succeeds for a valid RETURNED asset and updates status to LISTED', async () => {
      const asset = await repository.findAsset('A-1004');
      expect(asset).toBeDefined();
      asset!.status = AssetStatus.Returned;
      await repository.saveAsset(asset!);

      const listing = await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1500,
        isProtocolOwned: false
      });

      expect(listing).toBeDefined();
      expect(listing.status).toBe('ACTIVE');

      const dashboard = await service.dashboard();
      const updatedAsset = dashboard.assets.find(a => a.id === 'A-1004');
      expect(updatedAsset?.status).toBe('LISTED');
    });

    it('rejects nonexistent asset', async () => {
      await expect(
        service.createListing({
          assetId: 'NONEXISTENT',
          sellerId: 'customer-1',
          price: 1000,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Asset not found');
    });

    it('rejects duplicate active listing', async () => {
      // A-1004 has status RECEIVED by default. First creation succeeds and updates status to LISTED.
      await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1500,
        isProtocolOwned: false
      });

      // Second creation fails due to duplicate active listing
      await expect(
        service.createListing({
          assetId: 'A-1004',
          sellerId: 'customer-1',
          price: 1600,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Active listing already exists for this asset');
    });

    it('rejects invalid asset state such as UNDER_APPRAISAL or LOAN_ACTIVE', async () => {
      // A-1001 is UNDER_APPRAISAL
      await expect(
        service.createListing({
          assetId: 'A-1001',
          sellerId: 'customer-1',
          price: 1000,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Customer listing requires asset status to be RECEIVED or RETURNED');

      // A-1002 is LOAN_ACTIVE
      await expect(
        service.createListing({
          assetId: 'A-1002',
          sellerId: 'customer-1',
          price: 1000,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Customer listing requires asset status to be RECEIVED or RETURNED');
    });

    it('rejects listing creation if seller does not own the asset', async () => {
      // A-1004 is owned by customer-1, customer-2 cannot list it
      await expect(
        service.createListing({
          assetId: 'A-1004',
          sellerId: 'customer-2',
          price: 1500,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Seller must own the asset');
    });

    it('rejects protocol-owned listing creation from customer sellerId', async () => {
      const asset = await repository.findAsset('A-1004');
      expect(asset).toBeDefined();
      asset!.status = AssetStatus.Listed;
      await repository.saveAsset(asset!);

      await expect(
        service.createListing({
          assetId: 'A-1004',
          sellerId: 'customer-1',
          price: 2000,
          isProtocolOwned: true
        })
      ).rejects.toThrow('Only admin or system can create protocol-owned listings');
    });
  });
});
