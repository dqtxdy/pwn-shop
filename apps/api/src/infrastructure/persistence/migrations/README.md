# TypeORM Database Migrations Guide

The API supports two PostgreSQL schema modes:

- Local demo mode: `DB_SYNCHRONIZE=true` may be used with throwaway data while developing.
- Production-like mode: `DB_SYNCHRONIZE=false` and `DB_MIGRATIONS_RUN=true` must be used so schema changes are versioned.

Do not enable automatic synchronization for staging or production data. It can mutate schema state without a reviewed migration.

## Environment

```bash
PERSISTENCE_MODE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=pwn_shop
DB_SYNCHRONIZE=false
DB_MIGRATIONS_RUN=true
```

The static TypeORM CLI entry point is already provided at `apps/api/src/infrastructure/persistence/data-source.ts`.

## Generate a Migration

Run this from `apps/api` after updating entity definitions and starting PostgreSQL:

```bash
npx typeorm-ts-node-commonjs migration:generate \
  -d src/infrastructure/persistence/data-source.ts \
  src/infrastructure/persistence/migrations/DescriptiveMigrationName
```

Review the generated SQL before committing it.

## Run Migrations

```bash
npx typeorm-ts-node-commonjs migration:run \
  -d src/infrastructure/persistence/data-source.ts
```

## Revert the Last Migration

```bash
npx typeorm-ts-node-commonjs migration:revert \
  -d src/infrastructure/persistence/data-source.ts
```

## Verification

Use the repository contract tests to prove the PostgreSQL implementation still behaves like the in-memory repository:

```bash
npm run db:up
npm run test:postgres
```
