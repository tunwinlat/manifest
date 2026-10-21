import { AddMultiUser1803150000000 } from './1803150000000-AddMultiUser';

describe('AddMultiUser1803150000000', () => {
  const migration = new AddMultiUser1803150000000();
  let queries: string[];
  const queryRunner = {
    query: jest.fn().mockImplementation((sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      return Promise.resolve([]);
    }),
  } as never;

  beforeEach(() => {
    queries = [];
  });

  it('exposes the expected migration name', () => {
    expect(migration.name).toBe('AddMultiUser1803150000000');
  });

  it('creates the role and settings tables and the share flag', async () => {
    await migration.up(queryRunner);
    expect(queries[0]).toContain('CREATE TABLE "user_roles"');
    expect(queries[1]).toContain('CREATE TABLE "instance_settings"');
    expect(queries[1]).toContain('"public_signup" boolean NOT NULL DEFAULT false');
    expect(queries[2]).toContain(
      'ALTER TABLE "tenant_providers" ADD COLUMN "is_shared" boolean NOT NULL DEFAULT false',
    );
    expect(queries[3]).toContain('WHERE "is_shared"');
  });

  it('drops everything it added on the way down', async () => {
    await migration.down(queryRunner);
    expect(queries).toEqual([
      'DROP INDEX IF EXISTS "IDX_tenant_providers_shared"',
      'ALTER TABLE "tenant_providers" DROP COLUMN "is_shared"',
      'DROP TABLE "instance_settings"',
      'DROP TABLE "user_roles"',
    ]);
  });
});
