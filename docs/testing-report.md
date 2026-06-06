# Testing Report: Local Anvil Integration, Loans, Layaways, & Fractionalization

This report documents the testing strategy, newly added test coverage, and validation procedures implemented across the application, highlighting the recent additions for **Phase 2C-B (Fractionalization Flow)**.

## Testing Strategy

To ensure high reliability, we implemented:
1. **Isolated Unit Tests**: Mocks for `ethers` JSON-RPC provider, signer wallet, contract instances, and event log interface encoding in the `AnvilBlockchainGateway` adapter tests, and mocking `wagmi` / `viem` in the React frontend tests.
2. **Regression Testing**: Verifying that the existing NestJS backend services and controllers continue to pass in mock mode.
3. **Frontend Validation**: Ensuring the React frontend builds successfully, typechecks, and passes its unit and end-to-end (E2E) suites in mock mode.
4. **On-Chain Log Verification**: Validating event log topics and parameter configurations for `AppraisalUpdated`, `LoanCreated`, `LoanRepaid`, `ItemConsigned`, `LayawayStarted`, `AssetFractionalized`, `FractionsBought`, and `PhysicalCustodyHandoverPending`.

---

## Newly Added Tests (Phase 2C-B)

We updated and expanded the test suite in the backend API and frontend web client covering:

### 1. Backend Unit Tests (`apps/api/test/pawn-workflow.service.spec.ts`)
- Added validations for fractionalization eligibility (no active loans, layaways, or disputes).
- Added checks for price divisibility (target price must be divisible by total shares).
- Proved ownership rules: admin can fractionalize protocol-owned assets, but only the owner can fractionalize customer-owned assets.
- Covered KYC checks for buyers of fractions.
- Asserted redemption requires 100% fraction ownership.

### 2. Live Integration Smoke Tests (`apps/api/test/anvil-smoke.spec.ts`)
- Added a full end-to-end fractionalization, purchase, and redemption loop:
  - **Alice** (`customer-1`) fractionalizes asset `A-1002` (token ID `2`) on-chain.
  - **Admin** fractionalizes protocol-owned asset `A-1003` (token ID `3`) on-chain after acquiring custody.
  - **Charlie** (`customer-2`) buys 100% of the fractions of `A-1003` on-chain (ERC20 token approval + buy call).
  - **Charlie** redeems `A-1003` (burns fractions and triggers handover).
  - Verifies that `AssetToken.ownerOf(3)` matches Charlie's wallet address on-chain.
  - Verifies database states (asset owner, status) are updated correctly.

### 3. Frontend Unit Tests (`apps/web/src/App.test.tsx`)
- Added Vitest coverage for the Fractions view rendering, navigation, and modal forms.
- Verified that all three panels (Eligible Assets, Active Pools, My Holdings) render correctly.
- Simulated fractionalize and buy shares form submissions, verifying API endpoint calls.

### 4. E2E Tests (Playwright)
- Added E2E regression check in `apps/web/e2e/workflow.spec.ts` to verify navigation to the Fractions page and correct rendering of headers.

### 5. Authentication & Role Guards Integration Tests (`apps/api/test/auth.guard.spec.ts`)
- Added comprehensive integration tests proving the backend JWT auth and roles enforcement:
  - Unauthenticated requests return `401 Unauthorized`.
  - Unauthorized roles return `403 Forbidden` (e.g. Customer attempting Staff actions, Staff attempting Admin actions).
  - Cross-customer safety prevents one customer from acting as another (e.g. uploading evidence to another customer's asset).
  - Staff/admin protected endpoints remain accessible to correct roles (e.g. Staff creating appraisals, Admin viewing protocol dashboard).

---

## Running Verification Commands

### Smart Contracts (Foundry)
Run smart contract tests:
```bash
cd PawnShop-SmartContract
forge test
cd ..
```
**Output:** `Ran 8 test suites: 19 tests passed, 0 failed` (All tests including `PawnFractionalTest` pass successfully).

### Backend API (NestJS)
Run type checking and unit/integration tests:
```bash
npm --workspace apps/api run typecheck
npm --workspace apps/api test
```
**Output:** `18 skipped, 91 passed, 109 total` (12 Postgres tests and 6 Anvil smoke tests are skipped by default when dynamic configuration defaults are used and `POSTGRES_TESTS` is omitted).

### Postgres Integration Tests (Opt-In)
To verify Postgres persistence against a live DB, start the database service and run the tests:
```bash
npm run db:up
POSTGRES_TESTS=1 npm --workspace apps/api test -- pawn-repository.spec.ts
```
**Expected Output:**
```text
PASS test/pawn-repository.spec.ts
  PawnRepository Contract Tests
    InMemoryPawnRepository
      ✓ should save and find a user by wallet (3 ms)
      ✓ should save mixed-case wallet address and perform case-insensitive lookups (1 ms)
      ...
    PostgresPawnRepository
      ✓ should save and find a user by wallet (80 ms)
      ✓ should save mixed-case wallet address and perform case-insensitive lookups (62 ms)
      ...
Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```

> [!IMPORTANT]
> **Running Smoke Tests:** The local Anvil node must be running in the background before executing `npm run test:smoke`. You can start it with: `anvil --host 0.0.0.0`.

To run the live integration smoke tests deterministically on Anvil (which redeploys the smart contracts to reset state and runs the smoke suite):
```bash
npm run test:smoke
```
**Output:** `6 passed` (All integration tests pass in `anvil-smoke.spec.ts` under `BLOCKCHAIN_MODE=anvil` after a fresh deployment).

### Frontend Web (React / Vitest)
Run production build and test suites:
```bash
npm --workspace apps/web run build
npm --workspace apps/web test
```
**Output:** `9 passed` (Includes Fractions rendering and modal submission tests).

### E2E Tests (Playwright)
Run the Playwright E2E tests:
```bash
npm --workspace apps/web run test:e2e
```
**Output:** `21 passed` (Added `Fractions Workspace` validation test).
