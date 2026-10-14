import {
  extractRequestText,
  extractResponseText,
  MAX_INSPECTED_CHARS,
} from './content-guardrail.text';

describe('extractRequestText', () => {
  it('returns nothing for non-object bodies or unknown shapes', () => {
    expect(extractRequestText(null)).toBe('');
    expect(extractRequestText('hi')).toBe('');
    expect(extractRequestText({ prompt: 'legacy' })).toBe('');
  });

  it('reads only the trailing turn after the last assistant message', () => {
    const text = extractRequestText({
      messages: [
        { role: 'system', content: 'contact support@example.com' },
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'tool', content: 'tool output' },
        { role: 'user', content: 'new question' },
      ],
    });
    expect(text).toBe('tool output\nnew question');
  });

  it('includes the system prompt on the first turn only', () => {
    expect(
      extractRequestText({
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' },
        ],
      }),
    ).toBe('be brief\nhi');
  });

  it('never scans field values like role, model or tool schemas', () => {
    const text = extractRequestText({
      model: 'user-model',
      tools: [{ name: 'user_lookup', description: 'find a user' }],
      messages: [{ role: 'user', content: 'hello', name: 'user' }],
    });
    expect(text).toBe('hello');
  });

  it('reads text parts and Anthropic tool_result content, skipping media', () => {
    const text = extractRequestText({
      messages: [
        {
          role: 'user',
          content: [
            'bare string part',
            { type: 'text', text: 'typed text' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
            { type: 'tool_result', content: [{ type: 'text', text: 'tool says hi' }] },
            { type: 'tool_result', content: 'plain tool result' },
            7,
          ],
        },
        { role: 'user', content: 42 },
        'not-an-item',
      ],
    });
    expect(text).toBe('bare string part\ntyped text\ntool says hi\nplain tool result');
  });

  it('reads a Responses API string input', () => {
    expect(extractRequestText({ input: 'just text' })).toBe('just text');
  });

  it('reads the trailing Responses API items, including function call output', () => {
    const text = extractRequestText({
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'earlier' }] },
        { type: 'function_call', name: 'lookup', arguments: '{"q":"user"}' },
        { type: 'function_call_output', output: 'result text' },
        { role: 'user', content: [{ type: 'input_text', text: 'follow up' }] },
      ],
    });
    expect(text).toBe('result text\nfollow up');
  });

  it('stops at reasoning items in Responses input', () => {
    expect(
      extractRequestText({
        input: [
          { role: 'user', content: 'before' },
          { type: 'reasoning' },
          { role: 'user', content: 'after' },
        ],
      }),
    ).toBe('after');
  });

  it('caps very large text', () => {
    const big = 'a'.repeat(MAX_INSPECTED_CHARS + 10);
    expect(extractRequestText({ input: big })).toHaveLength(MAX_INSPECTED_CHARS);
  });
});

describe('extractResponseText', () => {
  it('returns nothing for non-object or unknown bodies', () => {
    expect(extractResponseText(undefined)).toBe('');
    expect(extractResponseText({ id: 'x' })).toBe('');
  });

  it('reads Chat Completions message content', () => {
    expect(
      extractResponseText({
        choices: [
          { message: { role: 'assistant', content: 'first' } },
          { message: { content: [{ type: 'text', text: 'second' }] } },
          { delta: { content: 'ignored' } },
          null,
        ],
      }),
    ).toBe('first\nsecond');
  });

  it('reads Responses API output messages only', () => {
    expect(
      extractResponseText({
        output: [
          { type: 'reasoning', summary: [{ text: 'hidden' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'answer' }] },
          'junk',
        ],
      }),
    ).toBe('answer');
  });

  it('reads Anthropic Messages content blocks', () => {
    expect(
      extractResponseText({
        content: [
          { type: 'text', text: 'claude says' },
          { type: 'tool_use', name: 'user', input: {} },
        ],
      }),
    ).toBe('claude says');
  });
});
