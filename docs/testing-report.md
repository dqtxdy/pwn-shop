# Testing Report — PawnShop Protocol Capstone

## Validation Commands (Run in Order)

```bash
# 1. TypeScript type-check the NestJS backend (zero errors expected)
npm --workspace apps/api run typecheck

# 2. NestJS backend unit tests
npm --workspace apps/api test

# 3. Vite frontend production build (zero errors expected)
npm --workspace apps/web run build

# 4. React + Vitest frontend unit tests
npm --workspace apps/web test

# 5. Playwright end-to-end browser tests
npm --workspace apps/web run test:e2e
```

---

## What Each Test Layer Covers

### Layer 1 — Backend Unit Tests (`apps/api test`)

File location: `apps/api/test/`

| Test File | What It Covers |
|---|---|
| `pawn-workflow.service.spec.ts` | All domain workflow rules: asset creation, evidence upload, shipment, appraisal, loan offer, loan acceptance, repayment, listing creation validation (ownership, status, duplicate guard), and protocol-listing guard |
| `auth.service.spec.ts` | `AuthService.demoLogin` correctness: returns right role, display name, mock JWT token, and seeded wallet address for all three roles (`CUSTOMER`, `STAFF`, `ADMIN`) |
| `demo.controller.spec.ts` | `DemoController` endpoint: production mode protection and E2E database reset/state restoration verification |

**Result:** 14 passed, 14 total (3 suites)

### Layer 2 — Frontend Unit Tests (`apps/web test`)

File location: `apps/web/src/App.test.tsx`

| Test | What It Covers |
|---|---|
| App renders with demo customer session by default | Confirms auto-login, session display in topbar |
| Submit loan request form calls POST /api/assets | Confirms fetch is called with correct payload shape |
| Customer listing uses session userId (not hardcoded literal) | Proves dynamic session wiring; no hardcoded `customer-1` |
| Switching to Validator role shows Role Mismatch alert | Confirms role-aware UI rendering |
| Switching to Admin role shows Admin metrics panel | Confirms tab navigation and Admin role rendering |

**Result:** 5 passed, 5 total (1 suite)

### Layer 3 — Playwright Workflow Tests (desktop only)

File location: `apps/web/e2e/workflow.spec.ts`

> **Why desktop-only?** The Playwright config runs workflow tests under a single `desktop-workflow` project with `workers: 1`. This prevents cross-project state contamination: the NestJS backend uses a shared in-memory repository. If parallel Playwright projects ran stateful mutations concurrently (e.g., tablet and mobile projects also submitting loan requests), test isolation would be violated and seeded data could be unpredictably mutated mid-test.

| Load dashboard data as Demo Customer | Confirms API seeding, session auto-login, asset table population |
| Submit a loan request | End-to-end form submission → new asset appears in table |
| List a returned/received asset for sale | Full modal flow: open → fill price → publish → row shows `LISTED` status |
| Role switching & workspace visibility | Switch session roles between Customer, Validator (Staff), and Admin to verify side-nav permissions, role alerts, and page components |
| Masthead search behavior | Enter key triggers search; match navigates to asset; no match keeps active view and displays warning Flashbar |

**Result:** 5 passed (desktop-workflow project)

> **E2E coverage note:** Workflow tests cover dashboard load, loan request submission, customer asset listing, role switching / workspace visibility, and masthead search behavior. The **staff appraisal flow** (unboxing proof upload + appraisal form + loan offer creation) is exercised by the Validator Dashboard UI and backend unit tests but is **not currently covered by Playwright workflow tests**.

### Layer 4 — Playwright Responsive Tests (all viewports)

File location: `apps/web/e2e/responsive.spec.ts`

> These tests are **read-only** (no state mutations) and run across three viewport projects: desktop (1440 × 900), tablet (768 × 1024), and mobile (390 × 844).

| Test | What It Covers |
|---|---|
| Topbar and session selector are visible | UI chrome renders correctly at every viewport |
| Tab navigation is usable | Customer Portal and Admin Panel tabs are accessible |
| Table fits within viewport width | Tables use horizontal scroll; no overflow breaking layout |
| Primary controls are visible and not clipped | Submit Request button is visible and enabled at all widths |
| take screenshots | Captures page layout screenshots at multiple viewports and attaches to test report |

**Result:** 15 passed (5 tests × 3 viewport projects)

### Combined E2E Result

`5 (workflow) + 15 (responsive) = 20 passed`

---

## Known Warnings & Risks

| Warning / Risk | Details | Severity |
|---|---|---|
| React 19 + Ant Design v5 compatibility | Ant Design v5 officially supports React 16–18. Using React 19 triggers a browser console warning: `[antd: compatible] antd v5 support React is 16 ~ 18`. The app functions correctly; no dependency versions were changed per capstone instructions. See https://u.ant.design/v5-for-19 | Low — cosmetic warning only |
| In-memory persistence resets on API restart | All data (assets, loans, appraisals, audit events) is stored in the `InMemoryPawnRepository`. Restarting the NestJS API server resets state to seeded defaults. This is expected behavior for the demo/capstone prototype. | Low — expected for demo |
| Mock auth adapter | `POST /api/auth/demo-login` issues a signed mock JWT but the API controllers do not validate it via guards. Role enforcement is UI-side only. | Low — documented transition path to production RBAC |
| Mock KYC adapter | `MockKycProvider` always returns `verified: true`. No real KYC API is called. | Low — adapter boundary exists for production swap |
| Mock logistics adapter | `MockLogisticsProvider` returns a hardcoded tracking code. No real courier API is called. | Low — adapter boundary exists for production swap |
| Mock storage adapter | Evidence files are base64-encoded and stored in memory with a placeholder IPFS URI. No actual IPFS/Filecoin upload occurs. | Low — adapter boundary exists for production swap |
| Mock blockchain adapter | `MockBlockchainGateway` returns hardcoded transaction hashes. No EVM node is contacted during unit or E2E tests. | Low — adapter boundary exists for production swap |
