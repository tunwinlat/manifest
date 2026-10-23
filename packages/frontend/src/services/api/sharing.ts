import type { AuthType } from 'manifest-shared';
import { fetchJson, fetchMutate } from './core.js';

/** Fork: subscriptions users share with each other for harness routing. */

export interface SharedModel {
  model_name: string;
  display_name?: string | null;
  provider: string;
  auth_type: AuthType;
  context_window: number;
  capability_reasoning: boolean;
  capability_code: boolean;
  quality_score: number;
}

export interface SharedConnection {
  /** The owner's `tenant_providers.id`, stored on routes as `sharedConnectionId`. */
  id: string;
  provider: string;
  auth_type: AuthType;
  label: string;
  owner_name: string | null;
  owner_email: string | null;
  models: SharedModel[];
}

/** Subscriptions other users share with the caller. */
export function getSharedConnections() {
  return fetchJson<{ connections: SharedConnection[] }>('/providers/shared', undefined, {
    cache: false,
  });
}

/** Turn sharing of one of the caller's own subscription connections on or off. */
export function setConnectionSharing(connectionId: string, shared: boolean) {
  return fetchMutate<{ id: string; is_shared: boolean }>(
    `/providers/connections/${encodeURIComponent(connectionId)}/sharing`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shared }),
    },
  );
}

/** Who shares a connection, for chips and pickers. */
export function sharedOwnerLabel(connection: Pick<SharedConnection, 'owner_name' | 'owner_email'>) {
  return connection.owner_name?.trim() || connection.owner_email || 'another user';
}
