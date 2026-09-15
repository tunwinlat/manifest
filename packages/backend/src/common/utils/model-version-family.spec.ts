import { resolveNewerModelVariant } from './model-version-family';

describe('resolveNewerModelVariant', () => {
  it('promotes an Anthropic route to the newest minor in its model family', () => {
    expect(
      resolveNewerModelVariant('anthropic', 'claude-sonnet-5', [
        'claude-sonnet-5-1',
        'claude-opus-5-1',
      ]),
    ).toBe('claude-sonnet-5-1');
  });

  it('promotes an OpenAI route without changing its product variant', () => {
    expect(
      resolveNewerModelVariant('openai', 'gpt-5.6-sol', [
        'gpt-5.7-terra',
        'gpt-5.7-sol',
        'gpt-6-sol',
      ]),
    ).toBe('gpt-5.7-sol');
  });

  it('does not downgrade, cross a major release, or match unrecognized providers', () => {
    expect(resolveNewerModelVariant('openai', 'gpt-5.6-sol', ['gpt-5.5-sol'])).toBeNull();
    expect(resolveNewerModelVariant('openai', 'gpt-5.6-sol', ['gpt-6-sol'])).toBeNull();
    expect(resolveNewerModelVariant('xai', 'grok-5', ['grok-5.1'])).toBeNull();
  });
});
