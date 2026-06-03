# Blockchain-Enabled Physical Asset Pawnshop Architecture

## Architectural Style

The capstone is organized as a layered, object-oriented web system with a bounded smart-contract settlement layer.

- `apps/web`: React + Ant Design + Ant Design Web3 user interface.
- `apps/api`: NestJS backend with controllers, DTOs, services, ports, repositories, domain models, and adapters.
- `PawnShop-SmartContract`: Solidity contracts for token custody, loans, marketplace, layaway, and fractionalization.
- `docs/architecture`: design rationale, UML-style diagrams, and SRS traceability.

The backend owns off-chain workflow state: users, KYC, shipments, evidence files, appraisal records, disputes, audit events, and blockchain event indexing. Smart contracts own irreversible token custody and crypto settlement.

## Running Demo System

### Auth / Session

A demo auth endpoint `POST /api/auth/demo-login` accepts a role (`CUSTOMER`, `STAFF`, or `ADMIN`) and returns a typed session object with a signed mock JWT. The frontend auto-logs in as `CUSTOMER` on page load via this endpoint and stores the session in React state. The role selector in the topbar switches sessions without a page reload.

Three seeded users are available:

| Role | userId | Display Name | Wallet |
|---|---|---|---|
| CUSTOMER | `customer-1` | Demo Customer | `0x1111111111111111111111111111111111111111` |
| STAFF | `staff-1` | Demo Staff | `0x2222222222222222222222222222222222222222` |
| ADMIN | `admin-1` | Demo Admin | `0x3333333333333333333333333333333333333333` |

### UI Route Groups / Tabs

The React app (`apps/web`) is organized into four tabs:

1. **Customer Portal** — asset submission, evidence upload, shipment creation, loan acceptance, repayment, and listing returned assets for sale.
2. **Staff / Validator Dashboard** — validation queue, unboxing proof upload, appraisal and loan-offer creation.
3. **Admin Panel** — live dashboard metrics (active loans, vault assets, open disputes, protocol fees) and audit event log.
4. **Marketplace** — active listings viewer with layaway purchase action.

Each tab enforces role-aware rendering: if the active session role does not match the tab's expected role, a **Role Mismatch** alert is displayed and action buttons are disabled.

### E2E Test Structure

Playwright tests live under `apps/web/e2e/` and are split into two files:

- **`workflow.spec.ts`** — stateful tests that mutate backend state (loan submission, listing creation, role switching). Runs on `desktop-workflow` project only (`workers: 1`) to avoid corrupting the shared in-memory repository across parallel Playwright projects.
- **`responsive.spec.ts`** — read-only layout tests that run across desktop (1440 × 900), tablet (768 × 1024), and mobile (390 × 844) viewports.

## Use Case Diagram

```mermaid
flowchart LR
  Customer((Customer))
  Staff((Pawnshop Staff))
  Admin((Admin))
  Chain((Blockchain))
  Courier((Logistics API))
  KYC((KYC Provider))

  Customer --> SubmitAsset[Submit asset request]
  Customer --> UploadProof[Upload pre-shipment evidence]
  Customer --> AcceptOffer[Accept appraisal loan offer]
  Customer --> RepayLoan[Repay single-payment loan]
  Customer --> OpenDispute[Open dispute]

  Staff --> RecordUnboxing[Record unboxing proof]
  Staff --> Appraise[Create appraisal]
  Staff --> ReturnAsset[Arrange return shipment]

  Admin --> ConfigureRisk[Configure fees and risk]
  Admin --> ResolveDispute[Resolve dispute]
  Admin --> MonitorLiquidity[Monitor liquidity and custody]

  SubmitAsset --> KYC
  UploadProof --> Courier
  AcceptOffer --> Chain
  RepayLoan --> Chain
  ReturnAsset --> Courier
```

## Class Diagram

