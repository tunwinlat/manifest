// Disconnecting a connection that routing still uses: by default the service
// refuses with a 409 listing every affected route; with `removeRoutes` it
// drops those routes (promoting the next fallback) and disconnects in one
// transaction.
import { ConflictException } from '@nestjs/common';
import type { ModelRoute } from 'manifest-shared';
import type { EntityManager, Repository } from 'typeorm';
import { ProviderService } from '../provider.service';
import { TenantProvider } from '../../../entities/tenant-provider.entity';
import { TierAssignment } from '../../../entities/tier-assignment.entity';
import { SpecificityAssignment } from '../../../entities/specificity-assignment.entity';
import { Agent } from '../../../entities/agent.entity';
import { HeaderTier } from '../../../entities/header-tier.entity';
import { AgentEnabledProvider } from '../../../entities/agent-enabled-provider.entity';
import type { RoutingCacheService } from '../routing-cache.service';
import type { ModelPricingCacheService } from '../../../model-prices/model-pricing-cache.service';

const sub = (model: string, keyLabel?: string): ModelRoute =>
  ({ provider: 'anthropic', authType: 'subscription', model, keyLabel }) as ModelRoute;
const openai = (model: string): ModelRoute =>
  ({ provider: 'openai', authType: 'subscription', model }) as ModelRoute;

/** Await an expected rejection and hand back the ConflictException. */
const conflictFrom = async (promise: Promise<unknown>): Promise<ConflictException> => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConflictException);
  return error as ConflictException;
};

const makeRepo = <T>(rows: T[] = []) => ({
  find: jest.fn().mockResolvedValue(rows),
  save: jest.fn().mockImplementation(async (r: unknown) => r),
  remove: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn(),
  manager: { transaction: jest.fn(), getRepository: jest.fn() },
});

function harness(opts: {
  keys: Array<Partial<TenantProvider>>;
  tiers?: Array<Partial<TierAssignment>>;
  specs?: Array<Partial<SpecificityAssignment>>;
  headers?: Array<Partial<HeaderTier>>;
  enabled?: Array<{ agent_id: string; tenant_provider_id: string }>;
}) {
  const providerRepo = makeRepo(opts.keys as TenantProvider[]);
  const tierRepo = makeRepo(opts.tiers ?? []);
  const specRepo = makeRepo(opts.specs ?? []);
  const headerRepo = makeRepo(opts.headers ?? []);
  const enabledRepo = makeRepo(opts.enabled ?? []);
  const agentRepo = makeRepo();
  agentRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([
      { id: 'agent-1', name: 'support-bot', display_name: 'Support Bot' },
      { id: 'agent-2', name: 'coder', display_name: null },
    ]),
  });

  const byEntity = new Map<unknown, unknown>([
    [TenantProvider, providerRepo],
    [TierAssignment, tierRepo],
    [SpecificityAssignment, specRepo],
    [HeaderTier, headerRepo],
    [AgentEnabledProvider, enabledRepo],
  ]);
  const tx = { getRepository: jest.fn((entity: unknown) => byEntity.get(entity)) };
  providerRepo.manager.transaction.mockImplementation(
    async (cb: (m: EntityManager) => Promise<unknown>) => cb(tx as unknown as EntityManager),
  );

  const routingCache = {
    getProviders: jest.fn().mockReturnValue(null),
    setProviders: jest.fn(),
    invalidateAgent: jest.fn(),
    invalidateTenant: jest.fn(),
  };
  const svc = new ProviderService(
    providerRepo as unknown as Repository<TenantProvider>,
    tierRepo as unknown as Repository<TierAssignment>,
    specRepo as unknown as Repository<SpecificityAssignment>,
    agentRepo as unknown as Repository<Agent>,
    headerRepo as unknown as Repository<HeaderTier>,
    { getByModel: jest.fn() } as unknown as ModelPricingCacheService,
    routingCache as unknown as RoutingCacheService,
    enabledRepo as unknown as Repository<AgentEnabledProvider>,
  );
  return { svc, providerRepo, tierRepo, specRepo, headerRepo, enabledRepo, routingCache, tx };
}

