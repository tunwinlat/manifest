/**
 * Disables Manifest-operated reporting, hosted product flows, and public
 * catalog refreshes for operators who require a fully private deployment.
 * Provider traffic remains untouched: it is the service this proxy routes to.
 */
export function isPrivacyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env['MANIFEST_PRIVACY_MODE']?.trim().toLowerCase();
  return value === '1' || value === 'true';
}
