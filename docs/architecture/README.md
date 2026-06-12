# System Architecture & Blockchain Integration Design

This document details the software architecture of the Physical Asset Pawnshop System, with a focus on blockchain integration, object-oriented adapter patterns, and integration options.

> [!IMPORTANT]
> **Default Integration Mode:** The application defaults to **Mock Mode** (`BLOCKCHAIN_MODE=mock`) where all Web3 dependencies are simulated. This allows all unit, integration, and E2E tests to run out-of-the-box without requiring a running blockchain node.

## System Architecture

The project follows a Clean Architecture / Ports and Adapters (Hexagonal) pattern.

```mermaid
graph TD
    subgraph Frontend (React / Cloudscape)
        UI[App.tsx] --> API_Client[api.ts]
    end

    subgraph Backend API (NestJS)
        Controller[pawn.controllers.ts] --> Service[pawn-workflow.service.ts]
        Service --> Port[BlockchainGateway Interface]
        
        Port -.-> Mock[MockBlockchainGateway]
        Port -.-> Anvil[AnvilBlockchainGateway]
    end

    subgraph External Systems
        Anvil -.-> Blockchain[Local Anvil Node :8545]
    end
```

### Core Flow
1. **Intake & Logistics**: Assets are created in a draft state, shipped via logistics tracking (FedEx), unboxed by validators, and appraised.
2. **Offer Drafting**: A validator issues an appraisal and drafts a loan offer specifying principal, duration, and APR.
3. **Web3 Gateway Integration**: On acceptance of the loan or recording of repayment, actions flow through the unified `BlockchainGateway` interface.

---

## Authentication & Authorization Guard Hardening

The application employs real NestJS guards and decorators to secure HTTP controller endpoints:
- **JWT Authentication Guard (`JwtAuthGuard`)**: Verifies Bearer JWT tokens issued by demo login or wallet login.
- **Role-Based Authorization Guard (`RolesGuard`)**: Restricts controller actions to appropriate roles (`CUSTOMER`, `STAFF`, `ADMIN`) using the `@Roles(...)` metadata decorator.
- **Current User Context (`@CurrentUser()`)**: Discards unsafe client-controlled actor headers/fields (like `x-user-id`, `sellerId`, `buyerId`) and derives user identity securely from the validated JWT token payload.
- **Cross-Customer Security**: Prohibits customers from performing actions on or viewing assets, loans, or layaways belonging to other customers.

---

## OOP Dependency Inversion in Blockchain Gateways

The system demonstrates the **Dependency Inversion Principle (DIP)** (the "D" in SOLID) through its gateway adapter design.

- **The Port**: `BlockchainGateway` (defined in `apps/api/src/application/ports/external-services.ts`) is a high-level application port defining what operations the business domain expects from the blockchain.
- **The Adapters**: Both `MockBlockchainGateway` and `AnvilBlockchainGateway` are low-level detail providers. They implement the interface but interact with different environments.
- **Benefits**:
  - The core domain (`PawnWorkflowService`) does not depend directly on Web3 library specifics, Anvil, or RPC endpoints. It only depends on the abstract `BlockchainGateway` interface.
  - Changing between mock environments (for testing/E2E) and local contract environments (for developer integration) requires only changing an environment variable (`BLOCKCHAIN_MODE`), leaving core workflow logic completely unmodified.

---

## External Provider Adapter Boundaries

The same DIP pattern is used for non-blockchain integrations:

| Port | Local Adapter | Production Replacement |
| --- | --- | --- |
| `KycProvider` | Configurable sandbox outcomes through `KYC_REVIEW_WALLETS` and `KYC_REJECTED_WALLETS` | Contracted KYC/KYB and sanctions provider |
| `StorageProvider` | Mock object store or `FileSystemStorageProvider` using `STORAGE_MODE=filesystem` | S3-compatible object storage with encryption, lifecycle rules, and access logs |
| `LogisticsProvider` | Mock FedEx-style tracking codes | Real courier API |
| `NotificationGateway` | Local mock notifications | Email/SMS provider |
| `PriceOracle` | Mock reference quotes | Appraisal/pricing data provider |

The important design point is that `PawnWorkflowService` depends on provider interfaces, not concrete vendor SDKs. This keeps the capstone inexpensive while still showing how real integrations can be swapped in without rewriting domain logic.

---

## Mock Mode vs. Local Anvil Mode

The application supports two blockchain gateway modes selected by the `BLOCKCHAIN_MODE` environment variable.

| Feature | Mock Mode (`BLOCKCHAIN_MODE=mock`) | Anvil Mode (`BLOCKCHAIN_MODE=anvil`) |
|---|---|---|
| **Default Status** | **Yes** (Default active mode) | No (Requires explicit env setting) |
| **RPC Requirement** | None. Completely self-contained. | Local Anvil node running at `http://127.0.0.1:8545`. |
| **Deployment Info** | Dummy configurations. | Loads `PawnShop-SmartContract/deployments/local-anvil.json`. |
| **Blockchain Health** | Always healthy (offline simulation). | Verifies RPC connection via `eth_chainId` and checks deployed contract bytecode exists via `eth_getCode`. |
| **Loan Acceptance** | Simulates the transaction and records a demo hash. | Customer signs `ERC721.approve` and `createPawnLoan`; backend verifies the `LoanCreated` receipt. |
| **Repayment Recording** | Simulates repayment and records a demo hash. | Customer signs `ERC20.approve` and `repayPawn`; backend verifies the `LoanRepaid` receipt. |

