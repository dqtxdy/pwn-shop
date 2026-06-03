# Blockchain-Enabled Physical Asset Pawnshop System

Capstone implementation for Introduction to Software Engineering.

## Project Layout

- `apps/api`: NestJS OOP backend for off-chain workflows, adapters, audit events, and REST APIs.
- `apps/web`: React + Ant Design + Ant Design Web3 frontend for customer, staff, and admin interfaces.
- `PawnShop-SmartContract`: Foundry Solidity contracts for on-chain custody and settlement (stored separately; not included in this repo).
- `docs/architecture`: UML-style diagrams and SRS traceability.

## How to Run

### 1. Install dependencies

```bash
npm install
```

### 2. Start the API server

```bash
npm run dev:api
# Equivalent: npm --workspace apps/api run start:dev
# Listens on http://localhost:3000
```

### 3. Start the web dev server

```bash
npm run dev:web
# Equivalent: npm --workspace apps/web run dev
# Open http://localhost:5173
```

> The app auto-logs in as **Demo Customer** on page load. Use the role selector in the topbar to switch to Validator or Admin.

### 4. Run unit tests

```bash
# Backend (NestJS / Jest) — expected: 14 passed, 3 suites
npm --workspace apps/api run typecheck   # TypeScript check, 0 errors
npm --workspace apps/api test

# Frontend (Vitest) — expected: 5 passed, 1 suite
npm --workspace apps/web test
```

### 5. Run Playwright E2E tests

Both the API server and web dev server must be running before executing E2E tests (Playwright starts them automatically via `webServer` config if they are not already up).

```bash
npm --workspace apps/web run test:e2e
# Expected: 20 passed (5 workflow + 15 responsive across 3 viewports)
```

Full test layer details: [`docs/testing-report.md`](docs/testing-report.md)

---

### Smart-contract verification (optional, requires Foundry)

The contracts repo is not included here. Clone it separately if you want to run Solidity tests.

```bash
cd PawnShop-SmartContract
forge build
forge test
```

---

> **Note:** The API uses mock adapters for KYC, logistics, storage, price oracle, notifications, and blockchain RPC so the capstone can be demonstrated without vendor credentials. See [`docs/architecture/README.md`](docs/architecture/README.md) for the full architecture and [`docs/demo-script.md`](docs/demo-script.md) for the 11-step presentation flow.
