# Security Policy

## Scope

This repository is a production-like capstone system. It demonstrates secure design patterns, local blockchain settlement, role-based access control, and adapter-driven integrations. It is not approved for real-money production use without external legal review, KYC provider contracts, infrastructure hardening, and independent security audit.

## Supported Demo Modes

| Mode | Intended Use | Security Boundary |
| --- | --- | --- |
| Mock mode | Fast local demo and browser E2E tests | No real chain, no real external providers. |
| Anvil mode | Local wallet-signed blockchain demo | Local-only chain with public development keys. |
| PostgreSQL mode | Persistence validation | Local container database; not internet-exposed. |
| Filesystem storage mode | Local evidence persistence | Stores evidence bytes outside the database on the developer machine. |

## Secret Handling

- Never commit real private keys, JWT secrets, provider credentials, database passwords, or object-storage credentials.
- The Anvil private keys in the README are public development keys and must never be used outside a local test chain.
- `JWT_SECRET=capstone-dev-secret` is permitted only for local demos and tests.
- In production mode, the API refuses to start with the default JWT secret.
- Use `.env` files locally; commit only `.env.example` templates.

## Local Security Checks

Run:

```bash
npm run check:readiness
npm --workspace apps/api run typecheck
npm --workspace apps/api test
npm --workspace apps/web run build
npm --workspace apps/web test
npm --workspace apps/web run test:e2e
```

For smart contracts:

```bash
cd PawnShop-SmartContract
forge build
forge test
```

Optional free checks when installed:

```bash
npm audit --omit=dev
slither PawnShop-SmartContract/src
semgrep scan
gitleaks detect --source .
```

## Reporting Issues

For this capstone repository, report security issues to the project team privately. Include:

- affected route, contract, or workflow
- reproduction steps
- expected vs actual result
- whether the issue affects mock mode, Anvil mode, PostgreSQL mode, or all modes

## External References

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Smart Contract Top 10: https://scs.owasp.org/sctop10/
- NIST Digital Identity Guidelines: https://pages.nist.gov/800-63-3/
