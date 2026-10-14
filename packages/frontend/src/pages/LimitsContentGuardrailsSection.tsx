import { createEffect, createResource, createSignal, on, Show, type Component } from 'solid-js';
import Select from '../components/Select.js';
import {
  getContentGuardrails,
  updateContentGuardrails,
  type ContentGuardrailConfig,
} from '../services/api.js';
import { toast } from '../services/toast-store.js';

/** Mirrors the backend limits so the form can't build a config the API rejects. */
const MAX_PHRASES = 100;
const MAX_PHRASE_LENGTH = 200;

const REQUEST_ACTION_OPTIONS = [
  { value: 'block', label: 'Block the request' },
  { value: 'audit', label: 'Allow it and log the match' },
];

export function parseBlockedPhrases(raw: string): string[] {
  return raw
    .split('\n')
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

type SwitchKey = 'enabled' | 'detect_pii' | 'audit_responses';

/**
 * Per-agent content guardrails on the Limits page. Requests are checked before
 * they reach a provider and can be blocked; responses are only logged, because
 * the provider has already run (and billed) the call by then.
 */
const LimitsContentGuardrailsSection: Component<{ agentName: () => string }> = (props) => {
  const [config, { mutate }] = createResource(() => props.agentName(), getContentGuardrails);
  const [draft, setDraft] = createSignal<ContentGuardrailConfig | null>(null);
  const [phrasesText, setPhrasesText] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Accessing an errored resource re-throws, so read through this guard.
  const loaded = () => (!config.loading && !config.error ? config() : undefined);

  // Reset the editable copy whenever a (new agent's) saved config arrives.
  createEffect(
    on(loaded, (cfg) => {
      if (!cfg) return;
      setDraft({ ...cfg });
      setPhrasesText(cfg.blocked_phrases.join('\n'));
      setError(null);
    }),
  );

  const update = (patch: Partial<ContentGuardrailConfig>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const dirty = () => {
    const d = draft();
    const saved = loaded();
    if (!d || !saved) return false;
    return (
      JSON.stringify({ ...d, blocked_phrases: parseBlockedPhrases(phrasesText()) }) !==
      JSON.stringify(saved)
    );
  };

  const save = async () => {
    const d = draft();
    if (!d) return;
    const phrases = parseBlockedPhrases(phrasesText());
    if (phrases.length > MAX_PHRASES) {
      setError(`Use at most ${MAX_PHRASES} blocked phrases.`);
      return;
    }
    if (phrases.some((p) => p.length > MAX_PHRASE_LENGTH)) {
      setError(`Each blocked phrase must be ${MAX_PHRASE_LENGTH} characters or fewer.`);
      return;
    }
    setError(null);
    // Pin the agent this save targets in case the user switches agents mid-save.
    const agentName = props.agentName();
    setSaving(true);
    try {
      const { config: saved } = await updateContentGuardrails(agentName, {
        ...d,
        blocked_phrases: phrases,
      });
      if (props.agentName() === agentName) mutate(saved);
      toast.success('Content guardrails saved');
    } catch {
      // fetchMutate already surfaced the error as a toast.
    } finally {
      setSaving(false);
    }
  };

  const SwitchRow = (p: { key: SwitchKey; title: string; desc: string }) => (
    <div class="settings-card__row">
      <div class="settings-card__label">
        <span class="settings-card__label-title">{p.title}</span>
        <span class="settings-card__label-desc">{p.desc}</span>
      </div>
      <div class="settings-card__control settings-card__control--end">
        <button
          type="button"
          role="switch"
          aria-checked={draft()?.[p.key] ?? false}
          aria-label={p.title}
          class="settings-switch"
          classList={{ 'settings-switch--on': draft()?.[p.key] ?? false }}
          disabled={saving()}
          onClick={() => update({ [p.key]: !draft()?.[p.key] })}
        >
          <span class="settings-switch__track">
            <span class="settings-switch__thumb" />
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <section class="limits-guardrails" aria-labelledby="limits-guardrails-title">
      <h2 class="settings-section__title" id="limits-guardrails-title">
        Content guardrails
      </h2>
      <Show
        when={draft()}
        fallback={
          <Show when={config.error}>
            <div class="settings-card">
              <div class="settings-card__row">
                <span class="settings-card__label-desc" role="alert">
                  Couldn't load content guardrails for this agent.
                </span>
              </div>
            </div>
          </Show>
        }
      >
        {(d) => (
          <div class="settings-card settings-card--flush">
            <SwitchRow
              key="enabled"
              title="Check request content"
              desc="Checks the new text in each request before it reaches a provider."
            />
            <SwitchRow
              key="detect_pii"
              title="Detect personal data"
              desc="Email addresses, US Social Security numbers and payment card numbers."
            />
            <div class="settings-card__row settings-card__row--stacked">
              <label class="settings-card__label" for="limits-guardrails-phrases">
                <span class="settings-card__label-title">Blocked phrases</span>
                <span class="settings-card__label-desc">
                  One per line. Matched as plain text, not case-sensitive.
                </span>
              </label>
              <textarea
                id="limits-guardrails-phrases"
                class="settings-card__input settings-card__input--multiline"
                rows="4"
                spellcheck={false}
                placeholder="e.g. internal project name"
                value={phrasesText()}
                disabled={saving()}
                onInput={(e) => {
                  setPhrasesText(e.currentTarget.value);
                  setError(null);
                }}
              />
            </div>
            <div class="settings-card__row">
              <div class="settings-card__label">
                <span class="settings-card__label-title">When a request matches</span>
                <span class="settings-card__label-desc">
                  A blocked request returns error M205 and never reaches a provider.
                </span>
              </div>
              <div class="settings-card__control">
                <Select
                  label="When a request matches"
                  options={REQUEST_ACTION_OPTIONS}
                  value={d().request_action}
                  disabled={saving()}
                  onChange={(value) =>
                    update({ request_action: value === 'audit' ? 'audit' : 'block' })
                  }
                />
              </div>
            </div>
            <SwitchRow
              key="audit_responses"
              title="Log matches in responses"
              desc="Responses can only be logged, not blocked: the provider has already run the request. Streamed responses aren't checked."
            />
            <div class="settings-card__footer limits-guardrails__footer">
              <Show when={error()}>
                <span class="limits-guardrails__error" role="alert">
                  {error()}
                </span>
              </Show>
              <button
                class="btn btn--primary btn--sm"
                type="button"
                disabled={saving() || !dirty()}
                onClick={() => void save()}
              >
                {saving() ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </Show>
    </section>
  );
};

export default LimitsContentGuardrailsSection;
