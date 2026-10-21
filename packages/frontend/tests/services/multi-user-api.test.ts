import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/toast-store.js', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import {
  checkIsAdmin,
  createUser,
  getInstanceSettings,
  listUsers,
  removeUser,
  resetAdminAccess,
  updateInstanceSettings,
  updateUserRole,
} from '../../src/services/api/admin';
import {
  getSharedConnections,
  setConnectionSharing,
  sharedOwnerLabel,
} from '../../src/services/api/sharing';

const json = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    statusText: '',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() {
      return this;
    },
  });

describe('admin + sharing API (fork)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetAdminAccess();
    fetchMock = vi.fn().mockImplementation(() => json({}));
    vi.stubGlobal('fetch', fetchMock);
  });

  const lastCall = () => fetchMock.mock.calls.at(-1)!;

  it('caches the admin probe and reads failures as not admin', async () => {
    fetchMock.mockImplementation(() => json({ isAdmin: true }));
    await expect(checkIsAdmin()).resolves.toBe(true);
    await expect(checkIsAdmin()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetAdminAccess();
    fetchMock.mockImplementation(() => json({ message: 'nope' }, false, 500));
    await expect(checkIsAdmin()).resolves.toBe(false);
    fetchMock.mockImplementation(() => json({ isAdmin: true }));
    await expect(checkIsAdmin()).resolves.toBe(true);
  });

  it('calls the user administration endpoints', async () => {
    await listUsers();
    expect(String(lastCall()[0])).toContain('/api/v1/admin/users');
    await createUser({ name: 'A', email: 'a@x.io', password: 'password1', role: 'user' });
    expect(lastCall()[0]).toBe('/api/v1/admin/users');
    expect(lastCall()[1].method).toBe('POST');
    await updateUserRole('u 1', 'admin');
    expect(lastCall()[0]).toBe('/api/v1/admin/users/u%201');
    expect(JSON.parse(lastCall()[1].body)).toEqual({ role: 'admin' });
    await removeUser('u1');
    expect(lastCall()[1].method).toBe('DELETE');
    await getInstanceSettings();
    expect(String(lastCall()[0])).toContain('/api/v1/admin/settings');
    await updateInstanceSettings({ publicSignup: true });
    expect(JSON.parse(lastCall()[1].body)).toEqual({ publicSignup: true });
  });

  it('calls the sharing endpoints', async () => {
    await getSharedConnections();
    expect(String(lastCall()[0])).toContain('/api/v1/providers/shared');
    await setConnectionSharing('c1', true);
    expect(lastCall()[0]).toBe('/api/v1/providers/connections/c1/sharing');
    expect(JSON.parse(lastCall()[1].body)).toEqual({ shared: true });
  });

  it('names the owner of a shared connection', () => {
    expect(sharedOwnerLabel({ owner_name: ' Ada ', owner_email: 'a@x.io' })).toBe('Ada');
    expect(sharedOwnerLabel({ owner_name: null, owner_email: 'a@x.io' })).toBe('a@x.io');
    expect(sharedOwnerLabel({ owner_name: '', owner_email: null })).toBe('another user');
  });
});