---

## Smart Contract Integration Honesty Checklist

In the current implementation:
1. **Mock Mode is Default**: Runs without external services.
2. **Local Anvil Mode**: Verifies deployment configuration, connection health, and receipt status/log emission on-chain.
3. **Loan Acceptance & Repayment** (**Phase 2A — Implemented**): In Anvil mode, the customer wallet signs real `ERC721.approve` + `createPawnLoan` transactions and the repayment path signs real `ERC20.approve` + `repayPawn` transactions against the deployed `PawnProtocol` contract.
4. **Marketplace & Layaway** (**Phase 2B/2C-A — Implemented**): Customer consignment listing (`ERC721.approve` + `createListing`), layaway purchase (`ERC20.approve` + `startLayaway`), and layaway installment completion (`ERC20.approve` + `payInstallment`) use real on-chain contract calls in Anvil mode.
5. **Fractionalization** (**Phase 2C-B — Implemented**): Full smart contract fractionalization flows are integrated in Anvil mode:
   - Customer-owned asset fractionalization via `ERC721.approve` + `fractionalizeOwnedAsset` on `PawnProtocol`.
   - Protocol/admin custodied asset fractionalization via `fractionalizeItem` on `PawnProtocol`.
   - Fraction purchase via `ERC20.approve` + `buyFractions` on `PawnProtocol`.
   - Physical asset redemption via `redeemAsset` on `PawnProtocol` (which burns the required 100% fraction token supply and transfers the underlying NFT to the redeemer).
   - Fully verified with active on-chain smoke tests in `apps/api/test/anvil-smoke.spec.ts`.
6. **Time Assumptions**: Loan, layaway, and fractionalization deadline logic uses day-scale `block.timestamp` checks. The assumptions and production hardening path are documented in `docs/contract-time-assumptions.md`.

---

## Loan Workflow Mismatch (Honest Analysis)

In Phase 2A, the customer wallet signs real on-chain transactions for loan acceptance and repayment. The remaining mismatch is that the loan *offer* is still staff-driven off-chain (the borrower is not presenting a signed offer to the contract directly).

### 1. Current App Flow (Staff-Driven Offer, Phase 2A)
1. Customer requests pawn.
2. Staff appraises asset and generates a loan offer.
3. Customer clicks **Accept Loan** in the application interface.
4. Frontend prompts MetaMask to sign `ERC721.approve` + `createPawnLoan` sequentially.
5. Backend verifies the on-chain receipt and updates state to `LOAN_ACTIVE`.

### 2. Remaining Mismatch
The smart contract expects the borrower to initiate `createPawnLoan(...)` directly with knowledge of the offer parameters. Currently, the backend passes these parameters to the frontend as unsigned calldata actions, and the frontend submits them. This works for the demo but a production system would require signed off-chain offers.

### 3. Next Hardening Options
To fully bridge this mismatch:
- **Option A (Contract-Side Offers)**: Modify `PawnProtocol` to support loan offers signed off-chain by the platform admin/oracle. The borrower can then submit the signed offer along with their acceptance transaction to `acceptPawnOffer(...)` on-chain.
- **Option B (Backend-Signed Transaction Dispatches)**: Have the backend act as an agent that holds the borrower's temporary signature authorization, calling `createPawnLoan` on their behalf via an admin/relayer account once terms are accepted in the app.

---

## Persistence & Repository Polymorphism

The application demonstrates clean design principles (DIP/SOLID) through repository polymorphism, decoupling the data access contract from the underlying database driver.

- **The Port**: `PawnRepository` (defined in `apps/api/src/application/ports/pawn-repository.ts`) acts as the boundary.
- **The Adapters**:
  - `InMemoryPawnRepository` (default): Simulates database operations using Map collections, serving standard local runs and mock tests without external dependencies.
  - `PostgresPawnRepository`: Interacts with a PostgreSQL database using TypeORM.
- **Dynamic swappability**:
  Selecting a repository type is as simple as configuring `PERSISTENCE_MODE` in the `.env` configuration file:
  - `PERSISTENCE_MODE=memory` (fallback default)
  - `PERSISTENCE_MODE=postgres`
  When PostgreSQL is active, local demo runs can use `DB_SYNCHRONIZE=true` for fast setup. Production-like runs should set `DB_SYNCHRONIZE=false` and `DB_MIGRATIONS_RUN=true` to use the versioned TypeORM migration in `apps/api/src/infrastructure/persistence/migrations`. Standard seed entries are populated on startup if tables are empty.

### Running with PostgreSQL
1. Start the PostgreSQL container service:
   ```bash
   docker compose up -d
   ```
2. Update configuration in `apps/api/.env` (or set environment variables):
   ```env
   PERSISTENCE_MODE=postgres
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DB_DATABASE=pwn_shop
   DB_SYNCHRONIZE=true
   DB_MIGRATIONS_RUN=false
   ```
3. Restart the backend. The API will connect to the database and initialize schema using the configured persistence mode.
