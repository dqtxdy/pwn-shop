import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import {
  BLOCKCHAIN_GATEWAY,
  KYC_PROVIDER,
  LOGISTICS_PROVIDER,
  NOTIFICATION_GATEWAY,
  PAWN_REPOSITORY,
  PRICE_ORACLE,
  STORAGE_PROVIDER
} from './common/tokens';
import { AuthService } from './application/services/auth.service';
import { PawnWorkflowService } from './application/services/pawn-workflow.service';
import { InMemoryPawnRepository } from './infrastructure/persistence/repositories/in-memory-pawn.repository';
import {
  MockBlockchainGateway,
  MockKycProvider,
  MockLogisticsProvider,
  MockNotificationGateway,
  MockPriceOracle,
  MockStorageProvider
} from './infrastructure/adapters/mock-external.adapters';
import { AnvilBlockchainGateway } from './infrastructure/adapters/anvil-blockchain.gateway';
import {
  AdminController,
  AppraisalsController,
  AssetsController,
  AuthController,
  BlockchainConfigController,
  BlockchainWebhooksController,
  DemoController,
  DisputesController,
  EvidenceController,
  FractionsController,
  KycController,
  LayawaysController,
  LoansController,
  MarketplaceController,
  RepaymentsController,
  ShipmentsController
} from './interfaces/http/pawn.controllers';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'capstone-dev-secret',
      signOptions: { expiresIn: '2h' }
    })
  ],
  controllers: [
    AdminController,
    AppraisalsController,
    AssetsController,
    AuthController,
    BlockchainConfigController,
    BlockchainWebhooksController,
    DemoController,
    DisputesController,
    EvidenceController,
    FractionsController,
    KycController,
    LayawaysController,
    LoansController,
    MarketplaceController,
    RepaymentsController,
    ShipmentsController
  ],
  providers: [
    AuthService,
    PawnWorkflowService,
    {
      provide: PAWN_REPOSITORY,
      useFactory: async () => {
        if (process.env.PERSISTENCE_MODE === 'postgres') {
          const { PostgresPawnRepository } = await import(
            './infrastructure/persistence/repositories/postgres-pawn.repository'
          );
          const repo = new PostgresPawnRepository();
          await repo.initialize();
          return repo;
        }
        return new InMemoryPawnRepository();
      }
    },
    { provide: KYC_PROVIDER, useClass: MockKycProvider },
    { provide: LOGISTICS_PROVIDER, useClass: MockLogisticsProvider },
    { provide: PRICE_ORACLE, useClass: MockPriceOracle },
    { provide: STORAGE_PROVIDER, useClass: MockStorageProvider },
    {
      provide: BLOCKCHAIN_GATEWAY,
      useFactory: () => {
        if (process.env.BLOCKCHAIN_MODE === 'anvil') {
          return new AnvilBlockchainGateway();
        }
        return new MockBlockchainGateway();
      }
    },
    { provide: NOTIFICATION_GATEWAY, useClass: MockNotificationGateway }
  ]
})
export class AppModule { }
