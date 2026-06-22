# Blockchain-Enabled Physical Asset Pawnshop System

Capstone project for Introduction to Software Engineering.

This repository implements a production-like pawnshop workflow for physical assets:
customers submit collateral, staff validate and appraise it, loans and repayments can be
settled on a local EVM chain, and marketplace, layaway, and fractionalization flows are
available for demo and testing.

The application is built to demonstrate both software-engineering structure and blockchain
integration:

- `apps/api` - NestJS backend with controllers, DTOs, services, guards, repositories, and
  infrastructure adapters.
- `apps/web` - React + TypeScript frontend.
- `PawnShop-SmartContract` - Foundry smart contracts and local deployment scripts.
- `docs` - architecture notes, testing report, traceability, and presentation script.

## Prerequisites

Install these before running the full project:

- Node.js and npm
- Foundry, with `forge` and `anvil` available on your `PATH`
- Docker, only if you want PostgreSQL persistence
- MetaMask, only if you want to manually sign Local Anvil transactions in the browser

Do not hardcode a personal Foundry installation path in documentation or scripts. If `forge`
or `anvil` is not found, install Foundry or add your Foundry `bin` directory to `PATH`.

## Install

From the repository root:

```bash
npm install
```

Compile the Solidity contracts:

```bash
cd PawnShop-SmartContract
forge build
cd ..
```

## Environment

The API process runs from the `apps/api` workspace, so the backend environment file belongs
there:

```bash
cp apps/api/.env.example apps/api/.env
```

The backend defaults to:

- API: `http://localhost:3000/api`
- Web origin: `http://localhost:5173`
- Persistence: in-memory
- Blockchain: mock adapter
- Demo endpoints: enabled through `DEMO_MODE=true` in `apps/api/.env`

The frontend defaults to `http://localhost:3000/api` without an env file. If you change the
API port, create `apps/web/.env.local` and set:

```bash
VITE_API_BASE_URL=http://localhost:<api-port>/api
```

## Run Mode Overview

| Mode | Persistence | Blockchain | Use this when |
| --- | --- | --- | --- |
| Mock demo | In-memory | Mock adapter | You want the fastest UI demo with no database or chain. |
| Postgres demo | PostgreSQL | Mock adapter | You want real database persistence without blockchain signing. |
| Local Anvil demo | In-memory or PostgreSQL | Local EVM contracts | You want real wallet-signed contract transactions. |

The two switches are independent:

- `PERSISTENCE_MODE=memory` or `PERSISTENCE_MODE=postgres`
- `BLOCKCHAIN_MODE=mock` or `BLOCKCHAIN_MODE=anvil`
- `STORAGE_MODE=mock` or `STORAGE_MODE=filesystem`

The demo workspace includes two customer accounts, `customer-1` and `customer-2`,
both assigned the same `CUSTOMER` role. They are labeled as Demo Customer 1 and
Demo Customer 2 in the UI so cross-customer marketplace and layaway flows can be
tested without implying separate customer types.

## Run The Default Mock Demo

This is the easiest mode for presentation rehearsal.

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173
```

In this mode, the API uses an in-memory repository and the blockchain adapter returns demo
transaction responses. No Anvil node, MetaMask setup, or PostgreSQL container is required.

## Evidence Storage Modes

The system keeps large evidence files off-chain. Contracts store transaction state and
events; the backend stores evidence metadata, URI, and content hash.

Mock storage is the default:

```bash
STORAGE_MODE=mock
```

Filesystem storage is the free production-like local option:

```bash
STORAGE_MODE=filesystem
STORAGE_LOCAL_DIR=.local-object-storage/evidence
STORAGE_MAX_BYTES=10485760
```

Filesystem mode writes decoded evidence bytes outside the database and returns a
`local-object://...` URI plus a SHA-256 content hash. Use it when you want to prove that
the architecture is ready for S3-compatible object storage without paying for cloud
services during the capstone.

## Run With PostgreSQL Persistence

Start the local database:

```bash
npm run db:up
```

Set these values in `apps/api/.env`:

```bash
PERSISTENCE_MODE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=pwn_shop
DB_SYNCHRONIZE=true
DB_MIGRATIONS_RUN=false
```

