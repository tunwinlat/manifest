import { AUTOFIX_URL, resolveHealingMode, resolveHealingUrl } from '../autofix-healing-config';

describe('resolveHealingMode', () => {
  it('defaults self-hosted production to the local in-process healer', () => {
    expect(resolveHealingMode('production', true, undefined)).toBe('local');
  });

  it('keeps hosted Phoenix as the cloud production default', () => {
    expect(resolveHealingMode('production', false, undefined)).toBe('hosted');
  });

  it('keeps dev and test local regardless of a hosted override', () => {
    expect(resolveHealingMode('development', true, 'hosted')).toBe('local');
    expect(resolveHealingMode('test', false, 'hosted')).toBe('local');
  });

  it('honours an explicit production healing mode', () => {
    expect(resolveHealingMode('production', true, 'hosted')).toBe('hosted');
    expect(resolveHealingMode('production', false, ' LOCAL ')).toBe('local');
  });
});

describe('resolveHealingUrl', () => {
  it('only returns the hosted endpoint in hosted mode', () => {
    expect(resolveHealingUrl('production', false, undefined)).toBe(AUTOFIX_URL);
    expect(resolveHealingUrl('production', true, undefined)).toBeUndefined();
    expect(resolveHealingUrl('development', false, 'hosted')).toBeUndefined();
  });

  it('pins the hosted healer origin', () => {
    expect(AUTOFIX_URL).toBe('https://autofix.manifest.build');
    expect(new URL(AUTOFIX_URL).hostname).toBe('autofix.manifest.build');
    expect(new URL(AUTOFIX_URL).pathname).toBe('/');
  });
});
