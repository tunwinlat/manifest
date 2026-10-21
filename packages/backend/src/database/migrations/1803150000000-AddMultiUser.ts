import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fork: multi-user support.
 *
 * - `user_roles` holds the administrator flag. Better Auth owns the `user`
 *   table and builds it outside TypeORM, so the role lives in its own table
 *   without a foreign key; deleting a user removes its row in the same
 *   transaction (`AdminUsersService.removeUser`).
 * - `instance_settings` is a singleton for install-wide switches the
 *   administrator controls. Public sign-up starts closed: on a shared install
 *   an open sign-up page would hand anyone the subscriptions people share.
 * - `tenant_providers.is_shared` lets a subscription's owner offer it to the
 *   other users of the install for their harness routing.
 */
export class AddMultiUser1803150000000 implements MigrationInterface {
  name = 'AddMultiUser1803150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" varchar PRIMARY KEY,
        "role" varchar NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "updated_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "instance_settings" (
        "id" varchar PRIMARY KEY,
        "public_signup" boolean NOT NULL DEFAULT false,
        "updated_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "tenant_providers" ADD COLUMN "is_shared" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_providers_shared" ON "tenant_providers" ("tenant_id") WHERE "is_shared"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_providers_shared"`);
    await queryRunner.query(`ALTER TABLE "tenant_providers" DROP COLUMN "is_shared"`);
    await queryRunner.query(`DROP TABLE "instance_settings"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
  }
}
