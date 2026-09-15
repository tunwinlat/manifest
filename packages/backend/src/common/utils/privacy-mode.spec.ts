import { isPrivacyMode } from './privacy-mode';

describe('isPrivacyMode', () => {
  it.each(['1', 'true', ' TRUE '])('enables privacy mode for %p', (value) => {
    expect(isPrivacyMode({ MANIFEST_PRIVACY_MODE: value })).toBe(true);
  });

  it.each([undefined, '', 'false', 'yes'])('does not enable privacy mode for %p', (value) => {
    expect(isPrivacyMode({ MANIFEST_PRIVACY_MODE: value })).toBe(false);
  });
});
