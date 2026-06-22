import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration on top of InitialSchema1717580000000.
 *
 * This migration MUST NOT be squashed with the initial schema because the
 * initial schema may already be applied on existing databases.
 *
 * What this migration does:
 *   1. Convert all monetary / value columns from double precision → NUMERIC(20,2).
 *   2. Add FK constraints between all child → parent tables.
 *   3. Add CHECK constraints enforcing non-negative monetary values and BPS ranges.
 *   4. Add partial unique indexes for business-rule invariants (one active loan
 *      per asset, one active listing per asset, etc.).
 *   5. Seed the "system" service-account row so FK columns that reference
 *      "system" never violate the users FK.
 */
export class StrictSqlPersistence1717580000001 implements MigrationInterface {
  name = 'StrictSqlPersistence1717580000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------ //
    // 0. Seed system service-account user (idempotent)                   //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`
      INSERT INTO "users" ("id", "displayName", "role", "kycStatus", "createdAt")
      VALUES ('system', 'System Account', 'ADMIN', 'VERIFIED', NOW())
      ON CONFLICT ("id") DO UPDATE
      SET
        "displayName" = EXCLUDED."displayName",
        "role" = EXCLUDED."role",
        "kycStatus" = EXCLUDED."kycStatus"
    `);

    // ------------------------------------------------------------------ //
    // 1. Convert monetary / value columns to NUMERIC(20,2)               //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`ALTER TABLE "assets" ALTER COLUMN "declaredValue" TYPE NUMERIC(20,2) USING "declaredValue"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "appraisals" ALTER COLUMN "estimatedValue" TYPE NUMERIC(20,2) USING "estimatedValue"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "principal" TYPE NUMERIC(20,2) USING "principal"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "repayments" ALTER COLUMN "amount" TYPE NUMERIC(20,2) USING "amount"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "price" TYPE NUMERIC(20,2) USING "price"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "totalPrice" TYPE NUMERIC(20,2) USING "totalPrice"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "amountPaid" TYPE NUMERIC(20,2) USING "amountPaid"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "installmentAmount" TYPE NUMERIC(20,2) USING "installmentAmount"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "downPayment" TYPE NUMERIC(20,2) USING "downPayment"::NUMERIC(20,2)`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" ALTER COLUMN "pricePerShare" TYPE NUMERIC(20,2) USING "pricePerShare"::NUMERIC(20,2)`);

    // ------------------------------------------------------------------ //
    // 2. Foreign-key constraints                                          //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`ALTER TABLE "wallets" ADD CONSTRAINT "FK_wallets_userId_users" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "kyc_verifications" ADD CONSTRAINT "FK_kyc_verifications_userId_users" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "FK_assets_ownerId_users" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "evidence_files" ADD CONSTRAINT "FK_evidence_files_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "evidence_files" ADD CONSTRAINT "FK_evidence_files_uploadedBy_users" FOREIGN KEY ("uploadedBy") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "shipments" ADD CONSTRAINT "FK_shipments_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "appraisals" ADD CONSTRAINT "FK_appraisals_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "appraisals" ADD CONSTRAINT "FK_appraisals_appraiserId_users" FOREIGN KEY ("appraiserId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_loans_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_loans_borrowerId_users" FOREIGN KEY ("borrowerId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "repayments" ADD CONSTRAINT "FK_repayments_loanId_loans" FOREIGN KEY ("loanId") REFERENCES "loans" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "listings" ADD CONSTRAINT "FK_listings_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "listings" ADD CONSTRAINT "FK_listings_sellerId_users" FOREIGN KEY ("sellerId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "FK_layaways_listingId_listings" FOREIGN KEY ("listingId") REFERENCES "listings" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "FK_layaways_buyerId_users" FOREIGN KEY ("buyerId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" ADD CONSTRAINT "FK_fractional_assets_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" ADD CONSTRAINT "FK_fractional_assets_originalOwner_users" FOREIGN KEY ("originalOwner") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" ADD CONSTRAINT "FK_fractional_positions_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" ADD CONSTRAINT "FK_fractional_positions_holderId_users" FOREIGN KEY ("holderId") REFERENCES "users" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_disputes_assetId_assets" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_disputes_openedBy_users" FOREIGN KEY ("openedBy") REFERENCES "users" ("id") ON DELETE CASCADE`);

    // ------------------------------------------------------------------ //
    // 3. CHECK constraints                                                //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`ALTER TABLE "assets" ADD CONSTRAINT "CHK_asset_declaredValue_positive" CHECK ("declaredValue" >= 0)`);
    await queryRunner.query(`ALTER TABLE "appraisals" ADD CONSTRAINT "CHK_appraisal_estimatedValue_positive" CHECK ("estimatedValue" >= 0)`);
    await queryRunner.query(`ALTER TABLE "appraisals" ADD CONSTRAINT "CHK_appraisal_ltvBps_valid" CHECK ("ltvBps" >= 0 AND "ltvBps" <= 10000)`);
    await queryRunner.query(`ALTER TABLE "appraisals" ADD CONSTRAINT "CHK_appraisal_interestAprBps_valid" CHECK ("interestAprBps" >= 0 AND "interestAprBps" <= 10000)`);
    await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "CHK_loan_principal_positive" CHECK ("principal" >= 0)`);
    await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "CHK_loan_aprBps_positive" CHECK ("aprBps" >= 0)`);
    await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "CHK_loan_durationDays_positive" CHECK ("durationDays" > 0)`);
    await queryRunner.query(`ALTER TABLE "repayments" ADD CONSTRAINT "CHK_repayment_amount_positive" CHECK ("amount" >= 0)`);
    await queryRunner.query(`ALTER TABLE "listings" ADD CONSTRAINT "CHK_listing_price_positive" CHECK ("price" >= 0)`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "CHK_layaway_totalPrice_positive" CHECK ("totalPrice" >= 0)`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "CHK_layaway_amountPaid_positive" CHECK ("amountPaid" >= 0)`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "CHK_layaway_amountPaid_lte_totalPrice" CHECK ("amountPaid" <= "totalPrice")`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "CHK_layaway_installmentAmount_positive" CHECK ("installmentAmount" IS NULL OR "installmentAmount" >= 0)`);
    await queryRunner.query(`ALTER TABLE "layaways" ADD CONSTRAINT "CHK_layaway_downPayment_positive" CHECK ("downPayment" IS NULL OR "downPayment" >= 0)`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" ADD CONSTRAINT "CHK_fractional_asset_totalShares_positive" CHECK ("totalShares" > 0)`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" ADD CONSTRAINT "CHK_fractional_asset_availableShares_range" CHECK ("availableShares" >= 0 AND "availableShares" <= "totalShares")`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" ADD CONSTRAINT "CHK_fractional_asset_pricePerShare_positive" CHECK ("pricePerShare" >= 0)`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" ADD CONSTRAINT "CHK_fractional_position_shares_range" CHECK ("shares" >= 0 AND "shares" <= "totalShares")`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" ADD CONSTRAINT "CHK_fractional_position_totalShares_positive" CHECK ("totalShares" > 0)`);

    // ------------------------------------------------------------------ //
    // 4. Partial unique indexes for business-rule invariants              //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_active_offered_loan_per_asset" ON "loans" ("assetId") WHERE "status" IN ('ACTIVE', 'OFFERED')`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_active_reserved_listing_per_asset" ON "listings" ("assetId") WHERE "status" IN ('ACTIVE', 'RESERVED')`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_active_layaway_per_listing" ON "layaways" ("listingId") WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_open_dispute_per_asset" ON "disputes" ("assetId") WHERE "status" = 'OPEN'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------ //
    // 4. Drop partial unique indexes                                      //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_open_dispute_per_asset"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_active_layaway_per_listing"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_active_reserved_listing_per_asset"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_active_offered_loan_per_asset"`);

    // ------------------------------------------------------------------ //
    // 3. Drop CHECK constraints                                           //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`ALTER TABLE "fractional_positions" DROP CONSTRAINT IF EXISTS "CHK_fractional_position_totalShares_positive"`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" DROP CONSTRAINT IF EXISTS "CHK_fractional_position_shares_range"`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" DROP CONSTRAINT IF EXISTS "CHK_fractional_asset_pricePerShare_positive"`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" DROP CONSTRAINT IF EXISTS "CHK_fractional_asset_availableShares_range"`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" DROP CONSTRAINT IF EXISTS "CHK_fractional_asset_totalShares_positive"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "CHK_layaway_downPayment_positive"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "CHK_layaway_installmentAmount_positive"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "CHK_layaway_amountPaid_lte_totalPrice"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "CHK_layaway_amountPaid_positive"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "CHK_layaway_totalPrice_positive"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "CHK_listing_price_positive"`);
    await queryRunner.query(`ALTER TABLE "repayments" DROP CONSTRAINT IF EXISTS "CHK_repayment_amount_positive"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "CHK_loan_durationDays_positive"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "CHK_loan_aprBps_positive"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "CHK_loan_principal_positive"`);
    await queryRunner.query(`ALTER TABLE "appraisals" DROP CONSTRAINT IF EXISTS "CHK_appraisal_interestAprBps_valid"`);
    await queryRunner.query(`ALTER TABLE "appraisals" DROP CONSTRAINT IF EXISTS "CHK_appraisal_ltvBps_valid"`);
    await queryRunner.query(`ALTER TABLE "appraisals" DROP CONSTRAINT IF EXISTS "CHK_appraisal_estimatedValue_positive"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "CHK_asset_declaredValue_positive"`);

    // ------------------------------------------------------------------ //
    // 2. Drop FK constraints                                              //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`ALTER TABLE "disputes" DROP CONSTRAINT IF EXISTS "FK_disputes_openedBy_users"`);
    await queryRunner.query(`ALTER TABLE "disputes" DROP CONSTRAINT IF EXISTS "FK_disputes_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" DROP CONSTRAINT IF EXISTS "FK_fractional_positions_holderId_users"`);
    await queryRunner.query(`ALTER TABLE "fractional_positions" DROP CONSTRAINT IF EXISTS "FK_fractional_positions_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" DROP CONSTRAINT IF EXISTS "FK_fractional_assets_originalOwner_users"`);
    await queryRunner.query(`ALTER TABLE "fractional_assets" DROP CONSTRAINT IF EXISTS "FK_fractional_assets_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "FK_layaways_buyerId_users"`);
    await queryRunner.query(`ALTER TABLE "layaways" DROP CONSTRAINT IF EXISTS "FK_layaways_listingId_listings"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "FK_listings_sellerId_users"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "FK_listings_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "repayments" DROP CONSTRAINT IF EXISTS "FK_repayments_loanId_loans"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "FK_loans_borrowerId_users"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "FK_loans_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "appraisals" DROP CONSTRAINT IF EXISTS "FK_appraisals_appraiserId_users"`);
    await queryRunner.query(`ALTER TABLE "appraisals" DROP CONSTRAINT IF EXISTS "FK_appraisals_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "shipments" DROP CONSTRAINT IF EXISTS "FK_shipments_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "evidence_files" DROP CONSTRAINT IF EXISTS "FK_evidence_files_uploadedBy_users"`);
    await queryRunner.query(`ALTER TABLE "evidence_files" DROP CONSTRAINT IF EXISTS "FK_evidence_files_assetId_assets"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "FK_assets_ownerId_users"`);
    await queryRunner.query(`ALTER TABLE "kyc_verifications" DROP CONSTRAINT IF EXISTS "FK_kyc_verifications_userId_users"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_userId_users"`);

    // ------------------------------------------------------------------ //
    // 1. Revert monetary columns back to double precision                 //
    // ------------------------------------------------------------------ //
    await queryRunner.query(`ALTER TABLE "fractional_assets" ALTER COLUMN "pricePerShare" TYPE double precision USING "pricePerShare"::double precision`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "downPayment" TYPE double precision USING "downPayment"::double precision`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "installmentAmount" TYPE double precision USING "installmentAmount"::double precision`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "amountPaid" TYPE double precision USING "amountPaid"::double precision`);
    await queryRunner.query(`ALTER TABLE "layaways" ALTER COLUMN "totalPrice" TYPE double precision USING "totalPrice"::double precision`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "price" TYPE double precision USING "price"::double precision`);
    await queryRunner.query(`ALTER TABLE "repayments" ALTER COLUMN "amount" TYPE double precision USING "amount"::double precision`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "principal" TYPE double precision USING "principal"::double precision`);
    await queryRunner.query(`ALTER TABLE "appraisals" ALTER COLUMN "estimatedValue" TYPE double precision USING "estimatedValue"::double precision`);
    await queryRunner.query(`ALTER TABLE "assets" ALTER COLUMN "declaredValue" TYPE double precision USING "declaredValue"::double precision`);

    // ------------------------------------------------------------------ //
    // 0. Keep system user on rollback                                     //
    // ------------------------------------------------------------------ //
    // The system account may predate this migration or already be referenced
    // by persisted audit / workflow rows, so rollback must not delete it.
  }
}
