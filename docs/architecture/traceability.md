# SRS Traceability Matrix

## Smart Contract Requirements

| SRS Requirement | Implementation Target | Current Status |
| --- | --- | --- |
| REQ-4.1-1 Appraisal authorization | `PawnAppraisal.onlyOracle`, NestJS staff/admin appraisal endpoints | Implemented in contract, API scaffolded |
| REQ-4.1-2 Certificate invalidation | `revokeAppraisal`, `returnAsset`, `rescueAsset` | Implemented in contract |
| REQ-4.1-3 Stale price protection | `maxAppraisalAge`, `createPawnLoan` guard | Implemented in contract |
| REQ-4.2-1 Asset custody restriction | ERC-721 owner/approval checks, realistic mock | Implemented in contract tests |
| REQ-4.2-2 LTV enforcement | `maxLtvBps`, appraisal LTV validation, loan max check | Implemented in contract |
| REQ-4.2-3 Real-time interest | `quotePawnRepayment` elapsed-time APR | Implemented in contract |
| REQ-4.2-4 Reentrancy prevention | `nonReentrant` on token-transfer workflows | Implemented in contract |
| REQ-4.3-1 Minimum layaway escrow | `minLayawayDepositBps` default 20% | Implemented in contract |
| REQ-4.3-2 Defaulted layaway resolution | `forfeitLayaway` and relisting test | Implemented in contract |
| REQ-4.4-1 Order cancellation | `cancelListing`, `cancelFractionListing` | Implemented in contract |
| REQ-4.4-2 Fee routing | `protocolFees`, consignment-only fees | Implemented in contract |
| REQ-4.4-3 Fractional trading | `createFractionListing`, `buyFractionListing` | Implemented in contract |
| REQ-4.5-1 ID synchronization | Fraction token id equals `assetId` | Implemented in contract |
| REQ-4.5-2 Re-assembly safety | `redeemAsset` requires full share balance | Implemented in contract |
| REQ-4.6-1 Fee ceiling | `updatePlatformFee <= 2000` | Implemented in contract |
| REQ-4.6-2 Role segregation | `setRoles` only admin + zero-address checks | Implemented in contract |
| REQ-4.6-3 Emergency evacuation | `rescueAsset` blocks active loans/listings/layaways/fractions | Implemented in contract |
| REQ-4.6-4 Treasury withdrawal | `withdrawFees` limited to accrued protocol fees | Implemented in contract |
| §6.1 Repayment & return flow | API repayment endpoint, contract `repayPawn`, `returnAsset` | Scaffolded API, implemented contract |
| §6.2 Dispute evidence management | Evidence model, storage adapter, dispute endpoints | Scaffolded API and UI |
| KYC/AML onboarding | Wallet auth + KYC provider port | Scaffolded with mock adapter |
| Logistics tracking | Shipment domain model + logistics provider port | Scaffolded with mock adapter |
| WCAG AA UI direction | Ant Design component system, responsive layout | Scaffolded; needs automated axe checks |

---

## Backend / Frontend / Testing Traceability

| Requirement | Backend Evidence | Frontend Evidence | Test Evidence |
|---|---|---|---|
| **Immediate crypto loan using physical collateral** | `PawnWorkflowService.createAsset` + `createLoanOffer` + `acceptLoan` enforce status transitions; `BlockchainGateway.prepareLoanDisbursement` fires on acceptance | Customer Portal: Submit Request form → Ship Courier → Accept Loan button flow | `pawn-workflow.service.spec.ts`: asset creation, loan offer, and acceptance tests; `workflow.spec.ts`: end-to-end loan submission test |
| **Staff appraisal after receiving / verifying item** | `PawnWorkflowService.createAppraisal` validates asset is in `RECEIVED` status; `uploadEvidence` transitions to `EVIDENCE_SUBMITTED` or `RECEIVED` | Validator Dashboard: Validation Queue shows `IN_TRANSIT` assets; Upload Unboxing Proof button + Appraisal Form with auto-populated Asset ID | `pawn-workflow.service.spec.ts`: appraisal and evidence upload tests; E2E: not currently covered by Playwright workflow tests |
| **Customer accepts appraisal and receives loan** | `acceptLoan` checks `PENDING_ACCEPTANCE` status; calls `BlockchainGateway`, sets `LOAN_ACTIVE` | Customer Portal: Accept Loan action button visible only when loan offer is present | `pawn-workflow.service.spec.ts`: acceptLoan test; `App.test.tsx`: session-aware handler tests |
| **Declined appraisal return / COD logistics path** | `createShipment` supports return shipments; `LogisticsProvider` port abstracts courier; activity diagram in `docs/architecture/README.md` | Customer Portal: Shipment creation flow; Admin Panel audit log shows return events | `pawn-workflow.service.spec.ts`: shipment creation test |
| **Marketplace / listing / layaway demo support** | `createListing` enforces status (`RECEIVED`/`RETURNED`), ownership, duplicate guard, and protocol listing rules; `createLayaway` enforces 20% min deposit | Marketplace tab: live listings from `GET /api/marketplace`; Buy with Layaway button calls `POST /api/layaways` | `pawn-workflow.service.spec.ts`: listing validation tests covering all guard paths; `workflow.spec.ts`: List For Sale end-to-end test |
| **Evidence / dispute / audit support** | `uploadEvidence` stores base64 via `StorageAdapter`; audit events appended on every workflow action and returned by `getDashboard` | Admin Panel: Audit Events table shows live `auditEvents` array from dashboard API | `pawn-workflow.service.spec.ts`: evidence upload test; audit events verified in service tests |
| **OOP / backend architecture evidence** | Controllers (`pawn.controllers.ts`) are thin HTTP delegates; DTOs (`pawn.dto.ts`) use `class-validator`; `PawnWorkflowService` owns all domain logic; `PawnRepository`, `KycProvider`, `LogisticsProvider`, `StorageAdapter`, `BlockchainGateway` are typed interfaces; mock adapters implement each interface | `App.tsx` calls typed API client helpers in `api.ts`; session state flows through React props without raw IDs leaking into components | `auth.service.spec.ts`: verifies auth service encapsulation; `pawn-workflow.service.spec.ts`: repository injected via `PAWN_REPOSITORY` DI token, not via unsafe cast |
| **QA / testing evidence** | 14 backend unit tests across 3 suites pass with `npm --workspace apps/api test`; TypeScript compilation clean with `npm --workspace apps/api run typecheck` | 5 frontend unit tests pass with `npm --workspace apps/web test`; production Vite build clean with `npm --workspace apps/web run build` | 20 Playwright tests pass with `npm --workspace apps/web run test:e2e` (5 workflow + 15 responsive across 3 viewports); see `docs/testing-report.md` for full breakdown |

---

## Verification Notes

- Foundry is required for full Solidity verification but is not installed in this environment.
- The backend uses an in-memory repository for demo startup and TypeORM entities as the PostgreSQL production target.
- External integrations are adapter-based mocks until real KYC/logistics/storage/RPC credentials are available.
- Full validation commands and known warnings are documented in `docs/testing-report.md`.
