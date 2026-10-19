import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import RoutingRemovalModal from '../../src/components/RoutingRemovalModal';
import {
  confirmRoutingRemoval,
  describeRouteSurface,
  groupByHarness,
  isProviderInRoutingBody,
  pendingRoutingRemoval,
  type AffectedRoute,
} from '../../src/services/routing-removal-confirm';

const route = (over: Partial<AffectedRoute>): AffectedRoute => ({
  agentName: 'Support Bot',
  surface: 'tier',
  name: 'default',
  model: 'claude-opus-5',
  position: 'primary',
  replacement: null,
  ...over,
});

const affected: AffectedRoute[] = [
  route({ replacement: 'gpt-6' }),
  route({ model: 'claude-sonnet-5', position: 'fallback 1' }),
  route({ agentName: 'Coder', surface: 'header', name: 'Batch jobs' }),
  route({ agentName: 'Support Bot', surface: 'specificity', name: 'data_analysis' }),
];

afterEach(() => {
  pendingRoutingRemoval()?.resolve(false);
  cleanup();
});

describe('routing removal confirmation store', () => {
  it('resolves with the user answer and clears the pending request', async () => {
    const answer = confirmRoutingRemoval(affected);
    expect(pendingRoutingRemoval()?.affected).toBe(affected);
    pendingRoutingRemoval()!.resolve(true);
    await expect(answer).resolves.toBe(true);
    expect(pendingRoutingRemoval()).toBeNull();
  });

  it('cancels an open request when a new one arrives', async () => {
    const first = confirmRoutingRemoval(affected);
    const second = confirmRoutingRemoval([affected[0]]);
    await expect(first).resolves.toBe(false);
    expect(pendingRoutingRemoval()?.affected).toEqual([affected[0]]);
    pendingRoutingRemoval()!.resolve(true);
    await expect(second).resolves.toBe(true);
  });

  it.each([
    [{ code: 'provider_in_routing', affected }, true],
    [{ code: 'provider_in_routing', affected: [] }, false],
    [{ code: 'other', affected }, false],
    [{ code: 'provider_in_routing' }, false],
    [null, false],
    ['text', false],
  ])('recognises the provider-in-routing body (%#)', (body, expected) => {
    expect(isProviderInRoutingBody(body)).toBe(expected);
  });

  it.each([
    [{ surface: 'tier', name: 'default' }, 'Default routing'],
    [{ surface: 'tier', name: 'complex' }, 'Complex tier'],
    [{ surface: 'specificity', name: 'web_browsing' }, 'Task routing: web browsing'],
    [{ surface: 'header', name: 'Batch jobs' }, 'Custom tier “Batch jobs”'],
  ] as const)('labels %o as %p', (where, label) => {
    expect(describeRouteSurface(where)).toBe(label);
  });

  it('groups routes by harness in order', () => {
    expect(groupByHarness(affected).map(([name, routes]) => [name, routes.length])).toEqual([
      ['Support Bot', 3],
      ['Coder', 1],
    ]);
  });
});

describe('RoutingRemovalModal', () => {
  it('renders nothing until a confirmation is requested', () => {
    render(() => <RoutingRemovalModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every harness and route with what happens to removed primaries', () => {
    render(() => <RoutingRemovalModal />);
    void confirmRoutingRemoval(affected);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('used in 2 harnesses');
    expect(screen.getByText('Support Bot')).toBeTruthy();
    expect(screen.getByText('Coder')).toBeTruthy();
    const items = screen
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('routing-removal__route'));
    expect(items.map((li) => li.textContent)).toEqual([
      'Default routing · primary · claude-opus-5 (gpt-6 becomes the primary model)',
      'Default routing · fallback 1 · claude-sonnet-5',
      'Task routing: data analysis · primary · claude-opus-5 (no fallback left; Manifest picks a model automatically)',
      'Custom tier “Batch jobs” · primary · claude-opus-5 (no fallback left; Manifest picks a model automatically)',
    ]);
  });

  it('uses the singular for one harness', () => {
    render(() => <RoutingRemovalModal />);
    void confirmRoutingRemoval([affected[0]]);
    expect(screen.getByRole('dialog').textContent).toContain('used in 1 harness.');
  });

  it('confirms with "Remove and disconnect"', async () => {
    render(() => <RoutingRemovalModal />);
    const answer = confirmRoutingRemoval(affected);
    fireEvent.click(screen.getByRole('button', { name: 'Remove and disconnect' }));
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['the Cancel button', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    [
      'a click outside the dialog',
      () => fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement),
    ],
  ])('cancels with %s', async (_label, act) => {
    render(() => <RoutingRemovalModal />);
    const answer = confirmRoutingRemoval(affected);
    act();
    await expect(answer).resolves.toBe(false);
  });

  it('ignores clicks inside the dialog and other keys', () => {
    render(() => <RoutingRemovalModal />);
    void confirmRoutingRemoval(affected);
    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(pendingRoutingRemoval()).not.toBeNull();
  });
});
