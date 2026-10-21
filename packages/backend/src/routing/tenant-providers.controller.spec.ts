import { TenantProvidersController } from './tenant-providers.controller';
import type { TenantContext } from '../common/decorators/tenant-context.decorator';
import type { TenantProvider } from '../entities/tenant-provider.entity';

describe('TenantProvidersController', () => {
  const previousMode = process.env['MANIFEST_MODE'];
  const ctx: TenantContext = { tenantId: 'tenant-1', userId: 'user-1' };

  beforeEach(() => {
    process.env['MANIFEST_MODE'] = 'cloud';
  });

  afterAll(() => {
    if (previousMode === undefined) delete process.env['MANIFEST_MODE'];
    else process.env['MANIFEST_MODE'] = previousMode;
  });

  const makeProvider = (id: string, label: string): TenantProvider =>
    ({
      id,
      tenant_id: 'tenant-1',
      created_by_user_id: 'user-1',
      agent_id: null,
      provider: 'openai',
      auth_type: 'api_key',
      label,
      priority: 0,
      api_key_encrypted: 'encrypted-same-key',
      key_prefix: 'sk-test',
      region: null,
      is_active: true,
      connected_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      cached_models: [{ id: 'gpt-4o' }] as never,
      models_fetched_at: '2026-01-01T00:00:00.000Z',
    }) as TenantProvider;

  it('lists multiple provider rows without deleting them', async () => {
    const providerRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          makeProvider('provider-agent-a', 'Default'),
          makeProvider('provider-agent-b', 'Default [provider-agent-b]'),
        ]),
      delete: jest.fn(),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(providerRepo.find).toHaveBeenCalledWith({ where: { tenant_id: 'tenant-1' } });
    expect(providerRepo.delete).not.toHaveBeenCalled();
    expect(result.providers).toEqual([
      expect.objectContaining({
        provider: 'openai',
        auth_type: 'api_key',
        connection_count: 2,
        connections: [
          expect.objectContaining({ id: 'provider-agent-a', label: 'Default' }),
          expect.objectContaining({
            id: 'provider-agent-b',
            label: 'Default [provider-agent-b]',
          }),
        ],
      }),
    ]);
  });

  it('does not expose usage fields (split out to /providers/usage)', async () => {
    const providerRepo = {
      find: jest.fn().mockResolvedValue([makeProvider('p1', 'Default')]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    // The slim config endpoint must NOT carry any usage stats.
    expect(result.providers[0]).not.toHaveProperty('consumption_tokens');
    expect(result.providers[0]).not.toHaveProperty('consumption_messages');
    expect(result.providers[0]).not.toHaveProperty('consumption_cost');
    expect(result.providers[0]).not.toHaveProperty('last_used_at');
    expect(result.providers[0]).not.toHaveProperty('sparkline_7d');
  });

  it('returns empty providers when tenant has none', async () => {
    const providerRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(result.providers).toEqual([]);
    expect(result.model_counts).toEqual({});
  });

  it('hides legacy built-in local rows in cloud but keeps tunneled custom providers', async () => {
    const providerRepo = {
      find: jest.fn().mockResolvedValue([
        { ...makeProvider('ollama-row', 'Default'), provider: 'ollama', auth_type: 'local' },
        {
          ...makeProvider('tunnel-row', 'Default'),
          provider: 'custom:runtime-id',
          auth_type: 'local',
        },
      ]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([{ id: 'runtime-id', name: 'LM Studio' }]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(result.providers.map((provider) => provider.provider)).toEqual(['custom:runtime-id']);
  });

  it('returns empty providers when ctx has no tenant (fresh account)', async () => {
    const providerRepo = { find: jest.fn() };
    const customProviderService = { list: jest.fn() };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      customProviderService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders({ tenantId: null, userId: 'user-1' });

    expect(providerRepo.find).not.toHaveBeenCalled();
    expect(customProviderService.list).not.toHaveBeenCalled();
    expect(result.providers).toEqual([]);
    expect(result.model_counts).toEqual({});
  });

  it('groups providers by provider+auth_type key', async () => {
    const providerRepo = {
      find: jest.fn().mockResolvedValue([
        {
          ...makeProvider('p1', 'Key1'),
          provider: 'anthropic',
          auth_type: 'api_key',
          cached_models: [],
        },
        {
          ...makeProvider('p2', 'Key2'),
          provider: 'openai',
          auth_type: 'api_key',
          cached_models: [],
        },
        {
          ...makeProvider('p3', 'OpenAI Sub'),
          provider: 'openai',
          auth_type: 'subscription',
          cached_models: [],
        },
      ]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(result.providers).toHaveLength(3);
    expect(
      result.providers.map(
        (p: { provider: string; auth_type: string }) => `${p.provider}::${p.auth_type}`,
      ),
    ).toEqual(
      expect.arrayContaining(['anthropic::api_key', 'openai::api_key', 'openai::subscription']),
    );
  });

  it('reports total_models as the max cached_models length across keys in a group', async () => {
    const providerRepo = {
      find: jest.fn().mockResolvedValue([
        { ...makeProvider('p1', 'Default'), cached_models: [{ id: 'a' }] as never },
        {
          ...makeProvider('p2', 'Second'),
          cached_models: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never,
        },
      ]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(result.providers[0].total_models).toBe(3);
    expect(result.providers[0].connection_count).toBe(2);
  });

  it('treats a non-array cached_models as zero models', async () => {
    const providerRepo = {
      find: jest
        .fn()
        .mockResolvedValue([{ ...makeProvider('p1', 'Default'), cached_models: null as never }]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(result.providers[0].total_models).toBe(0);
    expect(result.providers[0].connections[0].cached_model_count).toBe(0);
  });

  it('returns model_counts from pricing cache', async () => {
    const providerRepo = { find: jest.fn().mockResolvedValue([]) };
    const controller = new TenantProvidersController(
      providerRepo as never,
      {
        getAll: jest.fn().mockReturnValue([
          { provider: 'OpenAI', model_name: 'gpt-4o' },
          { provider: 'OpenAI', model_name: 'gpt-4o-mini' },
          { provider: 'Anthropic', model_name: 'claude-3-5-sonnet' },
          // Pricing rows with no provider are skipped.
          { provider: null, model_name: 'mystery' },
        ]),
      } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(result.model_counts).toEqual({ openai: 2, anthropic: 1 });
  });

  it('resolves display_name for custom provider groups', async () => {
    const providerRepo = {
      find: jest
        .fn()
        .mockResolvedValue([{ ...makeProvider('p1', 'Default'), provider: 'custom:u-9' }]),
    };
    const customProviderService = {
      list: jest.fn().mockResolvedValue([{ id: 'u-9', name: 'MyLLM' }]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      customProviderService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(customProviderService.list).toHaveBeenCalledWith('tenant-1');
    expect(result.providers[0]).toMatchObject({
      provider: 'custom:u-9',
      display_name: 'MyLLM',
    });
  });

  it('returns null display_name for built-in groups and deleted custom providers', async () => {
    const providerRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          makeProvider('p1', 'Default'),
          { ...makeProvider('p2', 'Gone'), provider: 'custom:gone' },
        ]),
    };
    const controller = new TenantProvidersController(
      providerRepo as never,
      { getAll: jest.fn().mockReturnValue([]) } as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listProviders(ctx);

    expect(
      result.providers.find((p: { provider: string }) => p.provider === 'openai')!.display_name,
    ).toBeNull();
    expect(
      result.providers.find((p: { provider: string }) => p.provider === 'custom:gone')!
        .display_name,
    ).toBeNull();
  });
});

describe('TenantProvidersController mutations (no harness required)', () => {
  const ctx: TenantContext = { tenantId: 'tenant-1', userId: 'user-1' };

  const setup = () => {
    const providerService = {
      removeProvider: jest.fn().mockResolvedValue({ notifications: [] }),
      renameKey: jest.fn().mockResolvedValue({
        id: 'p1',
        provider: 'openai',
        auth_type: 'api_key',
        label: 'Renamed',
        priority: 0,
      }),
      listOwnedAgentIds: jest.fn().mockResolvedValue(['agent-a', 'agent-b']),
    };
    const discoveryService = { discoverAllForAgent: jest.fn().mockResolvedValue(undefined) };
    const routingCache = { invalidateAgent: jest.fn(), invalidateTenant: jest.fn() };
    const cacheManager = { clear: jest.fn().mockResolvedValue(undefined) };
    const controller = new TenantProvidersController(
      {} as never,
      {} as never,
      {} as never,
      providerService as never,
      discoveryService as never,
      routingCache as never,
      cacheManager as never,
    );
    return { controller, providerService, discoveryService, routingCache, cacheManager };
  };

  const expectTenantInvalidated = (routingCache: {
    invalidateAgent: jest.Mock;
    invalidateTenant: jest.Mock;
  }) => {
    expect(routingCache.invalidateAgent).toHaveBeenCalledWith('agent-a');
    expect(routingCache.invalidateAgent).toHaveBeenCalledWith('agent-b');
    expect(routingCache.invalidateTenant).toHaveBeenCalledWith('tenant-1');
  };

  it('removes a provider at tenant scope without an agent', async () => {
    const { controller, providerService, routingCache, cacheManager } = setup();

    const result = await controller.removeProvider(
      ctx,
      { provider: 'openai' },
      { authType: 'api_key', label: 'Default' },
    );

    expect(providerService.removeProvider).toHaveBeenCalledWith(
      null,
      'tenant-1',
      'openai',
      'api_key',
      'Default',
      undefined,
      { removeRoutes: false },
    );
    expectTenantInvalidated(routingCache);
    expect(cacheManager.clear).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it('renames a key at tenant scope, defaulting authType to api_key', async () => {
    const { controller, providerService, routingCache } = setup();

    const result = await controller.renameProviderKey(
      ctx,
      { provider: 'openai', label: 'Default' },
      { newLabel: 'Renamed' },
    );

    expect(providerService.renameKey).toHaveBeenCalledWith(
      null,
      'tenant-1',
      'openai',
      'api_key',
      'Default',
      'Renamed',
    );
    expectTenantInvalidated(routingCache);
    expect(result).toEqual({
      id: 'p1',
      provider: 'openai',
      auth_type: 'api_key',
      label: 'Renamed',
      priority: 0,
    });
  });

  it('passes an explicit authType through on rename', async () => {
    const { controller, providerService } = setup();

    await controller.renameProviderKey(
      ctx,
      { provider: 'anthropic', label: 'Default' },
      { newLabel: 'Work', authType: 'subscription' },
    );

    expect(providerService.renameKey).toHaveBeenCalledWith(
      null,
      'tenant-1',
      'anthropic',
      'subscription',
      'Default',
      'Work',
    );
  });

  it('refreshes every connection for the tenant', async () => {
    const { controller, discoveryService, routingCache } = setup();

    const result = await controller.refreshModels(ctx);

    expect(discoveryService.discoverAllForAgent).toHaveBeenCalledWith('tenant-1', {
      forceRefresh: true,
    });
    expectTenantInvalidated(routingCache);
    expect(result).toEqual({ ok: true });
  });

  it('answers 404 when the caller has no tenant yet', async () => {
    const { controller, providerService, discoveryService } = setup();
    const noTenant: TenantContext = { tenantId: null, userId: 'user-1' } as never;

    await expect(controller.refreshModels(noTenant)).rejects.toThrow('Provider not found');
    await expect(controller.removeProvider(noTenant, { provider: 'openai' }, {})).rejects.toThrow(
      'Provider not found',
    );
    await expect(
      controller.renameProviderKey(noTenant, { provider: 'openai', label: 'a' }, { newLabel: 'b' }),
    ).rejects.toThrow('Provider not found');
    expect(providerService.removeProvider).not.toHaveBeenCalled();
    expect(providerService.renameKey).not.toHaveBeenCalled();
    expect(discoveryService.discoverAllForAgent).not.toHaveBeenCalled();
  });

  describe('sharing (fork)', () => {
    const build = (shared: object, cache = { clear: jest.fn() }) =>
      new TenantProvidersController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        cache as never,
        shared as never,
      );

    it('lists what other users share, with their models', async () => {
      const shared = {
        listForConsumer: jest.fn().mockResolvedValue([
          {
            id: 'conn-1',
            provider: 'anthropic',
            authType: 'subscription',
            label: 'Work',
            ownerName: 'Ada',
            ownerEmail: 'ada@x.io',
            models: [
              {
                id: 'claude-sonnet-4-5',
                displayName: 'Claude Sonnet 4.5',
                provider: 'anthropic',
                contextWindow: 200000,
                capabilityReasoning: true,
                capabilityCode: true,
                qualityScore: 5,
              },
            ],
          },
        ]),
      };
      const result = await build(shared).listSharedWithMe(ctx);
      expect(shared.listForConsumer).toHaveBeenCalledWith('tenant-1');
      expect(result.connections).toEqual([
        {
          id: 'conn-1',
          provider: 'anthropic',
          auth_type: 'subscription',
          label: 'Work',
          owner_name: 'Ada',
          owner_email: 'ada@x.io',
          models: [
            {
              model_name: 'claude-sonnet-4-5',
              display_name: 'Claude Sonnet 4.5',
              provider: 'anthropic',
              auth_type: 'subscription',
              context_window: 200000,
              capability_reasoning: true,
              capability_code: true,
              quality_score: 5,
            },
          ],
        },
      ]);
    });

    it('lists nothing for a user without a tenant yet', async () => {
      const shared = { listForConsumer: jest.fn() };
      await expect(
        build(shared).listSharedWithMe({ tenantId: null, userId: 'u' } as never),
      ).resolves.toEqual({ connections: [] });
      expect(shared.listForConsumer).not.toHaveBeenCalled();
    });

    it('degrades without the sharing service', async () => {
      const bare = new TenantProvidersController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(bare.listSharedWithMe(ctx)).resolves.toEqual({ connections: [] });
      await expect(bare.setSharing(ctx, { connectionId: 'c' }, { shared: true })).rejects.toThrow(
        'Connection not found',
      );
    });

    it('toggles sharing for the caller tenant and clears response caches', async () => {
      const shared = { setShared: jest.fn().mockResolvedValue(true) };
      const cache = { clear: jest.fn() };
      await expect(
        build(shared, cache).setSharing(ctx, { connectionId: 'conn-1' }, { shared: true }),
      ).resolves.toEqual({ id: 'conn-1', is_shared: true });
      expect(shared.setShared).toHaveBeenCalledWith('tenant-1', 'conn-1', true);
      expect(cache.clear).toHaveBeenCalled();
    });
  });
});
