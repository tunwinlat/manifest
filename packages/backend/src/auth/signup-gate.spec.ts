import {
  isProvisioning,
  isPublicSignupEnabled,
  isSignupAllowed,
  runAsProvisioning,
} from './signup-gate';

describe('signup-gate', () => {
  const queryReturning = (count: number, publicSignup?: boolean | Error) =>
    jest.fn(async (sql: string) => {
      if (sql.includes('FROM "user"')) return [{ count: String(count) }];
      if (publicSignup instanceof Error) throw publicSignup;
      return publicSignup === undefined ? [] : [{ public_signup: publicSignup }];
    });

  it('marks provisioning only inside runAsProvisioning', async () => {
    expect(isProvisioning()).toBe(false);
    await expect(runAsProvisioning(async () => isProvisioning())).resolves.toBe(true);
    expect(isProvisioning()).toBe(false);
  });

  it('always allows the first account', async () => {
    await expect(isSignupAllowed(queryReturning(0))).resolves.toBe(true);
  });

  it('allows server-side provisioning without querying', async () => {
    const query = queryReturning(3, false);
    await expect(runAsProvisioning(() => isSignupAllowed(query))).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('follows the public sign-up switch once users exist', async () => {
    await expect(isSignupAllowed(queryReturning(1, false))).resolves.toBe(false);
    await expect(isSignupAllowed(queryReturning(1, true))).resolves.toBe(true);
    await expect(isSignupAllowed(queryReturning(1))).resolves.toBe(false);
  });

  it('fails closed when the settings table cannot be read', async () => {
    await expect(isPublicSignupEnabled(queryReturning(1, new Error('no table')))).resolves.toBe(
      false,
    );
  });

  it('treats a missing count row as an empty install', async () => {
    await expect(isSignupAllowed(jest.fn(async () => []))).resolves.toBe(true);
  });
});
