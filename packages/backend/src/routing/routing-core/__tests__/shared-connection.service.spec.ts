import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TenantProvider } from '../../../entities/tenant-provider.entity';
import { SharedConnectionService } from '../shared-connection.service';

function row(overrides: Partial<TenantProvider> = {}): TenantProvider {
  return {
    id: 'conn-1',
    tenant_id: 'owner-tenant',
    created_by_user_id: null,
    agent_id: null,
    provider: 'anthropic',
    api_key_encrypted: 'enc',
    key_prefix: null,
    auth_type: 'subscription',
    label: 'Work',
    priority: 0,
    region: null,
    is_active: true,
    is_shared: true,
    connected_at: '2026-01-01',
    updated_at: '2026-01-01',
    cached_models: [],
    models_fetched_at: null,
    ...overrides,
  } as TenantProvider;
}

describe('SharedConnectionService', () => {
  const models = [{ id: 'claude-sonnet', provider: 'anthropic', authType: 'subscription' }];
  let repo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let dataSource: { query: jest.Mock };
  let discovery: { modelsForConnection: jest.Mock };
  let service: SharedConnectionService;

  beforeEach(() => {
    repo = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
    dataSource = { query: jest.fn() };
    discovery = { modelsForConnection: jest.fn().mockReturnValue(models) };
    service = new SharedConnectionService(repo as never, dataSource as never, discovery as never);
  });

  describe('findUsable', () => {
    it('returns a shared, active subscription owned by someone else', async () => {
      repo.findOne.mockResolvedValue(row());
      await expect(service.findUsable('consumer', 'conn-1')).resolves.toMatchObject({
        id: 'conn-1',
      });
    });

    it.each([
      ['missing', null],
      ['not shared', row({ is_shared: false })],
      ['inactive', row({ is_active: false })],
      ['not a subscription', row({ auth_type: 'api_key' })],
      ['without a credential', row({ api_key_encrypted: null })],
      ['owned by the caller', row({ tenant_id: 'consumer' })],
    ])('refuses a connection that is %s', async (_label, value) => {
      repo.findOne.mockResolvedValue(value);
      await expect(service.findUsable('consumer', 'conn-1')).resolves.toBeNull();
    });

    it('caches the row until invalidated', async () => {
      repo.findOne.mockResolvedValue(row());
      await service.findUsable('consumer', 'conn-1');
      await service.findUsable('consumer', 'conn-1');
      expect(repo.findOne).toHaveBeenCalledTimes(1);
      service.invalidate('conn-1');
      await service.findUsable('consumer', 'conn-1');
      service.invalidate();
      await service.findUsable('consumer', 'conn-1');
      expect(repo.findOne).toHaveBeenCalledTimes(3);
    });
  });

  it('modelsFor returns the connection models, or null when unusable', async () => {
    repo.findOne.mockResolvedValueOnce(row());
    await expect(service.modelsFor('consumer', 'conn-1')).resolves.toBe(models);
    service.invalidate();
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.modelsFor('consumer', 'conn-1')).resolves.toBeNull();
  });

  describe('requireRouteScope', () => {
    it('derives the route scope from the connection itself', async () => {
      repo.findOne.mockResolvedValue(row());
      await expect(service.requireRouteScope('consumer', 'conn-1')).resolves.toEqual({
        models,
        scope: {
          provider: 'anthropic',
          authType: 'subscription',
          keyLabel: 'Work',
          sharedConnectionId: 'conn-1',
        },
      });
    });

    it('rejects a connection that is no longer shared', async () => {
      repo.findOne.mockResolvedValue(row({ is_shared: false }));
      await expect(service.requireRouteScope('consumer', 'conn-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('poolsForRoutes', () => {
    it('collects one pool per shared connection named by the routes', async () => {
      repo.findOne.mockResolvedValue(row());
      const pools = await service.poolsForRoutes('consumer', [
        { provider: 'openai', authType: 'api_key', model: 'gpt' },
        {
          provider: 'anthropic',
          authType: 'subscription',
          model: 'a',
          sharedConnectionId: 'conn-1',
        },
        {
          provider: 'anthropic',
          authType: 'subscription',
          model: 'b',
          sharedConnectionId: 'conn-1',
        },
      ]);
      expect([...pools.keys()]).toEqual(['conn-1']);
      expect(pools.get('conn-1')).toEqual({ models, label: 'Work' });
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('skips an unshared connection that only carried-over routes name', async () => {
      repo.findOne.mockResolvedValue(null);
      const route = {
        provider: 'anthropic',
        authType: 'subscription' as const,
        model: 'a',
        sharedConnectionId: 'gone',
      };
      const pools = await service.poolsForRoutes('consumer', [route], [route]);
      expect(pools.size).toBe(0);
    });

    it('rejects a new route on an unshared connection', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.poolsForRoutes('consumer', [
          { provider: 'anthropic', authType: 'subscription', model: 'a', sharedConnectionId: 'x' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns an empty map without routes', async () => {
      await expect(service.poolsForRoutes('consumer', undefined)).resolves.toEqual(new Map());
    });
  });

  describe('listForConsumer', () => {
    it('lists other users shared subscriptions with owner and models', async () => {
      dataSource.query.mockResolvedValue([
        { id: 'conn-1', tenant_id: 'owner-tenant', owner_name: 'Ada', owner_email: 'a@x.io' },
        { id: 'vanished', tenant_id: 'owner-tenant', owner_name: 'Ada', owner_email: 'a@x.io' },
      ]);
      repo.find.mockResolvedValue([row()]);
      const list = await service.listForConsumer('consumer');
      expect(dataSource.query.mock.calls[0][1]).toEqual(['subscription', 'consumer']);
      expect(list).toEqual([
        {
          id: 'conn-1',
          provider: 'anthropic',
          authType: 'subscription',
          label: 'Work',
          ownerName: 'Ada',
          ownerEmail: 'a@x.io',
          models,
        },
      ]);
    });

    it('returns nothing when no one shares', async () => {
      dataSource.query.mockResolvedValue([]);
      await expect(service.listForConsumer('consumer')).resolves.toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  describe('setShared', () => {
    it('turns sharing on for the owner and drops the cached decision', async () => {
      repo.findOne.mockResolvedValueOnce(row({ is_shared: false }));
      const invalidate = jest.spyOn(service, 'invalidate');
      await expect(service.setShared('owner-tenant', 'conn-1', true)).resolves.toBe(true);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'conn-1', tenant_id: 'owner-tenant' },
        expect.objectContaining({ is_shared: true }),
      );
      expect(invalidate).toHaveBeenCalledWith('conn-1');
    });

    it('lets an api key connection be unshared but never shared', async () => {
      repo.findOne.mockResolvedValue(row({ auth_type: 'api_key' }));
      await expect(service.setShared('owner-tenant', 'conn-1', true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.setShared('owner-tenant', 'conn-1', false)).resolves.toBe(false);
    });

    it('404s for a connection outside the owner tenant', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.setShared('owner-tenant', 'conn-1', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
