import type { ModelRoute, ResponseMode } from 'manifest-shared';
import { effectiveRoutesForResponseMode } from './response-mode-guard';

/** Error `code` on the 409 a disconnect returns while routing still uses the connection. */
export const PROVIDER_IN_ROUTING_CODE = 'provider_in_routing';

export type RouteSurface = 'tier' | 'specificity' | 'header';

/** One route that disconnecting a connection removes, as shown before confirming. */
export interface ProviderRouteImpact {
  agentId: string;
  /** Display name of the harness. */
  agentName: string;
  surface: RouteSurface;
  /** Tier name, task category, or custom (header) tier name. */
  name: string;
  model: string;
  /** `primary` or `fallback N` (1-based, before removal). */
  position: string;
  /** For a removed primary: the fallback promoted in its place, or null when none is left. */
  replacement: string | null;
}

export interface RemoveProviderOptions {
  /** Remove the routes that use the connection instead of refusing with a 409. */
  removeRoutes?: boolean;
}

export interface RouteRemovalPlan {
  removed: Array<{ model: string; position: string }>;
  overrideRoute: ModelRoute | null;
  fallbackRoutes: ModelRoute[] | null;
  /** Model promoted to primary, when the primary was removed and a fallback survived. */
  replacement: string | null;
}

/**
 * Plan dropping every route `belongs` matches from one tier: the matching
 * fallbacks go, and a matching primary is replaced by the first surviving
 * fallback (or cleared, leaving the tier to its automatic route). Returns null
 * when nothing in the tier matches.
 */
export function planRouteRemoval(
  overrideRoute: ModelRoute | null,
  fallbackRoutes: ModelRoute[] | null,
  belongs: (route: ModelRoute) => boolean,
): RouteRemovalPlan | null {
  const primaryRemoved = !!overrideRoute && belongs(overrideRoute);
  const removed: RouteRemovalPlan['removed'] = [];
  if (primaryRemoved) removed.push({ model: overrideRoute!.model, position: 'primary' });
  const fallbacks = fallbackRoutes ?? [];
  fallbacks.forEach((route, i) => {
    if (belongs(route)) removed.push({ model: route.model, position: `fallback ${i + 1}` });
  });
  if (removed.length === 0) return null;

  const kept = fallbacks.filter((route) => !belongs(route));
  if (primaryRemoved) {
    const [next, ...rest] = kept;
    return {
      removed,
      overrideRoute: next ?? null,
      fallbackRoutes: rest.length > 0 ? rest : null,
      replacement: next?.model ?? null,
    };
  }
  return {
    removed,
    overrideRoute,
    fallbackRoutes: kept.length > 0 ? kept : null,
    replacement: null,
  };
}

/**
 * A streaming tier must keep a stream-capable model. When removal takes the
 * last one, fall back to buffered responses rather than leave the tier in a
 * state the routing API would reject.
 */
export function responseModeAfterRemoval(
  responseMode: ResponseMode,
  plan: RouteRemovalPlan,
): ResponseMode {
  if (responseMode !== 'stream') return responseMode;
  const effective = effectiveRoutesForResponseMode(
    responseMode,
    plan.overrideRoute,
    plan.fallbackRoutes,
  );
  return effective.primaryRoute ? responseMode : 'buffered';
}
