# Security Self-Assessment

This document maps the project to practical security checks that can be defended in a capstone review. It is intentionally strict: items are marked as implemented only when the repository has concrete code, tests, or documentation evidence.

## Application Security

| Control | Status | Evidence |
| --- | --- | --- |
| JWT authentication | Implemented | `apps/api/src/auth/jwt-auth.guard.ts`, `apps/api/test/auth.guard.spec.ts` |
| Role-based authorization | Implemented | `apps/api/src/auth/roles.guard.ts`, controller role tests |
| Customer data isolation | Implemented | asset/listing/evidence guard tests in `apps/api/test/auth.guard.spec.ts` |
| Spoofed actor fields ignored | Implemented | backend derives actors from `CurrentUser`; frontend no longer sends trusted actor IDs |
| Production default JWT secret block | Implemented | `resolveJwtSecret()` in `apps/api/src/app.module.ts` |
| External provider isolation | Implemented | KYC, logistics, storage, blockchain, notification, and oracle adapter ports |
| Evidence stored off database | Implemented for local demo | `FileSystemStorageProvider` and `STORAGE_MODE=filesystem` |
| PostgreSQL persistence | Implemented | TypeORM repository and repository contract tests |
| Database migrations | Foundation implemented | migration skeleton and static data source are present; production migrations must replace `synchronize` |
| Rate limiting | Not implemented | Recommended before internet exposure |
| Real secret manager | Not implemented | Use a managed secret store before production |

## Smart Contract Security

| Control | Status | Evidence |
| --- | --- | --- |
| Foundry build and tests | Implemented | `PawnShop-SmartContract/test` |
| Local deployment script | Implemented | `scripts/deploy-local-anvil.mjs` and contract deploy script |
| Receipt/event verification | Implemented | `AnvilBlockchainGateway` verifies expected protocol logs |
| Loan, repayment, layaway, and fractionalization smoke tests | Implemented | `apps/api/test/anvil-smoke.spec.ts` |
| Timestamp assumptions documented | Implemented | `docs/contract-time-assumptions.md` |
| External audit | Not performed | Required before real-money deployment |
| Mainnet key management | Not implemented | Local Anvil keys only |

## OWASP-Oriented Review

| Risk Area | Current Mitigation | Remaining Work |
| --- | --- | --- |
| Broken access control | JWT and role guards; customer isolation tests | Add rate limiting and production monitoring |
| Cryptographic failures | Local JWT secret guard; wallet matching in frontend and backend receipts | Use secret manager and enforce HTTPS in production |
| Injection | DTO validation and TypeORM repositories | Add centralized input-size policy and security scanning |
| Insecure design | Adapter ports, repository ports, SRS traceability, and workflow tests | Add formal threat model and abuse-case diagrams |
| Security misconfiguration | `.env.example`, `.env.validation.md`, readiness script | Add deployment-specific hardening scripts |
| Vulnerable dependencies | npm/Foundry tests pass | Run `npm audit`, Dependabot/Renovate, and periodic updates |
| Smart contract authorization | KYC, ownership, approvals, and event verification in local flows | Independent audit and testnet monitoring |

## Go-Live Blockers

The following must be solved before real-money production:

- contracted legal/KYC provider
- licensed pawnshop/compliance review for target jurisdiction
- external smart contract security audit
- production wallet/key custody plan
- real object storage with encryption and retention policies
- rate limiting, monitoring, and incident response
- production migrations with `DB_SYNCHRONIZE=false`

## Low-Cost Next Improvements

- Add a threat-model diagram to `docs/architecture`.
- Add API request-size limits and upload MIME-type checks.
- Add dependency scanning to CI.
- Add screenshots to the demo script so graders can follow the intended path.
- Split the largest React file into role-specific page components.
