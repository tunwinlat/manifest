import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Fork: who may create a Better Auth user.
 *
 * On a multi-user install people share subscriptions with each other, so an
 * open sign-up page would let anyone who finds the URL route through them.
 * Account creation is therefore allowed only:
 *
 * - for the very first user (the first-run setup wizard), who becomes the
 *   administrator;
 * - while the server provisions the account itself (an administrator adding
 *   a user, dev seeding), marked with {@link runAsProvisioning};
 * - when the administrator turned public sign-up on.
 *
 * The check runs in Better Auth's `user.create.before` hook, so it covers the
 * email form and social sign-in alike. Kept free of Better Auth imports so the
 * unit suite can load it (Better Auth is ESM-only under Jest).
 */

export const SIGNUP_CLOSED_MESSAGE =
  'Sign-up is closed on this Manifest. Ask an administrator to create an account for you.';

const provisioning = new AsyncLocalStorage<true>();

/** Run `fn` as a server-side account creation that bypasses the sign-up gate. */
export function runAsProvisioning<T>(fn: () => Promise<T>): Promise<T> {
  return provisioning.run(true, fn);
}

export function isProvisioning(): boolean {
  return provisioning.getStore() === true;
}

/** Minimal query surface: Better Auth's `pg.Pool` and TypeORM's DataSource both fit. */
export type SignupQuery = (sql: string) => Promise<Array<Record<string, unknown>>>;

export async function isPublicSignupEnabled(query: SignupQuery): Promise<boolean> {
  try {
    const rows = await query(`SELECT public_signup FROM instance_settings LIMIT 1`);
    return rows[0]?.['public_signup'] === true;
  } catch {
    // Table missing (migrations not run yet): fail closed.
    return false;
  }
}

/** True when a new account may be created right now. */
export async function isSignupAllowed(query: SignupQuery): Promise<boolean> {
  if (isProvisioning()) return true;
  const rows = await query(`SELECT COUNT(*) AS count FROM "user"`);
  if (Number(rows[0]?.['count'] ?? 0) === 0) return true;
  return isPublicSignupEnabled(query);
}
