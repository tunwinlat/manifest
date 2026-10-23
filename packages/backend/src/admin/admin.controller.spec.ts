import { AdminAccessController, AdminController } from './admin.controller';

describe('Admin controllers', () => {
  const users = {
    isAdmin: jest.fn(),
    listUsers: jest.fn().mockResolvedValue([{ id: 'u1' }]),
    createUser: jest.fn().mockResolvedValue({ id: 'u2' }),
    setRole: jest.fn().mockResolvedValue({ id: 'u2', role: 'admin' }),
    removeUser: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockResolvedValue({ publicSignup: false }),
    updateSettings: jest.fn().mockResolvedValue({ publicSignup: true }),
  };
  const request = { tenantContext: { tenantId: 't1', userId: 'boss' } } as never;

  it('reports admin access for the caller', async () => {
    const controller = new AdminAccessController(users as never);
    users.isAdmin.mockResolvedValueOnce(true);
    await expect(controller.access(request)).resolves.toEqual({ isAdmin: true });
    await expect(controller.access({} as never)).resolves.toEqual({ isAdmin: false });
  });

  it('delegates user management to the service with the acting user', async () => {
    const controller = new AdminController(users as never);
    await expect(controller.listUsers()).resolves.toEqual({ users: [{ id: 'u1' }] });
    const body = { name: 'Grace', email: 'g@x.io', password: 'password1' };
    await expect(controller.createUser(body)).resolves.toEqual({ id: 'u2' });
    await controller.updateRole(request, { userId: 'u2' }, { role: 'admin' });
    expect(users.setRole).toHaveBeenCalledWith('boss', 'u2', 'admin');
    await expect(controller.removeUser(request, { userId: 'u2' })).resolves.toEqual({ ok: true });
    expect(users.removeUser).toHaveBeenCalledWith('boss', 'u2');
    await expect(controller.getSettings()).resolves.toEqual({ publicSignup: false });
    await expect(controller.updateSettings({ publicSignup: true })).resolves.toEqual({
      publicSignup: true,
    });
  });
});
