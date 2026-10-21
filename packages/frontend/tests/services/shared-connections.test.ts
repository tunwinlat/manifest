import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSharedConnections = vi.fn();
vi.mock('../../src/services/api/sharing.js', () => ({
  getSharedConnections: () => getSharedConnections(),
}));

describe('shared-connections store', () => {
  beforeEach(() => {
    vi.resetModules();
    getSharedConnections.mockReset();
  });

  it('loads once, finds by id, and reloads on demand', async () => {
    const store = await import('../../src/services/shared-connections');
    getSharedConnections.mockResolvedValue({ connections: [{ id: 'c1' }] });
    expect(store.sharedConnections()).toBeNull();
    await store.loadSharedConnections();
    await store.loadSharedConnections();
    expect(getSharedConnections).toHaveBeenCalledTimes(1);
    expect(store.findSharedConnection('c1')).toEqual({ id: 'c1' });
    expect(store.findSharedConnection(null)).toBeUndefined();
    getSharedConnections.mockResolvedValue({ connections: [] });
    await store.loadSharedConnections(true);
    expect(store.findSharedConnection('c1')).toBeUndefined();
  });

  it('settles on an empty list when the first load fails', async () => {
    const store = await import('../../src/services/shared-connections');
    getSharedConnections.mockRejectedValue(new Error('down'));
    await expect(store.loadSharedConnections()).resolves.toEqual([]);
    expect(store.sharedConnections()).toEqual([]);
  });
});
