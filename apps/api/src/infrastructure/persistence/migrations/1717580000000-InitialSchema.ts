import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1717580000000 implements MigrationInterface {
  name = 'InitialSchema1717580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" character varying NOT NULL,
        "email" character varying,
        "displayName" character varying NOT NULL,
        "role" character varying NOT NULL,
        "kycStatus" character varying NOT NULL,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" character varying NOT NULL,
        "userId" character varying NOT NULL,
        "address" character varying NOT NULL,
        "chainId" integer NOT NULL,
        "verifiedAt" timestamp with time zone,
        CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "kyc_verifications" (
        "id" character varying NOT NULL,
        "userId" character varying NOT NULL,
        "provider" character varying NOT NULL,
        "status" character varying NOT NULL,
        "reference" character varying NOT NULL,
        "checkedAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_kyc_verifications_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "assets" (
        "id" character varying NOT NULL,
        "ownerId" character varying NOT NULL,
        "tokenId" character varying,
        "title" character varying NOT NULL,
        "category" character varying NOT NULL,
        "description" text NOT NULL,
        "status" character varying NOT NULL,
        "declaredValue" double precision NOT NULL,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_assets_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "evidence_files" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "uploadedBy" character varying NOT NULL,
        "kind" character varying NOT NULL,
        "uri" character varying NOT NULL,
        "contentHash" character varying NOT NULL,
        "capturedAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_evidence_files_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "direction" character varying NOT NULL,
        "carrier" character varying NOT NULL,
        "trackingCode" character varying NOT NULL,
        "status" character varying NOT NULL,
        "codRequired" boolean NOT NULL,
        "updatedAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_shipments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "appraisals" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "appraiserId" character varying NOT NULL,
        "estimatedValue" double precision NOT NULL,
        "ltvBps" integer NOT NULL,
        "interestAprBps" integer NOT NULL,
        "acceptedByCustomer" boolean NOT NULL,
        "evidenceUri" character varying,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_appraisals_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "loans" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "borrowerId" character varying NOT NULL,
        "principal" double precision NOT NULL,
        "aprBps" integer NOT NULL,
        "durationDays" integer NOT NULL,
        "status" character varying NOT NULL,
        "contractTxHash" character varying,
        "dueAt" timestamp with time zone,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_loans_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "repayments" (
        "id" character varying NOT NULL,
        "loanId" character varying NOT NULL,
        "amount" double precision NOT NULL,
        "txHash" character varying NOT NULL,
        "paidAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_repayments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "listings" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "sellerId" character varying NOT NULL,
        "price" double precision NOT NULL,
        "status" character varying NOT NULL,
        "isProtocolOwned" boolean NOT NULL,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_listings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "layaways" (
        "id" character varying NOT NULL,
        "listingId" character varying NOT NULL,
        "buyerId" character varying NOT NULL,
        "totalPrice" double precision NOT NULL,
        "amountPaid" double precision NOT NULL,
        "deadline" timestamp with time zone NOT NULL,
        "status" character varying NOT NULL,
        "monthsDuration" integer,
        "installmentAmount" double precision,
        "downPayment" double precision,
        "paidInstallments" integer,
        "amountPaidWei" character varying,
        "downPaymentWei" character varying,
        "lastPaymentTxHash" character varying,
        "completedTxHash" character varying,
        CONSTRAINT "PK_layaways_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fractional_assets" (
        "assetId" character varying NOT NULL,
        "originalOwner" character varying NOT NULL,
        "totalShares" integer NOT NULL,
        "availableShares" integer NOT NULL,
        "pricePerShare" double precision NOT NULL,
        "status" character varying NOT NULL,
        CONSTRAINT "PK_fractional_assets_assetId" PRIMARY KEY ("assetId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fractional_positions" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "holderId" character varying NOT NULL,
        "shares" integer NOT NULL,
        "totalShares" integer NOT NULL,
        CONSTRAINT "PK_fractional_positions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "disputes" (
        "id" character varying NOT NULL,
        "assetId" character varying NOT NULL,
        "openedBy" character varying NOT NULL,
        "status" character varying NOT NULL,
        "evidenceExportUri" character varying,
        "resolution" text,
        "previousAssetStatus" character varying,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_disputes_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" character varying NOT NULL,
        "actorId" character varying NOT NULL,
        "action" character varying NOT NULL,
        "aggregateType" character varying NOT NULL,
        "aggregateId" character varying NOT NULL,
        "metadata" jsonb NOT NULL,
        "createdAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_audit_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blockchain_transactions" (
        "id" character varying NOT NULL,
        "aggregateType" character varying NOT NULL,
        "aggregateId" character varying NOT NULL,
        "txHash" character varying NOT NULL,
        "eventName" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "confirmedAt" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_blockchain_transactions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_wallets_userId" ON "wallets" ("userId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallets_address" ON "wallets" ("address")`);
    await queryRunner.query(`CREATE INDEX "IDX_assets_ownerId" ON "assets" ("ownerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_assets_status" ON "assets" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_evidence_files_assetId" ON "evidence_files" ("assetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_shipments_assetId" ON "shipments" ("assetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_appraisals_assetId" ON "appraisals" ("assetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_loans_assetId" ON "loans" ("assetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_loans_borrowerId" ON "loans" ("borrowerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_repayments_loanId" ON "repayments" ("loanId")`);
    await queryRunner.query(`CREATE INDEX "IDX_listings_assetId" ON "listings" ("assetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_listings_status" ON "listings" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_layaways_listingId" ON "layaways" ("listingId")`);
    await queryRunner.query(`CREATE INDEX "IDX_layaways_buyerId" ON "layaways" ("buyerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_fractional_positions_assetId" ON "fractional_positions" ("assetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_fractional_positions_holderId" ON "fractional_positions" ("holderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_events_aggregate" ON "audit_events" ("aggregateType", "aggregateId")`);
    await queryRunner.query(`CREATE INDEX "IDX_blockchain_transactions_txHash" ON "blockchain_transactions" ("txHash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blockchain_transactions_txHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_aggregate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fractional_positions_holderId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fractional_positions_assetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_layaways_buyerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_layaways_listingId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_assetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_repayments_loanId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_loans_borrowerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_loans_assetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_appraisals_assetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_assetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_evidence_files_assetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assets_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assets_ownerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallets_address"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallets_userId"`);

    await queryRunner.query(`DROP TABLE "blockchain_transactions"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP TABLE "disputes"`);
    await queryRunner.query(`DROP TABLE "fractional_positions"`);
    await queryRunner.query(`DROP TABLE "fractional_assets"`);
    await queryRunner.query(`DROP TABLE "layaways"`);
    await queryRunner.query(`DROP TABLE "listings"`);
    await queryRunner.query(`DROP TABLE "repayments"`);
    await queryRunner.query(`DROP TABLE "loans"`);
    await queryRunner.query(`DROP TABLE "appraisals"`);
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TABLE "evidence_files"`);
    await queryRunner.query(`DROP TABLE "assets"`);
    await queryRunner.query(`DROP TABLE "kyc_verifications"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
