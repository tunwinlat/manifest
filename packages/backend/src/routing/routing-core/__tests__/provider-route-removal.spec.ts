import type { ModelRoute } from 'manifest-shared';
import { planRouteRemoval, responseModeAfterRemoval } from '../provider-route-removal';

const route = (provider: string, model: string, extra: Partial<ModelRoute> = {}): ModelRoute =>
  ({ provider, authType: 'subscription', model, ...extra }) as ModelRoute;
const isAnthropic = (r: ModelRoute) => r.provider === 'anthropic';

describe('planRouteRemoval', () => {
  it('returns null when no route in the tier matches', () => {
    expect(
      planRouteRemoval(route('openai', 'gpt-6'), [route('xai', 'grok-4.7')], isAnthropic),
    ).toBeNull();
    expect(planRouteRemoval(null, null, isAnthropic)).toBeNull();
  });

  it('drops matching fallbacks and keeps the primary', () => {
    const primary = route('openai', 'gpt-6');
    const plan = planRouteRemoval(
      primary,
      [route('anthropic', 'claude-opus-5'), route('xai', 'grok-4.7')],
      isAnthropic,
    );
    expect(plan).toEqual({
      removed: [{ model: 'claude-opus-5', position: 'fallback 1' }],
      overrideRoute: primary,
      fallbackRoutes: [route('xai', 'grok-4.7')],
      replacement: null,
    });
  });

  it('promotes the first surviving fallback when the primary is removed', () => {
    const promoted = route('openai', 'gpt-6', { skipWhenQuotaExhausted: true });
    const plan = planRouteRemoval(
      route('anthropic', 'claude-opus-5'),
      [route('anthropic', 'claude-sonnet-5'), promoted, route('xai', 'grok-4.7')],
      isAnthropic,
    );
    expect(plan).toEqual({
      removed: [
        { model: 'claude-opus-5', position: 'primary' },
        { model: 'claude-sonnet-5', position: 'fallback 1' },
      ],
      overrideRoute: promoted,
      fallbackRoutes: [route('xai', 'grok-4.7')],
      replacement: 'gpt-6',
    });
  });

  it('clears the tier when every route belonged to the connection', () => {
    const plan = planRouteRemoval(
      route('anthropic', 'claude-opus-5'),
      [route('anthropic', 'claude-haiku-5-5')],
      isAnthropic,
    );
    expect(plan).toMatchObject({ overrideRoute: null, fallbackRoutes: null, replacement: null });
    expect(plan?.removed).toHaveLength(2);
  });

  it('leaves no empty fallback list behind', () => {
    const plan = planRouteRemoval(
      route('anthropic', 'claude-opus-5'),
      [route('openai', 'gpt-6')],
      isAnthropic,
    );
    expect(plan).toMatchObject({ overrideRoute: route('openai', 'gpt-6'), fallbackRoutes: null });

    const fallbacksOnly = planRouteRemoval(
      null,
      [route('anthropic', 'claude-opus-5')],
      isAnthropic,
    );
    expect(fallbacksOnly).toMatchObject({ overrideRoute: null, fallbackRoutes: null });
  });
});

describe('responseModeAfterRemoval', () => {
  const plan = (overrideRoute: ModelRoute | null) => ({
    removed: [],
    overrideRoute,
    fallbackRoutes: null,
    replacement: null,
  });

  it('keeps buffered tiers as they are', () => {
    expect(responseModeAfterRemoval('buffered', plan(null))).toBe('buffered');
  });

  it('keeps streaming when a stream-capable model remains', () => {
    expect(responseModeAfterRemoval('stream', plan(route('openai', 'gpt-6')))).toBe('stream');
  });

  it('falls back to buffered when no stream-capable model remains', () => {
    expect(responseModeAfterRemoval('stream', plan(null))).toBe('buffered');
    expect(responseModeAfterRemoval('stream', plan(route('no-stream-provider', 'm')))).toBe(
      'buffered',
    );
  });
});