Start the app:

```bash
npm run dev:api
npm run dev:web
```

Run the repository contract tests against PostgreSQL:

```bash
npm run test:postgres
```

Stop the database:

```bash
npm run db:down
```

The PostgreSQL implementation is intentionally behind the same repository interface as the
in-memory implementation. This is part of the OOP and DIP story: services depend on the
`PawnRepository` port, not directly on TypeORM.

## Run With Real Local Anvil Blockchain

Use this mode when you want real local EVM transactions for loans, repayments, marketplace
listing, layaway, installment completion, and fractionalization.

Terminal 1 - start Anvil:

```bash
anvil --host 0.0.0.0
```

Terminal 2 - deploy the local protocol:

```bash
npm run deploy:local
```

This writes the local deployment artifact used by the API:

```text
PawnShop-SmartContract/deployments/local-anvil.json
```

Terminal 3 - start the API in Anvil mode:

```bash
BLOCKCHAIN_MODE=anvil npm run dev:api
```

Terminal 4 - start the web app:

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173
```

Check blockchain wiring:

```bash
curl http://localhost:3000/api/blockchain/config
curl http://localhost:3000/api/blockchain/health
```

### MetaMask Setup For Local Anvil

Add a custom network:

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

Import the local demo wallets from Anvil. These are public development keys and must never be
used outside a local test chain.

| Demo user | Address | Private key |
| --- | --- | --- |
| Customer seller | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Customer buyer | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |

The frontend checks that the connected wallet matches the active demo session before sending
Anvil transactions.

## Blockchain Mode Behavior

Mock mode:

- No chain is required.
- The backend uses `MockBlockchainGateway`.
- Workflows remain deterministic and fast for UI tests.
- This is the default mode.

Anvil mode:

- A local Anvil node is required.
- The backend uses `AnvilBlockchainGateway`.
- Contract addresses are loaded from `PawnShop-SmartContract/deployments/local-anvil.json`.
- Wallet actions are returned to the frontend for MetaMask signing.
- Receipts are verified by the backend before state is updated.

Implemented on-chain flows in Anvil mode:

- Staff appraisal publication
- Customer loan acceptance
- Loan repayment
- Customer consignment marketplace listing
- Layaway purchase
- Layaway installment completion
- Asset fractionalization, fraction purchase, and redemption

## Validation Commands

Repository readiness scan:

```bash
npm run check:readiness
```

Backend:

```bash
npm --workspace apps/api run typecheck
npm --workspace apps/api test
```

Frontend:

```bash
npm --workspace apps/web run build
npm --workspace apps/web test
npm --workspace apps/web run test:e2e
```

Smart contracts:

```bash
cd PawnShop-SmartContract
forge build
forge test
cd ..
```

Deterministic Local Anvil smoke test:

```bash
npm run test:smoke
```

`npm run test:smoke` expects Anvil to be running. It resets the local chain, deploys the
protocol, and runs the end-to-end blockchain smoke suite.

PostgreSQL contract test:

```bash
npm run db:up
npm run test:postgres
```

## Architecture Notes

The backend is the main OOP demonstration surface:

- Controllers expose API operations.
- DTOs validate incoming request data.
- Services coordinate business workflows.
- Domain models describe the core pawnshop concepts.
- Repositories abstract persistence.
- Infrastructure adapters abstract blockchain, KYC, logistics, storage, notifications, and
  pricing.
- Guards enforce JWT authentication and role-based authorization.

The smart contracts are treated as bounded settlement components. They are not the whole
backend; the NestJS application remains responsible for orchestration, authorization,
off-chain evidence, persistence, and workflow state.

## Useful Docs

- Demo script: `docs/demo-script.md`
- Testing report: `docs/testing-report.md`
- Architecture notes: `docs/architecture/README.md`
- Requirement traceability: `docs/architecture/traceability.md`
- Security policy: `SECURITY.md`
- Security self-assessment: `docs/security-self-assessment.md`
- Compliance playbook: `docs/compliance-playbook.md`
- Environment validation: `.env.validation.md`
- Contract timing assumptions: `docs/contract-time-assumptions.md`
- Development walkthrough: `walkthrough.md`
