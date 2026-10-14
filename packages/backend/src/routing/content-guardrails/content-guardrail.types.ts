export const GUARDRAIL_ACTIONS = ['block', 'audit'] as const;
export type GuardrailAction = (typeof GUARDRAIL_ACTIONS)[number];

export const MAX_BLOCKED_PHRASES = 100;
export const MAX_BLOCKED_PHRASE_LENGTH = 200;

export interface ContentGuardrailConfig {
  enabled: boolean;
  /** Literal phrases matched case-insensitively. Kept literal to avoid ReDoS from user regexes. */
  blocked_phrases: string[];
  /** Detect common accidental disclosures (email addresses, SSNs, payment-card numbers). */
  detect_pii: boolean;
  /** What to do when the new content in a request matches. */
  request_action: GuardrailAction;
  /**
   * Log matches in non-streaming responses. Responses are never blocked: the
   * provider has already run (and billed) the call, and streamed tokens cannot
   * be recalled once sent.
   */
  audit_responses: boolean;
}

export const DEFAULT_CONTENT_GUARDRAIL_CONFIG: Readonly<ContentGuardrailConfig> = Object.freeze({
  enabled: false,
  blocked_phrases: [],
  detect_pii: false,
  request_action: 'block',
  audit_responses: true,
});

export type GuardrailMatchKind = 'blocked_phrase' | 'email' | 'ssn' | 'payment_card';
