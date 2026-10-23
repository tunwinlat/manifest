import { ProviderKeyService } from '../provider-key.service';
import type { ModelRoute } from 'manifest-shared';

/** Fork: routes on a subscription another user shares. */
describe('ProviderKeyService — shared subscriptions', () => {
  const sharedRow = {
    id: 'conn-1',
    tenant_id: 'owner-tenant',
    provider: 'anthropic',
    auth_type: 'subscription',
    label: 'Work',
  };
  const ownerKeys = [
    { id: 'other-conn', label: 'Default', priority: 0, apiKey: 'tok-default', region: null },
    { id: 'conn-1', label: 'Work', priority: 1, apiKey: 'tok-work', region: null },
  ];
  const route: ModelRoute = {
    provider: 'anthropic',
    authType: 'subscription',
    model: 'claude-sonnet-4-5',
    keyLabel: 'Work',
    sharedConnectionId: 'conn-1',
  };

  let shared: { findUsable: jest.Mock; modelsFor: jest.Mock };
  let routingCache: { getProviderKeys: jest.Mock; setProviderKeys: jest.Mock };
  let discovery: { getModelsForAgent: jest.Mock };
  let svc: ProviderKeyService;

  beforeEach(() => {
    shared = {
      findUsable: jest.fn().mockResolvedValue(sharedRow),
      modelsFor: jest.fn().mockResolvedValue([{ id: 'claude-sonnet-4-5' }]),
    };
    routingCache = {
      getProviderKeys: jest.fn().mockReturnValue(ownerKeys),
      setProviderKeys: jest.fn(),
    };
    discovery = { getModelsForAgent: jest.fn() };
    svc = new ProviderKeyService(
      { find: jest.fn() } as never,
      {} as never,
      discovery as never,
      routingCache as never,
      {} as never,
      null,
      shared as never,
    );
  });

  it('selects exactly the shared row inside the owner tenant, without an agent filter', async () => {
    const result = await svc.selectSharedProviderKey('consumer', 'conn-1');
    expect(result).toEqual({
      key: ownerKeys[1],
      ownerTenantId: 'owner-tenant',
      provider: 'anthropic',
      authType: 'subscription',
    });
    expect(routingCache.getProviderKeys).toHaveBeenCalledWith(
      'owner-tenant',
      'anthropic',
      'subscription',
      undefined,
    );
  });

  it('never falls back to a sibling connection of the owner', async () => {
    routingCache.getProviderKeys.mockReturnValue([ownerKeys[0]]);
    await expect(svc.selectSharedProviderKey('consumer', 'conn-1')).resolves.toBeNull();
  });

  it('returns null when the connection is not shared with the caller', async () => {
    shared.findUsable.mockResolvedValue(null);
    await expect(svc.selectSharedProviderKey('consumer', 'conn-1')).resolves.toBeNull();
  });

  it('returns null without the sharing service', async () => {
    const bare = new ProviderKeyService(
      {} as never,
      {} as never,
      {} as never,
      routingCache as never,
      {} as never,
    );
    await expect(bare.selectSharedProviderKey('consumer', 'conn-1')).resolves.toBeNull();
    await expect(bare.isRouteAvailable('consumer', route)).resolves.toBe(false);
  });

  it('reports credentials from the shared connection', async () => {
    await expect(svc.hasRouteCredentials('consumer', route, 'agent-1')).resolves.toBe(true);
    shared.findUsable.mockResolvedValue(null);
    await expect(svc.hasRouteCredentials('consumer', route, 'agent-1')).resolves.toBe(false);
  });

  it('checks availability against the shared connection models only', async () => {
    await expect(svc.isRouteAvailable('consumer', route, 'agent-1')).resolves.toBe(true);
    await expect(
      svc.isRouteAvailable('consumer', { ...route, model: 'gpt-5' }, 'agent-1'),
    ).resolves.toBe(false);
    shared.modelsFor.mockResolvedValue(null);
    await expect(svc.isRouteAvailable('consumer', route, 'agent-1')).resolves.toBe(false);
    expect(discovery.getModelsForAgent).not.toHaveBeenCalled();
  });

  it('upgrades a shared route to a newer variant the connection offers', async () => {
    shared.modelsFor.mockResolvedValue([{ id: 'claude-sonnet-4-6' }]);
    const old = { ...route, model: 'claude-sonnet-4-5' };
    const upgraded = await svc.resolveNewerRouteVariant('consumer', old, 'agent-1');
    expect(upgraded.sharedConnectionId).toBe('conn-1');
    await expect(svc.isRouteAvailable('consumer', old, 'agent-1')).resolves.toBe(
      upgraded.model !== old.model,
    );
  });

  it('keeps a shared route whose model the connection still offers', async () => {
    await expect(svc.resolveNewerRouteVariant('consumer', route)).resolves.toBe(route);
    shared.modelsFor.mockResolvedValue([]);
    await expect(svc.resolveNewerRouteVariant('consumer', route)).resolves.toBe(route);
  });
});
