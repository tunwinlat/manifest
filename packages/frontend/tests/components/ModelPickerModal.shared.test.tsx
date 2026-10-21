import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';

vi.mock('../../src/services/toast-store.js', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ModelPickerModal from '../../src/components/ModelPickerModal';
import type { AvailableModel, RoutingProvider } from '../../src/services/api';

const ownModels: AvailableModel[] = [
  {
    model_name: 'gpt-4o',
    provider: 'openai',
    auth_type: 'api_key',
    input_price_per_token: 0.000005,
    output_price_per_token: 0.000015,
    context_window: 128000,
    capability_reasoning: false,
    capability_code: true,
    quality_score: 8,
    display_name: 'GPT-4o',
  },
];
const apiKey: RoutingProvider[] = [
  {
    id: 'p1',
    provider: 'openai',
    auth_type: 'api_key',
    is_active: true,
    has_api_key: true,
    label: 'Default',
    priority: 0,
    connected_at: '2025-01-01',
  },
];
const shared = [
  {
    id: 'c1',
    provider: 'anthropic',
    auth_type: 'subscription' as const,
    label: 'Work',
    owner_name: 'Ada',
    owner_email: 'ada@x.io',
    models: [
      {
        model_name: 'claude-sonnet-4-5',
        display_name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        auth_type: 'subscription' as const,
        context_window: 200000,
        capability_reasoning: true,
        capability_code: true,
        quality_score: 9,
      },
    ],
  },
];

describe('ModelPickerModal — Shared with me (fork)', () => {
  it('adds a Shared with me tab next to the user’s own models', () => {
    const onSelectShared = vi.fn();
    render(() => (
      <ModelPickerModal
        tierId="default"
        models={ownModels}
        tiers={[]}
        connectedProviders={apiKey}
        sharedConnections={shared}
        onSelectShared={onSelectShared}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    ));
    expect(screen.getByText('GPT-4o')).toBeDefined();
    const tab = screen.getByRole('tab', { name: 'Shared with me' });
    expect(tab.getAttribute('aria-selected')).toBe('false');
    fireEvent.click(tab);
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('GPT-4o')).toBeNull();
    fireEvent.click(screen.getByText('Claude Sonnet 4.5'));
    expect(onSelectShared).toHaveBeenCalledWith('default', 'claude-sonnet-4-5', shared[0]);
    fireEvent.click(screen.getByRole('tab', { name: /Usage-based/ }));
    expect(screen.getByText('GPT-4o')).toBeDefined();
  });

  it('opens on shared models when the user has no connection of their own', () => {
    render(() => (
      <ModelPickerModal
        tierId="default"
        models={[]}
        tiers={[]}
        connectedProviders={[]}
        sharedConnections={shared}
        onSelectShared={vi.fn()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    ));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('Claude Sonnet 4.5')).toBeDefined();
    const ownEmptyState = screen.queryByText(/No API key providers connected/);
    expect(
      (ownEmptyState?.closest('.routing-modal__list') as HTMLElement | null)?.style.display,
    ).toBe('none');
  });

  it('offers no shared tab without a shared-selection handler', () => {
    render(() => (
      <ModelPickerModal
        tierId="default"
        models={ownModels}
        tiers={[]}
        connectedProviders={apiKey}
        sharedConnections={shared}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    ));
    expect(screen.queryByRole('tab', { name: 'Shared with me' })).toBeNull();
  });
});
