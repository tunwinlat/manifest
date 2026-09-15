/** The hosted Phoenix endpoint used by Manifest Cloud. */
export const AUTOFIX_URL = 'https://autofix.manifest.build';
export type AutofixHealingMode = 'hosted' | 'local';

/**
 * Resolve which healer runs for this deployment.
 *
 * Development and test always use the deterministic in-process healer. In
 * production, cloud keeps the hosted Phoenix default while self-hosted
 * deployments default to local-only repair. Operators can make either choice
 * explicitly with `AUTOFIX_HEALING_MODE=local|hosted`.
 */
export function resolveHealingMode(
  nodeEnv: string | undefined,
  selfHosted: boolean,
  configuredMode: string | undefined,
): AutofixHealingMode {
  if (nodeEnv !== 'production') return 'local';

  const mode = configuredMode?.trim().toLowerCase();
  if (mode === 'hosted' || mode === 'local') return mode;

  return selfHosted ? 'local' : 'hosted';
}

/** Resolve the hosted endpoint only when the selected mode needs one. */
export function resolveHealingUrl(
  nodeEnv: string | undefined,
  selfHosted: boolean,
  configuredMode: string | undefined,
): string | undefined {
  return resolveHealingMode(nodeEnv, selfHosted, configuredMode) === 'hosted'
    ? AUTOFIX_URL
    : undefined;
}
