import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';

vi.mock('@solidjs/meta', () => ({ Title: () => null, Meta: () => null }));

vi.mock('../../../src/services/auth-client.js', () => ({
  authClient: { useSession: () => () => ({ data: { user: { id: 'boss' } } }) },
}));

const toastSuccess = vi.fn();
vi.mock('../../../src/services/toast-store.js', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}));

const resetSetupStatus = vi.fn();
vi.mock('../../../src/services/setup-status.js', () => ({
  resetSetupStatus: () => resetSetupStatus(),
}));

const api = {
  checkIsAdmin: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUserRole: vi.fn(),
  removeUser: vi.fn(),
  getInstanceSettings: vi.fn(),
  updateInstanceSettings: vi.fn(),
};
vi.mock('../../../src/services/api/admin.js', () => ({
  checkIsAdmin: () => api.checkIsAdmin(),
  listUsers: () => api.listUsers(),
  createUser: (i: unknown) => api.createUser(i),
  updateUserRole: (id: string, role: string) => api.updateUserRole(id, role),
  removeUser: (id: string) => api.removeUser(id),
  getInstanceSettings: () => api.getInstanceSettings(),
  updateInstanceSettings: (s: unknown) => api.updateInstanceSettings(s),
}));

import Users, { formatJoined } from '../../../src/pages/admin/Users';

const boss = {
  id: 'boss',
  name: 'Tun',
  email: 'tun@x.io',
  createdAt: '2026-10-01T00:00:00.000Z',
  role: 'admin' as const,
  harnessCount: 3,
  subscriptionCount: 2,
  sharedSubscriptionCount: 1,
};
const grace = {
  ...boss,
  id: 'grace',
  name: 'Grace',
  email: 'grace@x.io',
  role: 'user' as const,
  sharedSubscriptionCount: 0,
};

describe('Administration → Users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.checkIsAdmin.mockResolvedValue(true);
    api.listUsers.mockResolvedValue({ users: [boss, grace] });
    api.getInstanceSettings.mockResolvedValue({ publicSignup: false });
    api.createUser.mockResolvedValue(grace);
    api.updateUserRole.mockResolvedValue(grace);
    api.removeUser.mockResolvedValue({ ok: true });
    api.updateInstanceSettings.mockResolvedValue({ publicSignup: true });
  });

  it('lists users with role, counts and actions only for others', async () => {
    const { container } = render(() => <Users />);
    await waitFor(() => expect(screen.getByText('grace@x.io')).toBeDefined());
    expect(screen.getByText('You')).toBeDefined();
    expect(screen.getByText('Administrator')).toBeDefined();
    expect(container.textContent).toContain('(1 shared)');
    expect(screen.getAllByText('Remove')).toHaveLength(1);
  });

  it('explains the page to non-administrators', async () => {
    api.checkIsAdmin.mockResolvedValue(false);
    render(() => <Users />);
    await waitFor(() =>
      expect(screen.getByText(/Only administrators can manage users/)).toBeDefined(),
    );
    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it('adds a user', async () => {
    render(() => <Users />);
    await waitFor(() => expect(screen.getByText('grace@x.io')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    const addButton = () => screen.getAllByRole('button', { name: 'Add user' }).at(-1)!;
    expect((addButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'ada@x.io' } });
    fireEvent.input(screen.getByLabelText('Temporary password'), {
      target: { value: 'password1' },
    });
    fireEvent.click(screen.getByLabelText('Make this user an administrator'));
    fireEvent.click(addButton());
    await waitFor(() =>
      expect(api.createUser).toHaveBeenCalledWith({
        name: 'Ada',
        email: 'ada@x.io',
        password: 'password1',
        role: 'admin',
      }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Ada can now sign in'));
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });

  it('keeps the dialog open when creation fails', async () => {
    api.createUser.mockRejectedValue(new Error('exists'));
    render(() => <Users />);
    await waitFor(() => expect(screen.getByText('grace@x.io')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'ada@x.io' } });
    fireEvent.input(screen.getByLabelText('Temporary password'), {
      target: { value: 'password1' },
    });
    fireEvent.keyDown(screen.getByLabelText('Temporary password'), { key: 'Enter' });
    await waitFor(() => expect(api.createUser).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('changes a role', async () => {
    render(() => <Users />);
    await waitFor(() => expect(screen.getByText('Make administrator')).toBeDefined());
    fireEvent.click(screen.getByText('Make administrator'));
    await waitFor(() => expect(api.updateUserRole).toHaveBeenCalledWith('grace', 'admin'));
    expect(toastSuccess).toHaveBeenCalledWith('Grace is now an administrator');
  });

  it('demotes an administrator and survives a failed role change', async () => {
    api.listUsers.mockResolvedValue({ users: [boss, { ...grace, role: 'admin' }] });
    api.updateUserRole.mockRejectedValueOnce(new Error('nope'));
    render(() => <Users />);
    await waitFor(() => expect(screen.getByText('Make user')).toBeDefined());
    fireEvent.click(screen.getByText('Make user'));
    await waitFor(() => expect(api.updateUserRole).toHaveBeenCalledWith('grace', 'user'));
    expect(toastSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Make user'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Grace is now a user'));
  });

  it('removes a user only after the email is typed', async () => {
    render(() => <Users />);
    await waitFor(() => expect(screen.getByText('Remove')).toBeDefined());
    fireEvent.click(screen.getByText('Remove'));
    const confirm = screen.getByRole('button', { name: 'Remove user' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const input = screen.getByLabelText(/To confirm, type/);
    fireEvent.input(input, { target: { value: 'grace@x.io' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(api.removeUser).toHaveBeenCalledWith('grace'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Grace was removed'));
  });

  it('keeps the confirmation open when removal fails, and closes on Escape', async () => {
    api.removeUser.mockRejectedValue(new Error('nope'));
    render(() => <Users />);
    await waitFor(() => expect(screen.getByText('Remove')).toBeDefined());
    fireEvent.click(screen.getByText('Remove'));
    const input = screen.getByLabelText(/To confirm, type/);
    fireEvent.input(input, { target: { value: 'grace@x.io' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove user' }));
    await waitFor(() => expect(api.removeUser).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('toggles public sign-up', async () => {
    render(() => <Users />);
    const toggle = await screen.findByRole('switch', { name: 'Allow public sign-up' });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(api.updateInstanceSettings).toHaveBeenCalledWith({ publicSignup: true }),
    );
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(resetSetupStatus).toHaveBeenCalled();
  });

  it('survives a failed sign-up toggle', async () => {
    api.updateInstanceSettings.mockRejectedValue(new Error('nope'));
    render(() => <Users />);
    const toggle = await screen.findByRole('switch', { name: 'Allow public sign-up' });
    fireEvent.click(toggle);
    await waitFor(() => expect(api.updateInstanceSettings).toHaveBeenCalled());
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('formats join dates and tolerates bad ones', () => {
    expect(formatJoined('2026-10-01T00:00:00.000Z')).not.toBe('');
    expect(formatJoined('not a date')).toBe('');
  });
});
