import { BadRequestException } from '@nestjs/common';
import type { ModelRoute } from 'manifest-shared';
import { TierService } from '../tier.service';
import type { DiscoveredModel } from '../../../model-discovery/model-fetcher';

/** Fork: default-tier writes that target another user's shared subscription. */
describe('TierService — shared subscriptions', () => {
  const sharedModel = {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    authType: 'subscription',
  } as DiscoveredModel;
  const scope = {
    provider: 'anthropic',
    authType: 'subscription' as const,
    keyLabel: 'Work',
    sharedConnectionId: 'conn-1',
  };
  let tierRepo: { findOne: jest.Mock; insert: jest.Mock; save: jest.Mock };
  let discovery: { getModelsForAgent: jest.Mock };
  let shared: { requireRouteScope: jest.Mock; poolsForRoutes: jest.Mock };
  let svc: TierService;

  beforeEach(() => {
    tierRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation(async (r) => r),
    };
    discovery = { getModelsForAgent: jest.fn().mockResolvedValue([]) };
    shared = {
      requireRouteScope: jest.fn().mockResolvedValue({ models: [sharedModel], scope }),
      poolsForRoutes: jest
        .fn()
        .mockResolvedValue(new Map([['conn-1', { models: [sharedModel], label: 'Work' }]])),
    };
    svc = new TierService(
      tierRepo as never,
      { invalidateAgent: jest.fn(), setTiers: jest.fn(), getTiers: jest.fn() } as never,
      {} as never,
      discovery as never,
      shared as never,
    );
  });

  it('stores a primary on the shared connection with the owner label', async () => {
    const row = await svc.setOverride(
      'agent-1',
      'consumer',
      'default',
      'claude-sonnet-4-5',
      'anthropic',
      'subscription',
      'whatever-the-client-sent',
      undefined,
      'conn-1',
    );
    expect(shared.requireRouteScope).toHaveBeenCalledWith('consumer', 'conn-1');
    expect(discovery.getModelsForAgent).not.toHaveBeenCalled();
    expect(row.override_route).toEqual({
      provider: 'anthropic',
      authType: 'subscription',
      model: 'claude-sonnet-4-5',
      keyLabel: 'Work',
      sharedConnectionId: 'conn-1',
    });
  });

  it('rejects a model the shared connection does not offer', async () => {
    await expect(
      svc.setOverride(
        'agent-1',
        'consumer',
        'default',
        'gpt-5',
        undefined,
        undefined,
        undefined,
        undefined,
        'conn-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses shared writes when sharing is unavailable', async () => {
    const bare = new TierService(tierRepo as never, {} as never, {} as never, discovery as never);
    await expect(
      bare.setOverride(
        'agent-1',
        'consumer',
        'default',
        'm',
        undefined,
        undefined,
        undefined,
        undefined,
        'conn-1',
      ),
    ).rejects.toThrow('Shared subscriptions are not available.');
  });

  it('validates shared fallbacks against their connection', async () => {
    const fallback: ModelRoute = {
      provider: 'anthropic',
      authType: 'subscription',
      model: 'claude-sonnet-4-5',
      sharedConnectionId: 'conn-1',
    };
    tierRepo.findOne.mockResolvedValue({
      agent_id: 'agent-1',
      tier: 'default',
      fallback_routes: null,
    });
    const routes = await svc.setFallbacks(
      'agent-1',
      'consumer',
      'default',
      ['claude-sonnet-4-5'],
      [fallback],
    );
    expect(shared.poolsForRoutes).toHaveBeenCalledWith('consumer', [fallback], null);
    expect(routes).toEqual([{ ...fallback, keyLabel: 'Work' }]);
  });
});
