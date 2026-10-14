import { supportsReasoningContent, type ReasoningModelCatalog } from './reasoning-format';

/**
 * Fork: model-specific request fixes applied to the outgoing wire body.
 *
 * Upstream (mnfst/llm-gateway#2782) removed these from the proxy and left them
 * to hosted Autofix. This fork runs Autofix locally and in privacy mode, where
 * it is opt-in per agent and off by default, so without these fixes the
 * affected requests would fail with a provider 400 (or cost an extra failed
 * round-trip before a local heal). They run after upstream's protocol
 * adapters, so upstream's adapter files stay untouched apart from the two call
 * sites in provider-client.ts.
 */

const ANTHROPIC_PREFIX = 'anthropic/';
const DEEPSEEK_MAX_TOKENS_LIMIT = 8192;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function anthropicFamily(model: string): string {
  const bare = model.startsWith(ANTHROPIC_PREFIX) ? model.slice(ANTHROPIC_PREFIX.length) : model;
  return bare.replace(/\./g, '-');
}

/**
 * Anthropic body fixes:
 * - Haiku rejects adaptive thinking: drop it on translated requests (native
 *   Messages clients choose their own thinking config).
 * - Adaptive thinking rejects `budget_tokens`: strip it.
 * - Sonnet rejects `output_config.effort: xhigh`: lower it to `high`.
 */
export function applyAnthropicModelFixes(
  body: JsonRecord,
  model: string,
  options: { translated: boolean },
): void {
  const family = anthropicFamily(model);
  const thinking = body.thinking;
  if (isRecord(thinking) && thinking.type === 'adaptive') {
    if (options.translated && family.startsWith('claude-haiku-')) {
      delete body.thinking;
    } else if ('budget_tokens' in thinking) {
      const { budget_tokens: _dropped, ...rest } = thinking;
      body.thinking = rest;
    }
  }
  const outputConfig = body.output_config;
  if (
    isRecord(outputConfig) &&
    outputConfig.effort === 'xhigh' &&
    family.startsWith('claude-sonnet-')
  ) {
    body.output_config = { ...outputConfig, effort: 'high' };
  }
}

/**
 * OpenAI-compatible body fixes:
 * - Strip `reasoning_content` from messages for targets that don't accept it
 *   (strict hosts reject the unknown field; DeepSeek-dialect hosts keep it).
 * - DeepSeek caps `max_tokens` at 8192: clamp it, and drop invalid values.
 */
export function applyOpenAiCompatModelFixes(
  body: JsonRecord,
  endpointKey: string,
  model: string,
  catalog?: ReasoningModelCatalog,
): void {
  if (Array.isArray(body.messages) && !supportsReasoningContent(endpointKey, model, catalog)) {
    body.messages = body.messages.map((message) => {
      if (!isRecord(message) || !('reasoning_content' in message)) return message;
      const { reasoning_content: _dropped, ...rest } = message;
      return rest;
    });
  }
  if (endpointKey === 'deepseek' && 'max_tokens' in body) {
    const raw = body.max_tokens;
    const parsed =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    const clamped = Number.isFinite(parsed)
      ? Math.min(Math.trunc(parsed), DEEPSEEK_MAX_TOKENS_LIMIT)
      : 0;
    if (clamped < 1) delete body.max_tokens;
    else body.max_tokens = clamped;
  }
}
