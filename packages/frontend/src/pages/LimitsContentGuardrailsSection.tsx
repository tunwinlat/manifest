import { createResource, createSignal, Show, type Component } from 'solid-js';
import {
  getContentGuardrails,
  updateContentGuardrails,
  type ContentGuardrailConfig,
} from '../services/api.js';
import { toast } from '../services/toast-store.js';

/** Mirrors the backend limits so the form can't build a config the API rejects. */
const MAX_PHRASES = 100;
const MAX_PHRASE_LENGTH = 200;

export function parseBlockedPhrases(raw: string): string[] {
  return raw
    .split('\n')
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

/**
 * Per-agent content guardrails on the Limits page. Requests are checked before
 * they reach a provider and can be blocked; responses are only logged, because
 * the provider has already run (and billed) the call by then.
 */
const LimitsContentGuardrailsSection: Component<{ agentName: () => string }> = (props) => {
  const [config, { mutate }] = createResource(() => props.agentName(), getContentGuardrails);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Accessing an errored resource re-throws, so read through this guard.
  const current = () => (!config.loading && !config.error ? config() : undefined);

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const phrases = parseBlockedPhrases(String(form.get('blocked_phrases') ?? ''));
    if (phrases.length > MAX_PHRASES) {
      setError(`Use at most ${MAX_PHRASES} blocked phrases.`);
      return;
    }
    if (phrases.some((p) => p.length > MAX_PHRASE_LENGTH)) {
      setError(`Each blocked phrase must be ${MAX_PHRASE_LENGTH} characters or fewer.`);
      return;
    }
    setError(null);
    const next: ContentGuardrailConfig = {
      enabled: form.get('enabled') === 'on',
      detect_pii: form.get('detect_pii') === 'on',
      blocked_phrases: phrases,
      request_action: form.get('request_action') === 'audit' ? 'audit' : 'block',
      audit_responses: form.get('audit_responses') === 'on',
    };
    // Pin the agent this save targets in case the user switches agents mid-save.
    const agentName = props.agentName();
    setSaving(true);
    try {
      const { config: saved } = await updateContentGuardrails(agentName, next);
      if (props.agentName() === agentName) mutate(saved);
      toast.success('Content guardrails saved');
    } catch {
      // fetchMutate already surfaced the error as a toast.
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="card" style="margin: var(--gap-lg) 0; padding: var(--gap-lg);">
      <h2 style="margin-top: 0;">Content guardrails</h2>
      <p class="text-muted">
        Checks the new text in each request before it reaches a provider. Responses can only be
        logged, not blocked: the provider has already run the request by then. Streamed responses
        aren't checked.
      </p>
      <Show
        when={current()}
        fallback={
          <Show when={config.error}>
            <p class="text-muted" role="alert">
              Couldn't load content guardrails for this agent.
            </p>
          </Show>
        }
      >
        {(cfg) => (
          <form onSubmit={save} aria-label="Content guardrails">
            <label class="settings-checkbox" style="display: block; margin-bottom: var(--gap-sm);">
              <input type="checkbox" name="enabled" checked={cfg().enabled} />
              Enable content guardrails
            </label>
            <label class="settings-checkbox" style="display: block; margin-bottom: var(--gap-sm);">
              <input type="checkbox" name="detect_pii" checked={cfg().detect_pii} />
              Detect common personal data (email addresses, US SSNs, payment card numbers)
            </label>
            <label style="display: block; margin-bottom: var(--gap-sm);">
              Blocked phrases (one per line, matched literally, not case-sensitive)
              <textarea
                name="blocked_phrases"
                rows="4"
                style="display: block; width: 100%; margin-top: var(--gap-xs);"
                value={cfg().blocked_phrases.join('\n')}
              />
            </label>
            <label style="display: block; margin-bottom: var(--gap-sm);">
              When a request matches:{' '}
              <select name="request_action" value={cfg().request_action}>
                <option value="block">Block it</option>
                <option value="audit">Allow it and log the match</option>
              </select>
            </label>
            <label class="settings-checkbox" style="display: block; margin-bottom: var(--gap-sm);">
              <input type="checkbox" name="audit_responses" checked={cfg().audit_responses} />
              Log matches in responses
            </label>
            <Show when={error()}>
              <p class="provider-detail__error" role="alert">
                {error()}
              </p>
            </Show>
            <button class="btn btn--primary btn--sm" type="submit" disabled={saving()}>
              Save guardrails
            </button>
          </form>
        )}
      </Show>
    </section>
  );
};

export default LimitsContentGuardrailsSection;
