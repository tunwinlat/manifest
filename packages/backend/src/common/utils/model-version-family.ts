/**
 * Resolves an unavailable model ID to a newer release in the same provider
 * model family. This is deliberately conservative: it never crosses an
 * OpenAI/Claude major version or changes an OpenAI variant (for example,
 * `sol` never becomes `terra`).
 *
 * Providers release minor versions as new, pinned IDs. A saved route should
 * therefore continue to work when discovery replaces `*-5` with `*-5.1`,
 * without silently moving a workload to a different product tier.
 */

interface ParsedVersionedModel {
  family: string;
  major: number;
  minor: number;
  variant: string;
  date: number;
}

function stripProviderPrefix(provider: string, model: string): string {
  const prefix = `${provider.toLowerCase()}/`;
  return model.toLowerCase().startsWith(prefix) ? model.slice(prefix.length) : model;
}

function parseAnthropicModel(model: string): ParsedVersionedModel | null {
  const match = /^claude-(fable|opus|sonnet|haiku)-(\d+)(?:[-.](\d+))?(?:[-@.]?(\d{8}))?$/i.exec(
    model,
  );
  if (!match) return null;
  return {
    family: `claude-${match[1].toLowerCase()}`,
    major: Number(match[2]),
    minor: Number(match[3] ?? 0),
    variant: '',
    date: Number(match[4] ?? 0),
  };
}

function parseOpenAiModel(model: string): ParsedVersionedModel | null {
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:-(.*))?$/i.exec(model);
  if (!match || Number(match[1]) < 5) return null;

  // OpenAI snapshots may append either YYYYMMDD or YYYY-MM-DD. They remain
  // the same variant and should rank after an otherwise equivalent alias.
  const suffix = match[3] ?? '';
  const snapshot = /(?:-|^)(\d{8}|\d{4}-\d{2}-\d{2})$/.exec(suffix);
  const variant = snapshot ? suffix.slice(0, snapshot.index).replace(/-$/, '') : suffix;
  const date = snapshot ? Number(snapshot[1].replaceAll('-', '')) : 0;
  return {
    family: 'gpt',
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    variant: variant.toLowerCase(),
    date,
  };
}

function parseVersionedModel(provider: string, model: string): ParsedVersionedModel | null {
  const bare = stripProviderPrefix(provider, model);
  if (provider.toLowerCase() === 'anthropic') return parseAnthropicModel(bare);
  if (provider.toLowerCase() === 'openai') return parseOpenAiModel(bare);
  return null;
}

/**
 * Return the highest discovered minor/snapshot for the requested model's
 * family. Returns null if the requested ID is not a versioned OpenAI/Claude
 * model or no strictly newer compatible candidate is available.
 */
export function resolveNewerModelVariant(
  provider: string,
  requestedModel: string,
  availableModels: readonly string[],
): string | null {
  const requested = parseVersionedModel(provider, requestedModel);
  if (!requested) return null;

  const candidates = availableModels
    .map((model) => ({ model, parsed: parseVersionedModel(provider, model) }))
    .filter(
      (candidate): candidate is { model: string; parsed: ParsedVersionedModel } =>
        candidate.parsed !== null &&
        candidate.parsed.family === requested.family &&
        candidate.parsed.major === requested.major &&
        candidate.parsed.variant === requested.variant &&
        (candidate.parsed.minor > requested.minor ||
          (candidate.parsed.minor === requested.minor && candidate.parsed.date > requested.date)),
    )
    .sort(
      (a, b) =>
        b.parsed.minor - a.parsed.minor ||
        b.parsed.date - a.parsed.date ||
        a.model.localeCompare(b.model),
    );

  return candidates[0]?.model ?? null;
}
