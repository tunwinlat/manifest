import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';

const mockGet = vi.fn();
const mockUpdate = vi.fn();
vi.mock('../../src/services/api.js', () => ({
  getContentGuardrails: (...args: unknown[]) => mockGet(...args),
  updateContentGuardrails: (...args: unknown[]) => mockUpdate(...args),
}));

const mockToastSuccess = vi.fn();
vi.mock('../../src/services/toast-store.js', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}));

import LimitsContentGuardrailsSection, {
  parseBlockedPhrases,
} from '../../src/pages/LimitsContentGuardrailsSection';

const stored = {
  enabled: true,
  blocked_phrases: ['alpha', 'beta'],
  detect_pii: false,
  request_action: 'audit' as const,
  audit_responses: true,
};

async function renderLoaded(agent = 'agent-a') {
  const [agentName, setAgentName] = createSignal(agent);
  const result = render(() => <LimitsContentGuardrailsSection agentName={agentName} />);
  await screen.findByRole('switch', { name: 'Check request content' });
  return { ...result, setAgentName };
}

const sw = (name: string) => screen.getByRole('switch', { name });
const phrasesBox = () => screen.getByLabelText(/Blocked phrases/) as HTMLTextAreaElement;
const saveBtn = () => screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;

describe('parseBlockedPhrases', () => {
  it('splits lines, trims and drops blanks', () => {
    expect(parseBlockedPhrases(' a \n\n b\n  ')).toEqual(['a', 'b']);
  });
});

describe('LimitsContentGuardrailsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(stored);
  });
  afterEach(() => cleanup());

  it('shows the stored config with nothing to save yet', async () => {
    await renderLoaded();
    expect(mockGet.mock.calls[0][0]).toBe('agent-a');
    expect(screen.getByRole('heading', { name: 'Content guardrails' })).toBeTruthy();
    expect(sw('Check request content').getAttribute('aria-checked')).toBe('true');
    expect(sw('Detect personal data').getAttribute('aria-checked')).toBe('false');
    expect(sw('Log matches in responses').getAttribute('aria-checked')).toBe('true');
    expect(phrasesBox().value).toBe('alpha\nbeta');
    expect(screen.getByRole('button', { name: 'When a request matches' }).textContent).toContain(
      'Allow it and log the match',
    );
    expect(saveBtn().disabled).toBe(true);
  });

  it('saves the edited settings as a full config', async () => {
    const saved = {
      enabled: false,
      detect_pii: true,
      blocked_phrases: ['gamma'],
      request_action: 'block' as const,
      audit_responses: false,
    };
    mockUpdate.mockResolvedValue({ config: saved });
    await renderLoaded();

    fireEvent.click(sw('Check request content'));
    fireEvent.click(sw('Detect personal data'));
    fireEvent.click(sw('Log matches in responses'));
    fireEvent.input(phrasesBox(), { target: { value: ' gamma \n\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'When a request matches' }));
    fireEvent.click(await screen.findByRole('option', { name: /Block the request/ }));
    expect(sw('Check request content').getAttribute('aria-checked')).toBe('false');
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('agent-a', saved));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Content guardrails saved'));
    expect(phrasesBox().value).toBe('gamma');
    expect(saveBtn().disabled).toBe(true);
  });

  it('can switch the request action back to logging', async () => {
    mockGet.mockResolvedValue({ ...stored, request_action: 'block' });
    mockUpdate.mockResolvedValue({ config: stored });
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'When a request matches' }));
    fireEvent.click(await screen.findByRole('option', { name: /Allow it and log/ }));
    fireEvent.click(saveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'agent-a',
        expect.objectContaining({ request_action: 'audit' }),
      ),
    );
  });

  it('rejects too many phrases without calling the API, and clears the error on edit', async () => {
    await renderLoaded();
    fireEvent.input(phrasesBox(), {
      target: { value: Array.from({ length: 101 }, (_, i) => `p${i}`).join('\n') },
    });
    fireEvent.click(saveBtn());
    expect((await screen.findByRole('alert')).textContent).toContain('at most 100 blocked phrases');
    expect(mockUpdate).not.toHaveBeenCalled();

    fireEvent.input(phrasesBox(), { target: { value: 'ok' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects an over-long phrase without calling the API', async () => {
    await renderLoaded();
    fireEvent.input(phrasesBox(), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(saveBtn());
    expect((await screen.findByRole('alert')).textContent).toContain('200 characters or fewer');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps the edits when the save fails (fetchMutate toasts the error)', async () => {
    mockUpdate.mockRejectedValue(new Error('nope'));
    await renderLoaded();
    fireEvent.click(sw('Detect personal data'));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    expect(sw('Detect personal data').getAttribute('aria-checked')).toBe('true');
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('does not apply a save to a different agent the user switched to', async () => {
    let resolveSave!: (v: unknown) => void;
    mockUpdate.mockReturnValue(new Promise((r) => (resolveSave = r)));
    const { setAgentName } = await renderLoaded('agent-a');
    fireEvent.click(sw('Detect personal data'));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('agent-a', expect.anything()));

    mockGet.mockResolvedValue({ ...stored, blocked_phrases: ['agent-b phrase'] });
    setAgentName('agent-b');
    await waitFor(() => expect(phrasesBox().value).toBe('agent-b phrase'));

    resolveSave({ config: { ...stored, blocked_phrases: ['agent-a saved'] } });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(phrasesBox().value).toBe('agent-b phrase');
  });

  it('shows a load error instead of the settings', async () => {
    mockGet.mockRejectedValue(new Error('500'));
    render(() => <LimitsContentGuardrailsSection agentName={() => 'agent-a'} />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      "Couldn't load content guardrails",
    );
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
