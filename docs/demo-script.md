# Demo Script — PawnShop Protocol Capstone Presentation

## Setup

1. Start the API server: `npm --workspace apps/api run start:dev`
2. Start the web dev server: `npm --workspace apps/web run dev`
3. Open `http://localhost:5173` in a browser.

> **Default state**: The app auto-logs in as **Demo Customer** (`customer-1`) on page load. No manual login step is needed.

---

## Presentation Flow

### Step 1 — Customer Session Starts by Default

**What to show:** The topbar displays **Demo Customer** and the role selector defaults to `Customer`. The Customer Portal tab is active with the asset table pre-populated from the seeded backend data.

**Talking point:** "The demo auth layer simulates a real JWT session. In production, this becomes wallet-signature authentication. The role selector lets the teacher quickly switch actors without a separate login page."

---

### Step 2 — Submit Asset Request

**What to show:**
1. In the **Submit New Loan Request** form, fill in:
   - Title: `Vintage Rolex Watch`
   - Category: `watch`
   - Declared Value: `8000`
   - Requested Amount: `5000`
   - Description: `Excellent condition, original papers included.`
2. Click **Submit Request**.
3. The new asset row appears immediately in the My Assets table with status `PENDING`.

**Talking point:** "The form calls `POST /api/assets`. The NestJS controller delegates to `PawnWorkflowService.createAsset`, which validates the DTO and persists the asset through the `PawnRepository` port."

---

### Step 3 — Upload Evidence

**What to show:**
1. Click the **Upload Evidence** dragger area and attach any local image.
2. Click **Upload Evidence** button.
3. The status of that asset changes to `EVIDENCE_SUBMITTED` in the table.

**Talking point:** "Evidence is base64-encoded and stored with a mock IPFS URI via the `StorageAdapter` interface. In production, the mock is swapped for a real IPFS/Filecoin adapter — no service code changes required."

---

### Step 4 — Create Shipment

**What to show:**
1. Find the row with status `AWAITING_SHIPMENT`.
2. Click the **Ship Courier** button.
3. The status updates to `IN_TRANSIT` with a mock tracking code.

**Talking point:** "The `LogisticsProvider` port is called with the asset details. The mock adapter returns a hardcoded tracking number. The production adapter would call DHL/FedEx API."

---

### Step 5 — Staff / Validator Appraisal Flow

**What to show:**
1. Switch the role selector to **Validator** (Demo Staff).
2. Navigate to the **Staff / Validator Dashboard** tab.
3. The asset in `IN_TRANSIT` status appears in the Validation Queue.
4. Click **Upload Unboxing Proof** on that row — status moves to `RECEIVED`.
5. The asset ID auto-fills into the Appraisal Form.
6. Fill in Appraised Value: `7000` and LTV: `70`.
7. Click **Submit Appraisal** — the backend creates an appraisal and a loan offer simultaneously.

**Talking point:** "Notice how clicking the queue row auto-populates the form. This is OOP encapsulation in action — the Validator Dashboard component only exposes the `appraiserId` from the current session; no raw user ID is hardcoded."

---

### Step 6 — Customer Accepts Loan

**What to show:**
1. Switch back to **Customer** role.
2. In the My Assets table, the asset now shows a loan offer.
3. Click **Accept Loan** on that row.
4. The status changes to `LOAN_ACTIVE`.

**Talking point:** "The frontend calls `POST /api/loans/:id/accept`, which triggers the `BlockchainGateway.prepareLoanDisbursement` — returning a mock transaction hash. In production this becomes an on-chain EVM transaction on the `PawnProtocol` contract."

---

### Step 7 — Customer Repayment

**What to show:**
1. In the Loan Repayment section, the active loan `L-202` appears.
2. Select it and click **Repay Selected Loan**.
3. The loan status updates to `REPAID` and the protocol fee counter in the Admin Panel increments.

**Talking point:** "Repayment calls `POST /api/repayments`. The service records the event, updates the blockchain gateway, and increments `protocolFeesCollected` in the repository — which is then reflected in the Admin Panel metrics."

---

### Step 8 — Customer Lists Returned / Received Asset

