import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Title, Meta } from '@solidjs/meta';
import { authClient } from '../../services/auth-client.js';
import {
  checkIsAdmin,
  createUser,
  getInstanceSettings,
  listUsers,
  removeUser,
  updateInstanceSettings,
  updateUserRole,
  type AdminUser,
  type UserRole,
} from '../../services/api/admin.js';
import { resetSetupStatus } from '../../services/setup-status.js';
import { toast } from '../../services/toast-store.js';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatJoined(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** Fork: Administration → Users. Only administrators reach the content. */
const Users: Component = () => {
  const session = authClient.useSession();
  const currentUserId = () => session()?.data?.user?.id ?? '';
  const [isAdmin] = createResource(checkIsAdmin);
  const [users, { refetch }] = createResource(
    () => isAdmin() === true,
    async () => (await listUsers()).users,
  );
  const [settings, { mutate: setSettings }] = createResource(
    () => isAdmin() === true,
    getInstanceSettings,
  );

  const [addOpen, setAddOpen] = createSignal(false);
  const [name, setName] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [role, setRole] = createSignal<UserRole>('user');
  const [adding, setAdding] = createSignal(false);
  const [removing, setRemoving] = createSignal<AdminUser | null>(null);
  const [confirmEmail, setConfirmEmail] = createSignal('');
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [signupBusy, setSignupBusy] = createSignal(false);

  const openAdd = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
    setAddOpen(true);
  };

  const canAdd = () =>
    name().trim().length >= 2 && email().includes('@') && password().length >= 8 && !adding();

  const handleAdd = async () => {
    if (!canAdd()) return;
    setAdding(true);
    try {
      await createUser({
        name: name().trim(),
        email: email().trim(),
        password: password(),
        role: role(),
      });
      toast.success(`${name().trim()} can now sign in`);
      setAddOpen(false);
      await refetch();
    } catch {
      // fetchMutate already showed the error toast.
    } finally {
      setAdding(false);
    }
  };

  const handleRole = async (user: AdminUser, next: UserRole) => {
    setBusyId(user.id);
    try {
      await updateUserRole(user.id, next);
      toast.success(
        next === 'admin' ? `${user.name} is now an administrator` : `${user.name} is now a user`,
      );
      await refetch();
    } catch {
      // toast shown by fetchMutate
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async () => {
    const user = removing();
    if (!user || confirmEmail() !== user.email) return;
    setBusyId(user.id);
    try {
      await removeUser(user.id);
      toast.success(`${user.name} was removed`);
      setRemoving(null);
      await refetch();
    } catch {
      // toast shown by fetchMutate
    } finally {
      setBusyId(null);
    }
  };

  const toggleSignup = async () => {
    const next = !(settings()?.publicSignup ?? false);
    setSignupBusy(true);
    try {
      setSettings(await updateInstanceSettings({ publicSignup: next }));
      resetSetupStatus();
      toast.success(next ? 'Anyone with the link can now sign up' : 'Sign-up is now closed');
    } catch {
      // toast shown by fetchMutate
    } finally {
      setSignupBusy(false);
    }
  };

  return (
    <div class="container--lg">
      <Title>Users - Manifest</Title>
      <Meta name="description" content="Add and remove the people who use this Manifest." />
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Users</h1>
          <p class="page-header__subtitle">
            The people who use this Manifest. Each user has their own harnesses and subscriptions.
          </p>
        </div>
        <Show when={isAdmin() === true}>
          <button class="btn btn--primary btn--sm" onClick={openAdd}>
            Add user
          </button>
        </Show>
      </div>

      <Show
        when={isAdmin() === true}
        fallback={
          <Show when={isAdmin() === false}>
            <div class="panel">
              <p class="admin-users__empty">
                Only administrators can manage users. Ask an administrator of this Manifest for
                access.
              </p>
            </div>
          </Show>
        }
      >
        <div class="panel" style="padding: 0; overflow-x: auto;">
          <table class="data-table admin-users__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Harnesses</th>
                <th>Subscriptions</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={users() ?? []}>
                {(user) => {
                  const isSelf = () => user.id === currentUserId();
                  return (
                    <tr>
                      <td>
                        <div class="admin-users__name">
                          {user.name}
                          <Show when={isSelf()}>
                            <span class="status-badge status-badge--neutral">You</span>
                          </Show>
                        </div>
                        <div class="admin-users__email">{user.email}</div>
                      </td>
                      <td>
                        <span
                          class="status-badge"
                          classList={{
                            'status-badge--ok': user.role === 'admin',
                            'status-badge--neutral': user.role !== 'admin',
                          }}
                        >
                          {user.role === 'admin' ? 'Administrator' : 'User'}
                        </span>
                      </td>
                      <td>{user.harnessCount}</td>
                      <td>
                        {user.subscriptionCount}
                        <Show when={user.sharedSubscriptionCount > 0}>
                          <span class="admin-users__shared">
                            {' '}
                            ({user.sharedSubscriptionCount} shared)
                          </span>
                        </Show>
                      </td>
                      <td>{formatJoined(user.createdAt)}</td>
                      <td>
                        <Show when={!isSelf()}>
                          <div class="admin-users__actions">
                            <button
                              class="btn btn--outline btn--sm"
                              disabled={busyId() === user.id}
                              onClick={() =>
                                void handleRole(user, user.role === 'admin' ? 'user' : 'admin')
                              }
                            >
                              {user.role === 'admin' ? 'Make user' : 'Make administrator'}
                            </button>
                            <button
                              class="btn btn--danger btn--sm"
                              disabled={busyId() === user.id}
                              onClick={() => {
                                setConfirmEmail('');
                                setRemoving(user);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </Show>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>

        <h2 class="settings-section__title" style="margin-top: var(--gap-xl);">
          Sign-up
        </h2>
        <div class="settings-card">
          <div class="settings-card__row">
            <div class="settings-card__label">
              <span class="settings-card__label-title">Allow public sign-up</span>
              <span class="settings-card__label-desc">
                When on, anyone who can reach this Manifest can create an account and route through
                the subscriptions users share. Leave it off to add every user yourself.
              </span>
            </div>
            <div class="settings-card__control settings-card__control--end">
              <button
                type="button"
                role="switch"
                aria-checked={settings()?.publicSignup === true}
                aria-label="Allow public sign-up"
                class="settings-switch"
                classList={{ 'settings-switch--on': settings()?.publicSignup === true }}
                disabled={signupBusy() || settings.loading}
                onClick={() => void toggleSignup()}
              >
                <span class="settings-switch__track">
                  <span class="settings-switch__thumb" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={addOpen()}>
        <div
          class="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddOpen(false);
          }}
        >
          <div
            class="modal-card"
            style="max-width: 460px;"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAddOpen(false);
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) void handleAdd();
            }}
          >
            <h2 class="modal-card__title" id="add-user-title">
              Add user
            </h2>
            <p class="modal-card__desc">
              Share the email and password with them. They can change the password from Account
              Preferences after signing in.
            </p>
            <label class="modal-card__field-label" for="add-user-name">
              Name
            </label>
            <input
              ref={(el) => requestAnimationFrame(() => el.focus())}
              id="add-user-name"
              class="modal-card__input"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              disabled={adding()}
            />
            <label class="modal-card__field-label" for="add-user-email">
              Email
            </label>
            <input
              id="add-user-email"
              class="modal-card__input"
              type="email"
              autocomplete="off"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              disabled={adding()}
            />
            <label class="modal-card__field-label" for="add-user-password">
              Temporary password
            </label>
            <input
              id="add-user-password"
              class="modal-card__input"
              type="password"
              autocomplete="new-password"
              placeholder="At least 8 characters"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              disabled={adding()}
            />
            <label class="admin-users__checkbox">
              <input
                type="checkbox"
                checked={role() === 'admin'}
                onChange={(e) => setRole(e.currentTarget.checked ? 'admin' : 'user')}
                disabled={adding()}
              />
              Make this user an administrator
            </label>
            <div class="modal-card__footer">
              <button class="btn btn--ghost btn--sm" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button
                class="btn btn--primary btn--sm"
                disabled={!canAdd()}
                onClick={() => void handleAdd()}
              >
                {adding() ? <span class="spinner" /> : 'Add user'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={removing()}>
        {(user) => (
          <div
            class="modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setRemoving(null);
            }}
          >
            <div
              class="modal-card"
              style="max-width: 440px;"
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-user-title"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRemoving(null);
                if (e.key === 'Enter' && e.target instanceof HTMLInputElement) void handleRemove();
              }}
            >
              <h2 class="modal-card__title" id="remove-user-title">
                Remove {user().name}
              </h2>
              <p class="modal-card__desc">
                This permanently deletes their account, harnesses, subscriptions, and request
                history. Harnesses of other users that route through a subscription they share will
                fall back to their next route. This cannot be undone.
              </p>
              <label class="modal-card__field-label" for="remove-user-confirm">
                To confirm, type <strong>{user().email}</strong>
              </label>
              <input
                ref={(el) => requestAnimationFrame(() => el.focus())}
                id="remove-user-confirm"
                class="modal-card__input"
                type="text"
                autocomplete="off"
                value={confirmEmail()}
                onInput={(e) => setConfirmEmail(e.currentTarget.value)}
              />
              <div class="modal-card__footer">
                <button class="btn btn--ghost btn--sm" onClick={() => setRemoving(null)}>
                  Cancel
                </button>
                <button
                  class="btn btn--danger btn--sm"
                  disabled={confirmEmail() !== user().email || busyId() === user().id}
                  onClick={() => void handleRemove()}
                >
                  {busyId() === user().id ? <span class="spinner" /> : 'Remove user'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default Users;
