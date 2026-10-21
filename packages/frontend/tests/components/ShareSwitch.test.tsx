import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';

const setConnectionSharing = vi.fn();
vi.mock('../../src/services/api/sharing.js', () => ({
  setConnectionSharing: (id: string, shared: boolean) => setConnectionSharing(id, shared),
}));
const toastSuccess = vi.fn();
vi.mock('../../src/services/toast-store.js', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: vi.fn() },
}));

import ShareSwitch from '../../src/components/ShareSwitch';

describe('ShareSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setConnectionSharing.mockResolvedValue({});
  });

  it('turns sharing on without opening the connection row', async () => {
    const rowClick = vi.fn();
    render(() => (
      <div onClick={rowClick} onKeyDown={rowClick}>
        <ShareSwitch connectionId="c1" label="Work" shared={false} />
      </div>
    ));
    const toggle = screen.getByRole('switch', { name: 'Share Work with other users' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(setConnectionSharing).toHaveBeenCalledWith('c1', true);
    expect(toastSuccess).toHaveBeenCalledWith('Work is now shared with other users');
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('turns sharing off', async () => {
    render(() => <ShareSwitch connectionId="c2" label="Work" shared />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('title')).toContain('Other users can route');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    expect(toastSuccess).toHaveBeenCalledWith('Work is no longer shared');
  });

  it('keeps a toggle across a row re-render', async () => {
    const { unmount } = render(() => <ShareSwitch connectionId="c4" label="Work" shared={false} />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() =>
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'),
    );
    unmount();
    render(() => <ShareSwitch connectionId="c4" label="Work" shared={false} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the previous state when the request fails', async () => {
    setConnectionSharing.mockRejectedValue(new Error('nope'));
    render(() => <ShareSwitch connectionId="c3" label="Work" shared={false} />);
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    await waitFor(() => expect(setConnectionSharing).toHaveBeenCalled());
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });
});