**What to show:**
1. Asset `A-1004` (`Gold ring set`) is seeded with status `RECEIVED`.
2. Click **List For Sale** on that row.
3. A modal opens with the asset ID pre-filled (disabled).
4. Enter price: `2500` and click **Publish Listing**.
5. The row status changes to `LISTED` (orange tag).

**Talking point:** "The service enforces status constraints — only `RECEIVED` or `RETURNED` assets can be listed by customers. This is a domain rule enforced in `PawnWorkflowService.createListing`, not in the controller."

---

### Step 9 — Marketplace Layaway Purchase

**What to show:**
1. Click the **Marketplace** tab.
2. The seeded listing `LIST-001` (Titanium Watch) is visible with price and seller info.
3. Click **Buy with Layaway**.
4. A success notification confirms the layaway was created with 20% down payment.

**Talking point:** "Layaway maps to `REQ-4.3-1` in the SRS traceability matrix. The Solidity contract enforces the minimum 20% deposit on-chain; the API layer records the off-chain intent and forwards to the blockchain gateway."

---

### Step 10 — Role Mismatch Warning

**What to show:**
1. Switch the role selector to **Validator** (Demo Staff).
2. The Customer Portal tab is still active — a yellow **Role Mismatch** alert banner appears.
3. The **Submit Request** button is greyed out / disabled.
4. Similarly, switch to **Customer** and navigate to the Validator Dashboard — the appraisal form is blocked.

**Talking point:** "This demonstrates role-aware UI guards. Session data flows from the auth state through React props; components render disabled states without needing to know the full auth logic."

---

### Step 11 — Admin Dashboard Metrics

**What to show:**
1. Switch to **Admin** role.
2. Click the **Admin Panel** tab — no Role Mismatch alert appears.
3. Metrics cards show:
   - **Active loans**: live count from API
   - **Vault assets**: count of non-returned assets
   - **Open disputes**: live count
   - **Protocol fees collected**: incremented by repayment in Step 7
4. The Audit Events table shows the full lifecycle of the just-completed workflow.

**Talking point:** "The dashboard calls `GET /api/admin/dashboard`, which the repository aggregates from live in-memory state. Every workflow action appends an audit event, giving a full traceability trail."

---

## OOP Design Talking Points

| OOP Concept | Where It Appears in the Code |
|---|---|
| **Controllers receive HTTP requests** | `apps/api/src/interfaces/http/pawn.controllers.ts` — thin layer; delegates immediately to service |
| **DTOs define validated inputs** | `apps/api/src/application/dto/pawn.dto.ts` — `class-validator` decorators enforce types, ranges, and required fields |
| **Services enforce workflow rules** | `PawnWorkflowService` — all domain logic (status guards, ownership checks, duplicate listing prevention) lives here |
| **Repositories encapsulate persistence** | `PawnRepository` interface + `InMemoryPawnRepository` implementation — swappable without touching services |
| **Adapter interfaces model external dependencies** | `KycProvider`, `LogisticsProvider`, `StorageAdapter`, `BlockchainGateway` — typed ports in `src/application/ports/` |
| **Mock adapters demonstrate polymorphism and replaceability** | `MockKycProvider`, `MockLogisticsProvider`, `MockStorageAdapter`, `MockBlockchainGateway` — each implements the same interface; swapping in a real implementation requires zero service changes |

---

## Quick Reference — API Endpoints Demonstrated

| Step | Endpoint |
|---|---|
| Auto-login | `POST /api/auth/demo-login` |
| Submit asset | `POST /api/assets` |
| Upload evidence | `POST /api/evidence` |
| Create shipment | `POST /api/shipments` |
| Submit appraisal + loan offer | `POST /api/appraisals`, `POST /api/loans` |
| Accept loan | `POST /api/loans/:id/accept` |
| Repay loan | `POST /api/repayments` |
| List asset | `POST /api/marketplace/listings` |
| Layaway purchase | `POST /api/layaways` |
| Admin dashboard | `GET /api/admin/dashboard` |
| Marketplace listings | `GET /api/marketplace` |
