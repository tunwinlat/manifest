/**
 * Pull the human/tool-authored text a guardrail should inspect out of a proxy
 * body, for all three caller shapes (Chat Completions, Anthropic Messages,
 * Responses). Only message content is read — never field values such as
 * `role`, `model`, tool schemas or IDs, which would match blocked phrases
 * like "user" on every request.
 */

/** Upper bound on inspected text so a huge body can't stall the request path. */
export const MAX_INSPECTED_CHARS = 250_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Text of one content value: a string, or an array of typed content parts. */
function contentText(content: unknown, out: string[]): void {
  if (typeof content === 'string') {
    out.push(content);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (typeof part === 'string') {
      out.push(part);
    } else if (isRecord(part)) {
      // text / input_text / output_text parts. Images, files and other media
      // carry no `text`, so they are skipped rather than scanned as base64.
      if (typeof part.text === 'string') out.push(part.text);
      // Anthropic tool_result blocks nest their own content.
      if (part.type === 'tool_result') contentText(part.content, out);
    }
  }
}

/** Items produced by the model rather than sent fresh by the caller this turn. */
function isModelAuthored(item: JsonRecord): boolean {
  if (item.role === 'assistant') return true;
  const type = item.type;
  // Responses API: function_call, custom_tool_call, reasoning, … are model output;
  // function_call_output is the caller's new tool result.
  return typeof type === 'string' && (type.endsWith('_call') || type === 'reasoning');
}

/**
 * Only the trailing turn is new: earlier turns were inspected when they were
 * first sent. Re-scanning history would re-flag (and, in block mode,
 * permanently wedge) a conversation after a single audited match.
 */
function trailingTurn(items: unknown[]): JsonRecord[] {
  const turn: JsonRecord[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!isRecord(item)) continue;
    if (isModelAuthored(item)) break;
    turn.unshift(item);
  }
  return turn;
}

function itemText(item: JsonRecord, out: string[]): void {
  contentText(item.content, out);
  // Responses API function_call_output.
  if (item.type === 'function_call_output') contentText(item.output, out);
}

function joinCapped(parts: string[]): string {
  const text = parts.join('\n');
  return text.length > MAX_INSPECTED_CHARS ? text.slice(0, MAX_INSPECTED_CHARS) : text;
}

/** New caller-authored text in a request body. */
export function extractRequestText(body: unknown): string {
  if (!isRecord(body)) return '';
  const out: string[] = [];
  if (Array.isArray(body.messages)) {
    for (const item of trailingTurn(body.messages)) itemText(item, out);
  } else if (typeof body.input === 'string') {
    out.push(body.input);
  } else if (Array.isArray(body.input)) {
    for (const item of trailingTurn(body.input)) itemText(item, out);
  }
  return joinCapped(out);
}

/** Model-authored text in a non-streaming response, in the caller's shape. */
export function extractResponseText(body: unknown): string {
  if (!isRecord(body)) return '';
  const out: string[] = [];
  if (Array.isArray(body.choices)) {
    // Chat Completions.
    for (const choice of body.choices) {
      if (isRecord(choice) && isRecord(choice.message)) contentText(choice.message.content, out);
    }
  } else if (Array.isArray(body.output)) {
    // Responses API.
    for (const item of body.output) {
      if (isRecord(item) && item.type === 'message') contentText(item.content, out);
    }
  } else if (Array.isArray(body.content)) {
    // Anthropic Messages.
    contentText(body.content, out);
  }
  return joinCapped(out);
}
