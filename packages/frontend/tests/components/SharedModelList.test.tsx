import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import SharedModelList from '../../src/components/SharedModelList';

const connection = {
  id: 'c1',
  provider: 'anthropic',
  auth_type: 'subscription' as const,
  label: 'Work',
  owner_name: '',
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
      quality_score: 5,
    },
    {
      model_name: 'claude-haiku',
      display_name: null,
      provider: 'anthropic',
      auth_type: 'subscription' as const,
      context_window: 200000,
      capability_reasoning: false,
      capability_code: true,
      quality_score: 3,
    },
  ],
};

describe('SharedModelList', () => {
  it('groups models by shared connection and reports the pick', () => {
    const onSelect = vi.fn();
    render(() => <SharedModelList connections={[connection]} onSelect={onSelect} />);
    expect(screen.getByText(/· Work/)).toBeDefined();
    expect(screen.getByText('Shared by ada@x.io')).toBeDefined();
    fireEvent.click(screen.getByText('claude-haiku'));
    expect(onSelect).toHaveBeenCalledWith('claude-haiku', connection);
    expect(screen.getByText('Claude Sonnet 4.5')).toBeDefined();
  });

  it('explains how sharing works when nothing is shared', () => {
    render(() => (
      <SharedModelList connections={[{ ...connection, models: [] }]} onSelect={vi.fn()} />
    ));
    expect(screen.getByText(/No other user shares a subscription yet/)).toBeDefined();
  });
});
