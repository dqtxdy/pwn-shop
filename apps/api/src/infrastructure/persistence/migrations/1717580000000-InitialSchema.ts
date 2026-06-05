import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * InitialSchema Migration Skeleton
 * 
 * To populate this automatically based on TypeORM entities, run:
 * npx typeorm-ts-node-commonjs migration:generate -d src/infrastructure/persistence/data-source.ts src/infrastructure/persistence/migrations/InitialSchema
 */
export class InitialSchema1717580000000 implements MigrationInterface {
  name = 'InitialSchema1717580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Generate commands using the TypeORM CLI to populate the actual SQL setup queries.
    // Example:
    // await queryRunner.query(`CREATE TABLE "users" ("id" character varying NOT NULL, ... CONSTRAINT "PK_a3c16f4cbfb6" PRIMARY KEY ("id"))`);
    console.log('[MIGRATION] Skeleton Up: InitialSchema migration loaded.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert query runner commands.
    // Example:
    // await queryRunner.query(`DROP TABLE "users"`);
    console.log('[MIGRATION] Skeleton Down: InitialSchema migration reverted.');
  }
}
