import { createSignal } from 'solid-js';
import { getSharedConnections, type SharedConnection } from './api/sharing.js';

/**
 * Fork: the subscriptions other users share with the signed-in user, loaded
 * once per page and shared by the routing pickers and route chips.
 */
const [connections, setConnections] = createSignal<SharedConnection[] | null>(null);
let inflight: Promise<SharedConnection[]> | null = null;

export function loadSharedConnections(force = false): Promise<SharedConnection[]> {
  if (inflight && !force) return inflight;
  inflight = getSharedConnections()
    .then((r) => {
      setConnections(r.connections);
      return r.connections;
    })
    .catch(() => {
      inflight = null;
      setConnections((prev) => prev ?? []);
      return connections() ?? [];
    });
  return inflight;
}

/** Loaded shared connections, or null before the first load resolves. */
export const sharedConnections = connections;

export function findSharedConnection(id: string | null | undefined): SharedConnection | undefined {
  if (!id) return undefined;
  return connections()?.find((c) => c.id === id);
}
