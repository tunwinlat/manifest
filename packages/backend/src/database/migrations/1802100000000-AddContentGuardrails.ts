import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentGuardrails1802100000000 implements MigrationInterface {
  name = 'AddContentGuardrails1802100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "agents" ADD COLUMN "content_guardrails" jsonb');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "agents" DROP COLUMN "content_guardrails"');
  }
}
