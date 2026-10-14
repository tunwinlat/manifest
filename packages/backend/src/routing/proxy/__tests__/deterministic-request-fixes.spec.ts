import {
  applyAnthropicModelFixes,
  applyOpenAiCompatModelFixes,
} from '../deterministic-request-fixes';

describe('applyAnthropicModelFixes', () => {
  it('drops adaptive thinking for Haiku on translated requests', () => {
    const body: Record<string, unknown> = { thinking: { type: 'adaptive' } };
    applyAnthropicModelFixes(body, 'claude-haiku-4-5-20251001', { translated: true });
    expect(body).not.toHaveProperty('thinking');
  });

  it('keeps native Messages thinking for Haiku but strips budget_tokens', () => {
    const body: Record<string, unknown> = { thinking: { type: 'adaptive', budget_tokens: 2048 } };
    applyAnthropicModelFixes(body, 'claude-haiku-4.5', { translated: false });
    expect(body.thinking).toEqual({ type: 'adaptive' });
  });

  it('strips budget_tokens from adaptive thinking on other models', () => {
    const body: Record<string, unknown> = { thinking: { type: 'adaptive', budget_tokens: 1024 } };
    applyAnthropicModelFixes(body, 'anthropic/claude-opus-5-5', { translated: true });
    expect(body.thinking).toEqual({ type: 'adaptive' });
  });

  it('leaves enabled thinking and adaptive thinking without a budget untouched', () => {
    const enabled = { type: 'enabled', budget_tokens: 4096 };
    const body: Record<string, unknown> = { thinking: enabled };
    applyAnthropicModelFixes(body, 'claude-sonnet-5', { translated: true });
    expect(body.thinking).toBe(enabled);

    const adaptive = { type: 'adaptive' };
    const other: Record<string, unknown> = { thinking: adaptive };
    applyAnthropicModelFixes(other, 'claude-sonnet-5', { translated: true });
    expect(other.thinking).toBe(adaptive);
  });

  it('lowers xhigh effort to high for Sonnet only', () => {
    const sonnet: Record<string, unknown> = { output_config: { effort: 'xhigh', format: 'x' } };
    applyAnthropicModelFixes(sonnet, 'anthropic/claude-sonnet-4.6', { translated: false });
    expect(sonnet.output_config).toEqual({ effort: 'high', format: 'x' });

    const opus: Record<string, unknown> = { output_config: { effort: 'xhigh' } };
    applyAnthropicModelFixes(opus, 'claude-opus-5', { translated: false });
    expect(opus.output_config).toEqual({ effort: 'xhigh' });

    const high: Record<string, unknown> = { output_config: { effort: 'high' } };
    applyAnthropicModelFixes(high, 'claude-sonnet-5', { translated: false });
    expect(high.output_config).toEqual({ effort: 'high' });
  });

  it('ignores bodies without thinking or output_config', () => {
    const body: Record<string, unknown> = { thinking: 'nope', output_config: null };
    applyAnthropicModelFixes(body, 'claude-haiku-4-5', { translated: true });
    expect(body).toEqual({ thinking: 'nope', output_config: null });
  });
});

describe('applyOpenAiCompatModelFixes', () => {
  const messages = () => [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'ok', reasoning_content: 'thought' },
    'not-a-message',
  ];

  it('strips reasoning_content for targets that do not accept it', () => {
    const body: Record<string, unknown> = { messages: messages() };
    applyOpenAiCompatModelFixes(body, 'openai', 'gpt-6');
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
      'not-a-message',
    ]);
  });

  it('keeps reasoning_content for DeepSeek-dialect targets', () => {
    const body: Record<string, unknown> = { messages: messages() };
    applyOpenAiCompatModelFixes(body, 'deepseek', 'deepseek-reasoner');
    expect(body.messages).toEqual(messages());
  });

  it('defers to the reasoning catalog', () => {
    const catalog = { isReasoningModel: jest.fn().mockReturnValue(true) };
    const body: Record<string, unknown> = { messages: messages() };
    applyOpenAiCompatModelFixes(body, 'openrouter', 'some/reasoner', catalog);
    expect(body.messages).toEqual(messages());
  });

  it('leaves bodies without messages alone', () => {
    const body: Record<string, unknown> = { input: 'x' };
    applyOpenAiCompatModelFixes(body, 'openai', 'gpt-6');
    expect(body).toEqual({ input: 'x' });
  });

  it.each([
    [32000, 8192],
    ['4096', 4096],
    [100.9, 100],
  ])('clamps DeepSeek max_tokens %p to %p', (input, expected) => {
    const body: Record<string, unknown> = { max_tokens: input };
    applyOpenAiCompatModelFixes(body, 'deepseek', 'deepseek-chat');
    expect(body.max_tokens).toBe(expected);
  });

  it.each([[0], [-5], [0.4], ['abc'], [null]])(
    'drops an invalid DeepSeek max_tokens %p',
    (input) => {
      const body: Record<string, unknown> = { max_tokens: input };
      applyOpenAiCompatModelFixes(body, 'deepseek', 'deepseek-chat');
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('does not touch max_tokens for other providers or when absent', () => {
    const other: Record<string, unknown> = { max_tokens: 32000 };
    applyOpenAiCompatModelFixes(other, 'mistral', 'mistral-large');
    expect(other.max_tokens).toBe(32000);

    const absent: Record<string, unknown> = {};
    applyOpenAiCompatModelFixes(absent, 'deepseek', 'deepseek-chat');
    expect(absent).toEqual({});
  });
});