const anthropicKey = (over: Partial<TenantProvider> = {}): Partial<TenantProvider> => ({
  id: 'k-default',
  tenant_id: 'tenant-1',
  provider: 'anthropic',
  auth_type: 'subscription',
  label: 'Default',
  priority: 0,
  is_active: true,
  ...over,
});

const bothAgentsEnabled = (...ids: string[]) =>
  ids.flatMap((id) => [
    { agent_id: 'agent-1', tenant_provider_id: id },
    { agent_id: 'agent-2', tenant_provider_id: id },
  ]);

describe('ProviderService — disconnect with routing in use', () => {
  const routing = () => ({
    tiers: [
      {
        agent_id: 'agent-1',
        tier: 'default',
        override_route: sub('claude-opus-5'),
        fallback_routes: [sub('claude-sonnet-5'), openai('gpt-6')],
        response_mode: 'buffered' as const,
      },
      {
        agent_id: 'agent-2',
        tier: 'default',
        override_route: openai('gpt-6'),
        fallback_routes: [sub('claude-haiku-5-5')],
        response_mode: 'buffered' as const,
      },
    ],
    specs: [
      {
        agent_id: 'agent-1',
        category: 'coding',
        is_active: true,
        override_route: sub('claude-opus-5'),
        fallback_routes: null,
        response_mode: 'stream' as const,
      },
    ],
    headers: [
      {
        agent_id: 'agent-2',
        name: 'Batch jobs',
        enabled: true,
        override_route: openai('gpt-6'),
        fallback_routes: null,
        response_mode: 'buffered' as const,
      },
    ],
  });

  it('refuses with every affected route, grouped data the dashboard can show', async () => {
    const h = harness({
      keys: [anthropicKey()],
      ...routing(),
      enabled: bothAgentsEnabled('k-default'),
    });

    const error = await conflictFrom(
      h.svc.removeProvider(null, 'tenant-1', 'anthropic', 'subscription'),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'provider_in_routing',
      affected: [
        {
          agentName: 'Support Bot',
          surface: 'tier',
          name: 'default',
          model: 'claude-opus-5',
          position: 'primary',
          replacement: 'gpt-6',
        },
        {
          agentName: 'Support Bot',
          surface: 'tier',
          name: 'default',
          model: 'claude-sonnet-5',
          position: 'fallback 1',
          replacement: null,
        },
        {
          agentName: 'coder',
          surface: 'tier',
          name: 'default',
          model: 'claude-haiku-5-5',
          position: 'fallback 1',
          replacement: null,
        },
        {
          agentName: 'Support Bot',
          surface: 'specificity',
          name: 'coding',
          model: 'claude-opus-5',
          position: 'primary',
          replacement: null,
        },
      ],
    });
    expect(h.providerRepo.save).not.toHaveBeenCalled();
    expect(h.tierRepo.save).not.toHaveBeenCalled();
    expect(h.providerRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it('removes the routes and disconnects in one transaction when asked', async () => {
    const h = harness({
      keys: [anthropicKey()],
      ...routing(),
      enabled: bothAgentsEnabled('k-default'),
    });

    await expect(
      h.svc.removeProvider(null, 'tenant-1', 'anthropic', 'subscription', undefined, undefined, {
        removeRoutes: true,
      }),
    ).resolves.toEqual({ notifications: [] });

    expect(h.providerRepo.manager.transaction).toHaveBeenCalledTimes(1);
    const [savedTiers] = h.tierRepo.save.mock.calls[0] as [TierAssignment[]];
    expect(savedTiers.map((t) => [t.agent_id, t.override_route, t.fallback_routes])).toEqual([
      ['agent-1', openai('gpt-6'), null],
      ['agent-2', openai('gpt-6'), null],
    ]);
    const [savedSpecs] = h.specRepo.save.mock.calls[0] as [SpecificityAssignment[]];
    // Nothing stream-capable left in a streaming category: back to buffered.
    expect(savedSpecs[0]).toMatchObject({
      override_route: null,
      fallback_routes: null,
      response_mode: 'buffered',
    });
    // The custom tier never used the connection, so it isn't rewritten.
    expect(h.headerRepo.save).not.toHaveBeenCalled();
    // The connection itself is deactivated and its per-agent access cleared.
    const [deactivated] = h.providerRepo.save.mock.calls[0] as [TenantProvider[]];
    expect(deactivated[0]).toMatchObject({ id: 'k-default', is_active: false });
    expect(h.enabledRepo.delete).toHaveBeenCalled();
    expect(h.routingCache.invalidateAgent).toHaveBeenCalledWith('agent-1');
    expect(h.routingCache.invalidateAgent).toHaveBeenCalledWith('agent-2');
  });

  it('ignores routes on agents that do not have the connection enabled', async () => {
    const h = harness({
      keys: [anthropicKey()],
      ...routing(),
      enabled: [{ agent_id: 'agent-2', tenant_provider_id: 'k-default' }],
    });

    const error = await conflictFrom(
      h.svc.removeProvider(null, 'tenant-1', 'anthropic', 'subscription'),
    );
    const affected = (error.getResponse() as { affected: Array<{ agentName: string }> }).affected;
    expect(affected.map((a) => a.agentName)).toEqual(['coder']);
  });

  describe('deleting one account while others remain', () => {
    const keys = () => [anthropicKey(), anthropicKey({ id: 'k-2', label: 'Key 2', priority: 1 })];
    const pinnedRouting = () => ({
      tiers: [
        {
          agent_id: 'agent-1',
          tier: 'default',
          // Unpinned: follows the primary key, so it survives deleting "Default".
          override_route: sub('claude-opus-5'),
          fallback_routes: [sub('claude-sonnet-5', 'Default'), sub('claude-haiku-5-5', 'Key 2')],
          response_mode: 'buffered' as const,
        },
      ],
    });

    it('only counts routes pinned to the deleted account', async () => {
      const h = harness({
        keys: keys(),
        ...pinnedRouting(),
        enabled: bothAgentsEnabled('k-default', 'k-2'),
      });

      const error = await conflictFrom(
        h.svc.removeProvider(null, 'tenant-1', 'anthropic', 'subscription', 'Default'),
      );

      expect((error.getResponse() as { affected: unknown[] }).affected).toEqual([
        {
          agentName: 'Support Bot',
          surface: 'tier',
          name: 'default',
          model: 'claude-sonnet-5',
          position: 'fallback 1',
          replacement: null,
        },
      ]);
      expect(h.providerRepo.remove).not.toHaveBeenCalled();
    });

    it('removes only the pinned routes and deletes the account when asked', async () => {
      const h = harness({
        keys: keys(),
        ...pinnedRouting(),
        enabled: bothAgentsEnabled('k-default', 'k-2'),
      });

      await h.svc.removeProvider(
        null,
        'tenant-1',
        'anthropic',
        'subscription',
        'Default',
        undefined,
        { removeRoutes: true },
      );

      const [savedTiers] = h.tierRepo.save.mock.calls[0] as [TierAssignment[]];
      expect(savedTiers[0].override_route).toEqual(sub('claude-opus-5'));
      expect(savedTiers[0].fallback_routes).toEqual([sub('claude-haiku-5-5', 'Key 2')]);
      expect(h.providerRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'k-default' }),
      );
    });

    it('deletes the account without asking when nothing is pinned to it', async () => {
      const h = harness({
        keys: keys(),
        tiers: [
          {
            agent_id: 'agent-1',
            tier: 'default',
            override_route: sub('claude-opus-5'),
            fallback_routes: null,
            response_mode: 'buffered',
          },
        ],
        enabled: bothAgentsEnabled('k-default', 'k-2'),
      });

      await expect(
        h.svc.removeProvider(null, 'tenant-1', 'anthropic', 'subscription', 'Default'),
      ).resolves.toEqual({ notifications: [] });
      expect(h.tierRepo.save).not.toHaveBeenCalled();
    });
  });

  it('passes removeRoutes through when the last account is deleted by label', async () => {
    const h = harness({
      keys: [anthropicKey()],
      ...routing(),
      enabled: bothAgentsEnabled('k-default'),
    });

    await h.svc.removeProvider(
      null,
      'tenant-1',
      'anthropic',
      'subscription',
      'Default',
      undefined,
      { removeRoutes: true },
    );

    expect(h.tierRepo.save).toHaveBeenCalled();
    const [deactivated] = h.providerRepo.save.mock.calls[0] as [TenantProvider[]];
    expect(deactivated[0]).toMatchObject({ is_active: false });
  });
});
