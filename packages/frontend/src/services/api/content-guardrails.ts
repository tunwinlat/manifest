import { fetchJson, fetchMutate } from './core.js';

export interface ContentGuardrailConfig {
  enabled: boolean;
  blocked_phrases: string[];
  detect_pii: boolean;
  request_action: 'block' | 'audit';
  /** Responses are only ever logged, never blocked. */
  audit_responses: boolean;
}

export async function getContentGuardrails(agentName: string): Promise<ContentGuardrailConfig> {
  const data = await fetchJson<{ config: ContentGuardrailConfig }>(
    `/agents/${encodeURIComponent(agentName)}/content-guardrails`,
  );
  return data.config;
}

export function updateContentGuardrails(agentName: string, config: ContentGuardrailConfig) {
  return fetchMutate<{ config: ContentGuardrailConfig }>(
    `/agents/${encodeURIComponent(agentName)}/content-guardrails`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    },
  );
}
