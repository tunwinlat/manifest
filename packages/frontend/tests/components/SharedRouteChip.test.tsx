import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';

const [connections, setConnections] = createSignal<unknown[] | null>(null);
const loadSharedConnections = vi.fn();
vi.mock('../../src/services/shared-connections.js', () => ({
  loadSharedConnections: () => loadSharedConnections(),
  sharedConnections: () => connections(),
  findSharedConnection: (id: string) =>
    (connections() as Array<{ id: string }> | null)?.find((c) => c.id === id),
}));

import SharedRouteChip from '../../src/components/SharedRouteChip';

const route = {
  provider: 'anthropic',
  authType: 'subscription' as const,
  model: 'claude',
  sharedConnectionId: 'c1',
};

describe('SharedRouteChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setConnections(null);
  });

  it('renders nothing for an own route', () => {
    const { container } = render(() => (
      <SharedRouteChip route={{ provider: 'openai', authType: 'api_key', model: 'gpt' }} />
    ));
    expect(container.textContent).toBe('');
    expect(loadSharedConnections).not.toHaveBeenCalled();
  });

  it('names the owner once the shared list is loaded', async () => {
    render(() => <SharedRouteChip route={route} />);
    expect(loadSharedConnections).toHaveBeenCalled();
    expect(screen.getByText('Shared')).toBeDefined();
    setConnections([{ id: 'c1', label: 'Work', owner_name: 'Ada', owner_email: 'a@x.io' }]);
    await waitFor(() => expect(screen.getByText(/Shared · Ada/)).toBeDefined());
    expect(screen.getByText(/Shared · Ada/).getAttribute('title')).toBe(
      'Runs on Ada\'s "Work" subscription',
    );
  });

  it('warns when the owner stopped sharing', async () => {
    setConnections([]);
    render(() => <SharedRouteChip route={route} />);
    await waitFor(() => expect(screen.getByText('No longer shared')).toBeDefined());
  });
});
