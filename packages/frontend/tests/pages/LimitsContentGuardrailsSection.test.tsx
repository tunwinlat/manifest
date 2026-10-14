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
  await screen.findByRole('form', { name: 'Content guardrails' });
  return { ...result, setAgentName };
}

const phrasesBox = () => screen.getByLabelText(/Blocked phrases/) as HTMLTextAreaElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save guardrails' }));

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

  it('shows the stored config', async () => {
    await renderLoaded();
    expect(mockGet.mock.calls[0][0]).toBe('agent-a');
    expect((screen.getByLabelText(/Enable content guardrails/) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText(/Detect common personal data/) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(phrasesBox().value).toBe('alpha\nbeta');
    expect((screen.getByLabelText(/When a request matches/) as HTMLSelectElement).value).toBe(
      'audit',
    );
    expect((screen.getByLabelText(/Log matches in responses/) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('saves the edited form as a full config', async () => {
    const saved = { ...stored, enabled: false, detect_pii: true, blocked_phrases: ['gamma'] };
    mockUpdate.mockResolvedValue({ config: saved });
    await renderLoaded();

    fireEvent.click(screen.getByLabelText(/Enable content guardrails/));
    fireEvent.click(screen.getByLabelText(/Detect common personal data/));
    fireEvent.click(screen.getByLabelText(/Log matches in responses/));
    fireEvent.input(phrasesBox(), { target: { value: ' gamma \n\n' } });
    fireEvent.change(screen.getByLabelText(/When a request matches/), {
      target: { value: 'block' },
    });
    save();

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('agent-a', {
        enabled: false,
        detect_pii: true,
        blocked_phrases: ['gamma'],
        request_action: 'block',
        audit_responses: false,
      }),
    );
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Content guardrails saved'));
    expect(phrasesBox().value).toBe('gamma');
  });

  it('rejects too many phrases without calling the API', async () => {
    await renderLoaded();
    fireEvent.input(phrasesBox(), {
      target: { value: Array.from({ length: 101 }, (_, i) => `p${i}`).join('\n') },
    });
    save();
    expect((await screen.findByRole('alert')).textContent).toContain('at most 100 blocked phrases');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects an over-long phrase without calling the API', async () => {
    await renderLoaded();
    fireEvent.input(phrasesBox(), { target: { value: 'x'.repeat(201) } });
    save();
    expect((await screen.findByRole('alert')).textContent).toContain('200 characters or fewer');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('leaves the form as-is when the save fails (fetchMutate toasts the error)', async () => {
    mockUpdate.mockRejectedValue(new Error('nope'));
    await renderLoaded();
    save();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save guardrails' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('does not apply a save to a different agent the user switched to', async () => {
    let resolveSave!: (v: unknown) => void;
    mockUpdate.mockReturnValue(new Promise((r) => (resolveSave = r)));
    const { setAgentName } = await renderLoaded('agent-a');
    save();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('agent-a', expect.anything()));

    mockGet.mockResolvedValue({ ...stored, blocked_phrases: ['agent-b phrase'] });
    setAgentName('agent-b');
    await waitFor(() => expect(phrasesBox().value).toBe('agent-b phrase'));

    resolveSave({ config: { ...stored, blocked_phrases: ['agent-a saved'] } });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(phrasesBox().value).toBe('agent-b phrase');
  });

  it('shows a load error instead of a form', async () => {
    mockGet.mockRejectedValue(new Error('500'));
    render(() => <LimitsContentGuardrailsSection agentName={() => 'agent-a'} />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      "Couldn't load content guardrails",
    );
    expect(screen.queryByRole('form')).toBeNull();
  });
});
