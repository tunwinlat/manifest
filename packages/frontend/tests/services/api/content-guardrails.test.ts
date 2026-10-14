import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchJsonMock, fetchMutateMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
  fetchMutateMock: vi.fn(),
}));

vi.mock('../../../src/services/api/core.js', () => ({
  fetchJson: fetchJsonMock,
  fetchMutate: fetchMutateMock,
}));

import {
  getContentGuardrails,
  updateContentGuardrails,
  type ContentGuardrailConfig,
} from '../../../src/services/api/content-guardrails';

const config: ContentGuardrailConfig = {
  enabled: true,
  blocked_phrases: ['secret'],
  detect_pii: false,
  request_action: 'block',
  audit_responses: true,
};

describe('content guardrails API client', () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
    fetchMutateMock.mockReset();
  });

  it('getContentGuardrails GETs the agent config and unwraps it', async () => {
    fetchJsonMock.mockResolvedValue({ config });
    await expect(getContentGuardrails('my agent')).resolves.toEqual(config);
    expect(fetchJsonMock).toHaveBeenCalledWith('/agents/my%20agent/content-guardrails');
  });

  it('updateContentGuardrails PUTs the full config as JSON', async () => {
    fetchMutateMock.mockResolvedValue({ config });
    await expect(updateContentGuardrails('my agent', config)).resolves.toEqual({ config });
    expect(fetchMutateMock).toHaveBeenCalledWith('/agents/my%20agent/content-guardrails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  });
});
