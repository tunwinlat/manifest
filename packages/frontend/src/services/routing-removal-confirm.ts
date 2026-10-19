import { createSignal } from 'solid-js';

/** One route a disconnect would remove (mirrors the backend 409 payload). */
export interface AffectedRoute {
  agentName: string;
  surface: 'tier' | 'specificity' | 'header';
  name: string;
  model: string;
  /** `primary` or `fallback N`. */
  position: string;
  /** For a removed primary: the fallback that takes its place, or null. */
  replacement: string | null;
}

/** Code the backend puts on the 409 when routing still uses the connection. */
export const PROVIDER_IN_ROUTING_CODE = 'provider_in_routing';

/** Thrown when the user cancels the "remove from routing" confirmation. */
export class DisconnectCancelledError extends Error {
  constructor() {
    super('Disconnect cancelled');
    this.name = 'DisconnectCancelledError';
  }
}

interface PendingConfirmation {
  affected: AffectedRoute[];
  resolve: (confirmed: boolean) => void;
}

const [pending, setPending] = createSignal<PendingConfirmation | null>(null);

/** The confirmation the modal should show, if any. */
export const pendingRoutingRemoval = pending;

/**
 * Ask the user to confirm removing `affected` from routing. Resolves true on
 * "Remove", false on cancel. A second request while one is open cancels the
 * first, so a stale dialog can never confirm the wrong disconnect.
 */
export function confirmRoutingRemoval(affected: AffectedRoute[]): Promise<boolean> {
  pending()?.resolve(false);
  return new Promise((resolve) => {
    setPending({
      affected,
      resolve: (confirmed) => {
        setPending(null);
        resolve(confirmed);
      },
    });
  });
}

export function isProviderInRoutingBody(
  body: unknown,
): body is { code: string; affected: AffectedRoute[] } {
  if (typeof body !== 'object' || body === null) return false;
  const { code, affected } = body as { code?: unknown; affected?: unknown };
  return code === PROVIDER_IN_ROUTING_CODE && Array.isArray(affected) && affected.length > 0;
}

/** Human label for where a route lives, e.g. "Default routing" or "Custom tier “Batch”". */
export function describeRouteSurface(route: Pick<AffectedRoute, 'surface' | 'name'>): string {
  if (route.surface === 'header') return `Custom tier “${route.name}”`;
  if (route.surface === 'specificity') return `Task routing: ${route.name.replace(/_/g, ' ')}`;
  if (route.name === 'default') return 'Default routing';
  return `${route.name.charAt(0).toUpperCase()}${route.name.slice(1)} tier`;
}

/** Group affected routes by harness, keeping the backend's order. */
export function groupByHarness(affected: AffectedRoute[]): Array<[string, AffectedRoute[]]> {
  const groups = new Map<string, AffectedRoute[]>();
  for (const route of affected) {
    const list = groups.get(route.agentName) ?? [];
    list.push(route);
    groups.set(route.agentName, list);
  }
  return [...groups.entries()];
}
