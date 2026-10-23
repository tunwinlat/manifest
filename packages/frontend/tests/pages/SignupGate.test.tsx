import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@solidjs/testing-library';

let mockSearchParams: Record<string, string> = {};
vi.mock('@solidjs/router', () => ({
  A: (props: { href: string; children: unknown }) => (
    <a href={props.href}>{props.children as never}</a>
  ),
  useLocation: () => ({ search: '?next=%2Fx' }),
  useSearchParams: () => [mockSearchParams],
}));
vi.mock('@solidjs/meta', () => ({ Title: () => null }));
let mockEnabled = true;
vi.mock('../../src/services/setup-status.js', () => ({
  checkSignupEnabled: () => Promise.resolve(mockEnabled),
}));
vi.mock('../../src/pages/Register.jsx', () => ({ default: () => <div>register form</div> }));

import SignupGate from '../../src/pages/SignupGate';

describe('SignupGate', () => {
  beforeEach(() => {
    mockSearchParams = {};
    mockEnabled = true;
  });

  it('shows the sign-up form while sign-up is open', async () => {
    render(() => <SignupGate />);
    await waitFor(() => expect(screen.getByText('register form')).toBeDefined());
  });

  it('explains who to ask once sign-up is closed', async () => {
    mockEnabled = false;
    const { container } = render(() => <SignupGate />);
    await waitFor(() => expect(screen.getByText('Sign-up is closed')).toBeDefined());
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/login?next=%2Fx');
  });

  it('keeps the post-signup plan step reachable', async () => {
    mockEnabled = false;
    mockSearchParams = { step: 'plan' };
    render(() => <SignupGate />);
    await waitFor(() => expect(screen.getByText('register form')).toBeDefined());
  });
});
