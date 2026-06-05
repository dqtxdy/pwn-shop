import { DataSource } from 'typeorm';
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
} from './entities';

export default new DataSource({
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
  synchronize: false,
  migrations: [__dirname + '/migrations/*.ts'],
});
