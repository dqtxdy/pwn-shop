# Compliance Playbook

This playbook documents the low-cost compliance controls used by the capstone demo. It is not legal advice and does not approve the system for real-money production use. It gives the team a clear operating model for KYC, asset evidence, disputes, and data handling.

## Demo Compliance Boundary

| Area | Demo Control | Production Replacement |
| --- | --- | --- |
| Identity and KYC | `MockKycProvider` with configurable verified, pending, and rejected wallet outcomes | Contracted KYC/KYB provider, sanctions screening, and manual review workflow |
| Asset ownership | Customer declares ownership during submission; staff validates evidence and custody state | Formal ownership declaration, receipts, serial number capture, stolen-goods screening, and legal acceptance terms |
| Evidence storage | Mock object URI or local filesystem adapter with SHA-256 content hash | S3-compatible object storage with encryption, lifecycle policies, access logs, and retention controls |
| Blockchain settlement | Local Anvil chain with wallet-matched demo accounts | Testnet/mainnet deployment plan, audited contracts, monitored RPC, and custody controls |
| Disputes | Domain model and audit events | Formal dispute SLA, evidence export, legal review, and customer notification policy |
| Privacy | Local-only demo data | Privacy notice, consent capture, data minimization, export/delete process, and breach response procedure |

## KYC Sandbox Policy

The demo supports deterministic KYC outcomes without external cost:

- `KYC_REVIEW_WALLETS`: comma-separated wallet addresses returned as pending review.
- `KYC_REJECTED_WALLETS`: comma-separated wallet addresses returned as rejected.
- All other wallets return verified in sandbox mode.

This lets the team demonstrate accepted, manual-review, and rejected onboarding states without creating fake production claims.

## Physical Asset Intake Policy

For each pawn request, the user should provide:

- asset title and category
- declared value and requested loan amount
- condition notes such as serial number, receipt, visible damage, and accessories
- pre-shipment photos or video evidence

Staff validation should confirm:

- package receipt and unboxing record
- visible condition matches the submitted description
- appraisal value and LTV are reasonable
- custody status is recorded before loan settlement, marketplace listing, or fractionalization

## Evidence Retention Policy

| Evidence Type | Demo Storage | Recommended Retention Rule |
| --- | --- | --- |
| Pre-shipment photos/videos | Mock object or local filesystem | Keep until loan, layaway, or dispute window closes |
| Staff unboxing media | Mock object or local filesystem | Keep through full custody period |
| Appraisal documents | Database metadata plus evidence hash | Keep with the asset record |
| Blockchain transaction hashes | Database metadata and chain receipt | Keep permanently as audit trail |

Large files must stay off-chain. Smart contracts should store ownership and transaction state, while the backend stores evidence URIs and content hashes.

## Dispute Handling

Minimum workflow:

1. Open a dispute linked to asset, loan/listing/layaway, and customer.
2. Freeze risky actions if the asset is under active dispute.
3. Export all evidence hashes, upload timestamps, staff notes, and blockchain transaction hashes.
4. Record the resolution as an audit event.
5. Notify affected users through the notification adapter.

## Low-Cost Readiness Checks

Run before demos:

```bash
npm run check:readiness
npm --workspace apps/api run typecheck
npm --workspace apps/api test
npm --workspace apps/web run build
npm --workspace apps/web test
```

Optional free checks:

```bash
npm audit --omit=dev
slither PawnShop-SmartContract/src
semgrep scan
gitleaks detect --source .
```

## References

- NIST Digital Identity Guidelines: https://pages.nist.gov/800-63-3/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
