import { ForbiddenException } from '@nestjs/common';
import { AdminGuard, requestUserId } from './admin.guard';

const contextFor = (request: object) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

describe('AdminGuard', () => {
  it('reads the user from the tenant context, then from request.user', () => {
    expect(requestUserId({ tenantContext: { tenantId: 't', userId: 'u1' } } as never)).toBe('u1');
    expect(requestUserId({ user: { id: 'u2' } } as never)).toBe('u2');
    expect(requestUserId({ tenantContext: { userId: '' }, user: {} } as never)).toBeNull();
  });

  it('lets administrators through', async () => {
    const users = { isAdmin: jest.fn().mockResolvedValue(true) };
    const guard = new AdminGuard(users as never);
    await expect(guard.canActivate(contextFor({ user: { id: 'boss' } }))).resolves.toBe(true);
    expect(users.isAdmin).toHaveBeenCalledWith('boss');
  });

  it('refuses everyone else, including credentials without a user', async () => {
    const users = { isAdmin: jest.fn().mockResolvedValue(false) };
    const guard = new AdminGuard(users as never);
    await expect(guard.canActivate(contextFor({ user: { id: 'u' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