```mermaid
classDiagram
  class PawnWorkflowService {
    +createAsset(dto)
    +uploadEvidence(dto)
    +createShipment(dto)
    +createAppraisal(dto)
    +createLoanOffer(dto)
    +acceptLoan(id, dto)
    +recordRepayment(dto)
    +createDispute(dto)
  }

  class PawnRepository {
    <<interface>>
    +saveAsset(asset)
    +saveLoan(loan)
    +saveDispute(dispute)
    +getDashboard()
  }

  class KycProvider {
    <<interface>>
    +verifyWalletOwner(userId, walletAddress)
  }

  class LogisticsProvider {
    <<interface>>
    +createShipment(input)
    +track(trackingCode)
  }

  class BlockchainGateway {
    <<interface>>
    +prepareLoanDisbursement(input)
    +recordRepayment(input)
  }

  class InMemoryPawnRepository
  class MockKycProvider
  class MockLogisticsProvider
  class MockBlockchainGateway

  PawnWorkflowService --> PawnRepository
  PawnWorkflowService --> KycProvider
  PawnWorkflowService --> LogisticsProvider
  PawnWorkflowService --> BlockchainGateway
  PawnRepository <|.. InMemoryPawnRepository
  KycProvider <|.. MockKycProvider
  LogisticsProvider <|.. MockLogisticsProvider
  BlockchainGateway <|.. MockBlockchainGateway
```

## Sequence Diagram: Accepted Appraisal Loan

```mermaid
sequenceDiagram
  participant C as Customer
  participant W as Web App
  participant A as NestJS API
  participant S as Storage Adapter
  participant L as Logistics Adapter
  participant P as PawnProtocol

  C->>W: Submit asset + proof
  W->>A: POST /assets and /evidence
  A->>S: Store evidence hash/URI
  C->>W: Create shipment
  W->>A: POST /shipments
  A->>L: Create tracked shipment
  A-->>W: Tracking state
  Staff->>A: POST /appraisals
  C->>W: Accept loan offer
  W->>A: POST /loans/:id/accept
  A->>P: createPawnLoan transaction
  P-->>A: LoanCreated event
  A-->>W: Loan active with tx hash
```

## Activity Diagram: Declined Appraisal Return

```mermaid
flowchart TD
  A[Asset received] --> B[Staff uploads unboxing evidence]
  B --> C[Staff records appraisal]
  C --> D{Customer accepts offer?}
  D -->|Yes| E[Execute loan]
  D -->|No| F[Invalidate appraisal]
  F --> G[Create return shipment]
  G --> H[Customer pays COD fee]
  H --> I[Asset returned]
  I --> J[Audit event recorded]
```

## Component Diagram

```mermaid
flowchart TB
  Web[React Ant Design Web3 App]
  Api[NestJS OOP API]
  Db[(PostgreSQL target)]
  Storage[Evidence Storage Adapter]
  Kyc[KYC Adapter]
  Logistics[Logistics Adapter]
  Chain[PawnProtocol Contracts]
  Listener[Blockchain Event Listener]

  Web --> Api
  Web --> Chain
  Api --> Db
  Api --> Storage
  Api --> Kyc
  Api --> Logistics
  Api --> Chain
  Chain --> Listener
  Listener --> Api
```

## Deployment Diagram

```mermaid
flowchart LR
  Browser[Customer/Staff Browser]
  WebHost[Static Web Host]
  ApiHost[API Runtime]
  Postgres[(PostgreSQL)]
  ObjectStore[(Evidence Object Storage)]
  Rpc[EVM RPC Provider]
  Courier[Courier API]
  KycSvc[KYC Service]

  Browser --> WebHost
  Browser --> ApiHost
  Browser --> Rpc
  ApiHost --> Postgres
  ApiHost --> ObjectStore
  ApiHost --> Rpc
  ApiHost --> Courier
  ApiHost --> KycSvc
```

## OOP Notes For Presentation

- Encapsulation: domain state is manipulated through `PawnWorkflowService`, not directly by controllers.
- Abstraction: external dependencies are represented by interfaces such as `KycProvider`, `LogisticsProvider`, and `BlockchainGateway`.
- Polymorphism: mock adapters can be replaced by production adapters without changing application services.
- Separation of concerns: controllers handle HTTP, DTOs validate input, services enforce workflows, repositories persist data, and contracts settle irreversible financial actions.
