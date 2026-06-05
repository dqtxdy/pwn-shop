# TypeORM Database Migrations Guide

During local development and demonstrations, the application uses auto-schema synchronization (`synchronize: true`) to dynamically match the PostgreSQL schema with TypeORM Entity structures. 

For production and staging deployments, **schema synchronization must be disabled** to prevent data loss. Version-controlled database migrations should be used instead.

---

## 1. Preparing for Production (Transition Path)

To prepare for a production environment:
1. In `PostgresPawnRepository.initialize()` (or database configuration), change `synchronize: true` to `synchronize: false`.
2. Add a `migrations` property pointing to compiled migrations, and enable `migrationsRun: true` so migrations run automatically on startup:
   ```typescript
   migrations: [
     // List of migration classes
   ],
   migrationsRun: true,
   ```

---

## 2. Generating Migrations (CLI)

TypeORM can automatically generate migration files by comparing your current local entity models with the current schema of a running database.

### Command for generation:
```bash
npx typeorm-ts-node-commonjs migration:generate \
  -d src/infrastructure/persistence/data-source.ts \
  src/infrastructure/persistence/migrations/InitialSchema
```

### Command for running migrations manually:
```bash
npx typeorm-ts-node-commonjs migration:run \
  -d src/infrastructure/persistence/data-source.ts
```

### Command for reverting last migration:
```bash
npx typeorm-ts-node-commonjs migration:revert \
  -d src/infrastructure/persistence/data-source.ts
```

---

## 3. Data Source Template for Migration CLI

For the TypeORM CLI to run, it requires a static `DataSource` instance. Create a file `apps/api/src/infrastructure/persistence/data-source.ts`:

```typescript
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
  migrations: ['src/infrastructure/persistence/migrations/*.ts'],
});
```
