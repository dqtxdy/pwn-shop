import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DemoController } from '../src/interfaces/http/pawn.controllers';
import { PawnWorkflowService } from '../src/application/services/pawn-workflow.service';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import {
  BLOCKCHAIN_GATEWAY,
  KYC_PROVIDER,
  LOGISTICS_PROVIDER,
  PAWN_REPOSITORY,
  PRICE_ORACLE,
  STORAGE_PROVIDER
} from '../src/common/tokens';
import {
  MockBlockchainGateway,
  MockKycProvider,
  MockLogisticsProvider,
  MockPriceOracle,
  MockStorageProvider
} from '../src/infrastructure/adapters/mock-external.adapters';

describe('DemoController', () => {
  let controller: DemoController;
  let workflow: PawnWorkflowService;
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'; // Ensure it's test mode for setup
    const moduleRef = await Test.createTestingModule({
      controllers: [DemoController],
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

    controller = moduleRef.get<DemoController>(DemoController);
    workflow = moduleRef.get<PawnWorkflowService>(PawnWorkflowService);
  });

  it('reset works in non-production/test mode', async () => {
    process.env.NODE_ENV = 'test';
    const result = await controller.reset();
    expect(result).toEqual({ success: true, message: 'InMemory database reset successfully' });
  });

  it('reset is rejected with ForbiddenException in production mode', async () => {
    process.env.NODE_ENV = 'production';
    await expect(controller.reset()).rejects.toThrow(ForbiddenException);
  });

  it('reset actually removes E2E-created data and restores seeded dashboard state', async () => {
    process.env.NODE_ENV = 'test';
    
    // 1. Get default dashboard count
    const initialDashboard = await workflow.dashboard();
    const initialAssetCount = initialDashboard.assets.length;

    // 2. Create a new asset (simulate E2E-created data)
    await workflow.createAsset({
      ownerId: 'user-e2e',
      title: 'E2E Test Asset',
      category: 'gold',
      description: 'E2E condition notes',
      declaredValue: 1000
    });

    // Verify it is added
    let dashboard = await workflow.dashboard();
    expect(dashboard.assets.length).toBe(initialAssetCount + 1);

    // 3. Reset the database
    await controller.reset();

    // 4. Verify dashboard state is restored and new asset is deleted
    dashboard = await workflow.dashboard();
    expect(dashboard.assets.length).toBe(initialAssetCount);
    const hasE2eAsset = dashboard.assets.some(a => a.title === 'E2E Test Asset');
    expect(hasE2eAsset).toBe(false);
  });
});
