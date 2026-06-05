# Physical Asset Pawnshop System

A secure, blockchain-enabled physical asset pawnshop system featuring clean architecture, NestJS backend API, React frontend client, and solidity-based pawn contract integration.

---

## Getting Started

### 1. Installation

Install all workspace and contract dependencies:
```bash
npm install
cd PawnShop-SmartContract && /home/respectthanh/.foundry/bin/forge build
```

---

## Run & Persistence Modes

The backend architecture implements the **Dependency Inversion Principle (DIP)** (the "D" in SOLID) via repository polymorphism, isolating core business logic from direct database engine dependencies. The service layer interacts only with the abstract `PawnRepository` port interface, allowing hot-swapping between memory and database engines.

Select your mode of operation by setting environment variables in the `.env` file (or passing them dynamically):

### Mode A: Memory Mode (Default / Developer Sandbox)
Perfect for offline local runs and fast unit test runs. No external database or blockchain node is required.
```env
PERSISTENCE_MODE=memory
BLOCKCHAIN_MODE=mock
```
To run the mock backend and mock web frontend:
```bash
# Start backend API (Memory mode)
npm run dev:api

# Start web client (Mock blockchain mode)
npm run dev:web
```

### Mode B: PostgreSQL Mode (Production-Grade Persistence)
Uses local PostgreSQL for persistent record-keeping. Schemas are automatically synced for developer convenience.

> [!NOTE]
> Docker Desktop/Docker Engine is required for Postgres validation. If Docker is unavailable, default API tests will skip the Postgres integration tests honestly.

1. Start the PostgreSQL container service:
   ```bash
   npm run db:up
   ```
2. Update the `.env` configuration:
   ```env
   PERSISTENCE_MODE=postgres
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DB_DATABASE=pwn_shop
   ```
3. Run the backend as usual. Schema generation and demo seeds occur automatically on startup.

---

## Blockchain Modes & Smoke Tests

The application supports two blockchain gateway implementations selected via the `BLOCKCHAIN_MODE` environment variable.

### 1. Mock Mode (Default)
All smart-contract interactions are simulated off-chain for rapid UI development and standard unit test suites.
```env
BLOCKCHAIN_MODE=mock
```

### 2. Local Anvil Mode (On-Chain Validation)
Runs against a local Foundry Anvil network node to execute real smart-contract operations (loan creation, layaways, fractionalization).

#### Running the Smoke Tests:
1. Start the Anvil blockchain node first:
   ```bash
   /home/respectthanh/.foundry/bin/anvil --host 0.0.0.0
   ```
2. In another terminal, run the deterministic smoke test execution suite:
   ```bash
   npm run test:smoke
   ```
   *Note: This automatically resets the Anvil node state, deploys contracts, and runs the Jest integration suite.*

---

## Validation & Verification Command Lines

Use these commands to verify type safety and run the testing suite:

### Backend API
- **Typecheck:** `npm --workspace apps/api run typecheck`
- **Unit & Integration Tests:** `npm --workspace apps/api test`
- **Postgres Integration Tests (Opt-In):**
  Start the DB service and run the Postgres test suite:
  ```bash
  npm run db:up
  npm run test:postgres
  ```
  **Expected Output:**
  ```text
  PASS test/pawn-repository.spec.ts
    PawnRepository Contract Tests
      InMemoryPawnRepository
        ✓ should save and find a user by wallet (2 ms)
        ...
      PostgresPawnRepository
        ✓ should save and find a user by wallet (67 ms)
        ...
  ```

### Smart Contracts
- **Build:** `cd PawnShop-SmartContract && /home/respectthanh/.foundry/bin/forge build`
- **Test:** `cd PawnShop-SmartContract && /home/respectthanh/.foundry/bin/forge test`

### Frontend Web Client
- **Build:** `npm --workspace apps/web run build`
- **Unit Tests:** `npm --workspace apps/web test`
- **E2E Playwright Tests:** `npm --workspace apps/web run test:e2e`
