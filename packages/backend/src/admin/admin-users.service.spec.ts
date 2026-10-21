const mockSignUpEmail = jest.fn();
jest.mock('../auth/auth.instance', () => ({
  auth: { api: { signUpEmail: (...args: unknown[]) => mockSignUpEmail(...args) } },
}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { isProvisioning } from '../auth/signup-gate';
import { AdminUsersService } from './admin-users.service';

type Handler = (sql: string, params?: unknown[]) => unknown;

/** A DataSource stub that answers each query through the first matching rule. */
function makeDataSource(rules: Array<[RegExp, unknown | Handler]>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const answer = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    for (const [pattern, result] of rules) {
      if (pattern.test(sql)) {
        return typeof result === 'function' ? (result as Handler)(sql, params) : result;
      }
    }
    return [];
  };
  const manager = { query: jest.fn(answer) };
  return {
    calls,
    manager,
    query: jest.fn(answer),
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<void>) => fn(manager)),
  };
}

const userRow = {
  id: 'u2',
  name: 'Grace',
  email: 'grace@x.io',
  created_at: '2026-10-01T00:00:00.000Z',
  role: null,
  harness_count: '2',
  subscription_count: '1',
  shared_count: '1',
};

describe('AdminUsersService', () => {
  let tenantCache: { invalidate: jest.Mock };
  let routingCache: { invalidateTenant: jest.Mock };
  let shared: { invalidate: jest.Mock };
  let storage: { delete: jest.Mock };

  const build = (ds: ReturnType<typeof makeDataSource>) =>
    new AdminUsersService(
      ds as never,
      tenantCache as never,
      routingCache as never,
      shared as never,
      storage as never,
    );

  beforeEach(() => {
    mockSignUpEmail.mockReset();
    tenantCache = { invalidate: jest.fn() };
    routingCache = { invalidateTenant: jest.fn() };
    shared = { invalidate: jest.fn() };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
  });

  describe('ensureAdmin / isAdmin', () => {
    it('promotes the earliest user when the install has no administrator', async () => {
      const ds = makeDataSource([
        [/r.role = 'admin' LIMIT 1/, []],
        [/ORDER BY "createdAt" ASC, id ASC LIMIT 1/, [{ id: 'first' }]],
      ]);
      await build(ds).onApplicationBootstrap();
      const insert = ds.calls.find((c) => c.sql.includes('INSERT INTO user_roles'));
      expect(insert?.params).toEqual(['first', 'admin']);
    });

    it('leaves an install that already has an administrator alone', async () => {
      const ds = makeDataSource([[/r.role = 'admin' LIMIT 1/, [{ user_id: 'boss' }]]]);
      await build(ds).ensureAdmin();
      expect(ds.calls.some((c) => c.sql.includes('INSERT INTO user_roles'))).toBe(false);
    });

    it('does nothing on an install without users', async () => {
      const ds = makeDataSource([[/r.role = 'admin' LIMIT 1/, []]]);
      await build(ds).ensureAdmin();
      expect(ds.calls.some((c) => c.sql.includes('INSERT INTO user_roles'))).toBe(false);
    });

    it('swallows bootstrap errors (Better Auth tables not created yet)', async () => {
      const ds = makeDataSource([
        [
          /user_roles/,
          () => {
            throw new Error('relation "user" does not exist');
          },
        ],
      ]);
      await expect(build(ds).onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('answers from the role row', async () => {
      const ds = makeDataSource([[/SELECT role FROM user_roles/, [{ role: 'admin' }]]]);
      await expect(build(ds).isAdmin('boss')).resolves.toBe(true);
    });

    it('treats a user without a row as a regular user once an admin exists', async () => {
      const ds = makeDataSource([
        [/SELECT role FROM user_roles/, []],
        [/r.role = 'admin' LIMIT 1/, [{ user_id: 'boss' }]],
      ]);
      await expect(build(ds).isAdmin('someone')).resolves.toBe(false);
    });
  });

  it('lists users with their role and usage counts', async () => {
    const ds = makeDataSource([[/FROM "user" u/, [{ ...userRow, role: 'admin' }, userRow]]]);
    const users = await build(ds).listUsers();
    expect(users).toEqual([
      expect.objectContaining({ id: 'u2', role: 'admin', harnessCount: 2 }),
      {
        id: 'u2',
        name: 'Grace',
        email: 'grace@x.io',
        createdAt: '2026-10-01T00:00:00.000Z',
        role: 'user',
        harnessCount: 2,
        subscriptionCount: 1,
        sharedSubscriptionCount: 1,
      },
    ]);
  });

  describe('createUser', () => {
    it('provisions a verified account past the closed sign-up gate', async () => {
      let provisioned = false;
      mockSignUpEmail.mockImplementation(async () => {
        provisioned = isProvisioning();
      });
      const ds = makeDataSource([
        [/WHERE LOWER\(email\) = \$1$/, []],
        [/UPDATE "user" SET "emailVerified" = true/, [{ id: 'u2' }]],
        [/FROM "user" u/, [userRow]],
      ]);
      const created = await build(ds).createUser({
        name: ' Grace ',
        email: 'Grace@X.io ',
        password: 'password1',
        role: 'admin',
      });
      expect(provisioned).toBe(true);
      expect(mockSignUpEmail).toHaveBeenCalledWith({
        body: { email: 'grace@x.io', password: 'password1', name: 'Grace' },
      });
      expect(ds.calls.find((c) => c.sql.includes('INSERT INTO user_roles'))?.params).toEqual([
        'u2',
        'admin',
      ]);
      expect(created.id).toBe('u2');
    });

    it('refuses a duplicate email before calling Better Auth', async () => {
      const ds = makeDataSource([[/WHERE LOWER\(email\) = \$1$/, [{ id: 'taken' }]]]);
      await expect(
        build(ds).createUser({ name: 'G', email: 'g@x.io', password: 'password1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockSignUpEmail).not.toHaveBeenCalled();
    });

    it('fails loudly when Better Auth created nothing', async () => {
      const ds = makeDataSource([[/WHERE LOWER\(email\) = \$1$/, []]]);
      await expect(
        build(ds).createUser({ name: 'G', email: 'g@x.io', password: 'password1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('setRole', () => {
    const roleRules = (targetRole: string | null, otherAdmins: unknown[]) =>
      makeDataSource([
        [/SELECT id FROM "user" WHERE id = \$1/, [{ id: 'u2' }]],
        [/SELECT role FROM user_roles/, targetRole ? [{ role: targetRole }] : []],
        [/r.user_id <> \$1/, otherAdmins],
        [/FROM "user" u/, [userRow]],
      ]);

    it('promotes a user', async () => {
      const ds = roleRules(null, []);
      await build(ds).setRole('boss', 'u2', 'admin');
      expect(ds.calls.some((c) => c.sql.includes('INSERT INTO user_roles'))).toBe(true);
    });

    it('demotes an administrator while another remains', async () => {
      const ds = roleRules('admin', [{ user_id: 'boss' }]);
      await build(ds).setRole('boss', 'u2', 'user');
      expect(ds.calls.some((c) => c.sql.startsWith('DELETE FROM user_roles'))).toBe(true);
    });

    it('never demotes the last administrator or the caller', async () => {
      await expect(build(roleRules('admin', [])).setRole('boss', 'u2', 'user')).rejects.toThrow(
        'at least one administrator',
      );
      await expect(
        build(roleRules('admin', [{ user_id: 'x' }])).setRole('u2', 'u2', 'user'),
      ).rejects.toThrow('your own administrator role');
    });

    it('404s for an unknown user', async () => {
      const ds = makeDataSource([[/SELECT id FROM "user" WHERE id = \$1/, []]]);
      await expect(build(ds).setRole('boss', 'nobody', 'admin')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('removeUser', () => {
    it('removes the user, their tenant data, and their recordings', async () => {
      const ds = makeDataSource([
        [/SELECT id FROM "user" WHERE id = \$1/, [{ id: 'u2' }]],
        [/SELECT role FROM user_roles/, []],
        [/SELECT id FROM tenants WHERE owner_user_id/, [{ id: 't2' }]],
        [/SELECT recording_key FROM agent_messages/, [{ recording_key: 'rec/1' }]],
        [
          /information_schema.columns/,
          [
            { table_name: 'tenant_providers' },
            { table_name: 'agents' },
            { table_name: 'requests' },
            { table_name: 'agent_messages' },
            { table_name: 'api_keys' },
          ],
        ],
      ]);
      await build(ds).removeUser('boss', 'u2');
      const deletes = ds.manager.query.mock.calls
        .map(([sql]) => sql as string)
        .filter((sql) => sql.startsWith('DELETE'));
      expect(deletes).toEqual([
        'DELETE FROM "agent_messages" WHERE tenant_id = ANY($1)',
        'DELETE FROM "requests" WHERE tenant_id = ANY($1)',
        'DELETE FROM "api_keys" WHERE tenant_id = ANY($1)',
        'DELETE FROM "tenant_providers" WHERE tenant_id = ANY($1)',
        'DELETE FROM "agents" WHERE tenant_id = ANY($1)',
        'DELETE FROM tenants WHERE id = ANY($1)',
        'DELETE FROM user_roles WHERE user_id = $1',
        'DELETE FROM "user" WHERE id = $1',
      ]);
      expect(tenantCache.invalidate).toHaveBeenCalledWith('u2');
      expect(routingCache.invalidateTenant).toHaveBeenCalledWith('t2');
      expect(shared.invalidate).toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      expect(storage.delete).toHaveBeenCalledWith('rec/1');
    });

    it('removes a user who never created a tenant', async () => {
      const ds = makeDataSource([
        [/SELECT id FROM "user" WHERE id = \$1/, [{ id: 'u2' }]],
        [/SELECT role FROM user_roles/, [{ role: 'admin' }]],
        [/r.user_id <> \$1/, [{ user_id: 'boss' }]],
      ]);
      await build(ds).removeUser('boss', 'u2');
      expect(ds.manager.query.mock.calls.map(([sql]) => sql)).toEqual([
        'DELETE FROM user_roles WHERE user_id = $1',
        'DELETE FROM "user" WHERE id = $1',
      ]);
    });

    it('logs instead of failing when a recording cannot be deleted', async () => {
      storage.delete.mockRejectedValue(new Error('gone'));
      const ds = makeDataSource([
        [/SELECT id FROM "user" WHERE id = \$1/, [{ id: 'u2' }]],
        [/SELECT id FROM tenants WHERE owner_user_id/, [{ id: 't2' }]],
        [/SELECT recording_key FROM agent_messages/, [{ recording_key: 'rec/1' }]],
      ]);
      await expect(build(ds).removeUser('boss', 'u2')).resolves.toBeUndefined();
      await new Promise((r) => setImmediate(r));
      expect(storage.delete).toHaveBeenCalled();
    });

    it('refuses to remove the caller', async () => {
      await expect(build(makeDataSource([])).removeUser('boss', 'boss')).rejects.toThrow(
        'your own account',
      );
    });
  });

  it('reads and writes the public sign-up switch', async () => {
    let stored = false;
    const ds = makeDataSource([
      [
        /INSERT INTO instance_settings/,
        (_sql: string, params?: unknown[]) => {
          stored = params?.[1] as boolean;
          return [];
        },
      ],
      [/SELECT public_signup FROM instance_settings/, () => [{ public_signup: stored }]],
    ]);
    const service = build(ds);
    await expect(service.getSettings()).resolves.toEqual({ publicSignup: false });
    await expect(service.updateSettings({ publicSignup: true })).resolves.toEqual({
      publicSignup: true,
    });
  });
});
