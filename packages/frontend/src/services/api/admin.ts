import { fetchJson, fetchMutate } from './core.js';

/** Fork: install administration (multi-user). */

export type UserRole = 'admin' | 'user';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  role: UserRole;
  harnessCount: number;
  subscriptionCount: number;
  sharedSubscriptionCount: number;
}

export interface InstanceSettings {
  publicSignup: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

let accessPromise: Promise<boolean> | null = null;

/**
 * Whether the signed-in user administers this install. Cached per page load
 * (the sidebar and the admin pages both ask); a failed probe reads as "no".
 */
export function checkIsAdmin(): Promise<boolean> {
  if (!accessPromise) {
    accessPromise = fetchJson<{ isAdmin: boolean }>('/admin/access', undefined, {
      cache: false,
      loginRedirect: false,
    })
      .then((r) => r.isAdmin === true)
      .catch(() => {
        accessPromise = null;
        return false;
      });
  }
  return accessPromise;
}

/** Forget the cached admin probe (sign-out, role change). */
export function resetAdminAccess(): void {
  accessPromise = null;
}

export function listUsers() {
  return fetchJson<{ users: AdminUser[] }>('/admin/users', undefined, { cache: false });
}

export function createUser(input: CreateUserInput) {
  return fetchMutate<AdminUser>('/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateUserRole(userId: string, role: UserRole) {
  return fetchMutate<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export function removeUser(userId: string) {
  return fetchMutate<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export function getInstanceSettings() {
  return fetchJson<InstanceSettings>('/admin/settings', undefined, { cache: false });
}

export function updateInstanceSettings(settings: InstanceSettings) {
  return fetchMutate<InstanceSettings>('/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}
