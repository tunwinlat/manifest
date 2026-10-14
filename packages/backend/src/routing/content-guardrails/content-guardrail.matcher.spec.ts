import { findGuardrailMatch } from './content-guardrail.matcher';
import {
  DEFAULT_CONTENT_GUARDRAIL_CONFIG,
  type ContentGuardrailConfig,
} from './content-guardrail.types';

const config = (overrides: Partial<ContentGuardrailConfig>): ContentGuardrailConfig => ({
  ...DEFAULT_CONTENT_GUARDRAIL_CONFIG,
  enabled: true,
  ...overrides,
});
const pii = config({ detect_pii: true });

describe('findGuardrailMatch', () => {
  it('returns null for empty text', () => {
    expect(findGuardrailMatch('', pii)).toBeNull();
  });

  it('matches blocked phrases literally and case-insensitively', () => {
    const phrases = config({ blocked_phrases: ['a+b', 'Project X'] });
    expect(findGuardrailMatch('about project x', phrases)).toBe('blocked_phrase');
    expect(findGuardrailMatch('a+b', phrases)).toBe('blocked_phrase');
    expect(findGuardrailMatch('aaab', phrases)).toBeNull();
  });

  it('skips PII detection unless enabled', () => {
    expect(findGuardrailMatch('person@example.com', config({}))).toBeNull();
  });

  it('detects email addresses', () => {
    expect(findGuardrailMatch('write to person@example.com', pii)).toBe('email');
  });

  it('detects plausible SSNs and ignores ones the SSA never issues', () => {
    expect(findGuardrailMatch('SSN 123-45-6789', pii)).toBe('ssn');
    for (const invalid of [
      '000-12-3456',
      '666-12-3456',
      '900-12-3456',
      '123-00-4567',
      '123-45-0000',
    ]) {
      expect(findGuardrailMatch(invalid, pii)).toBeNull();
    }
  });

  it.each([
    ['Visa', '4111 1111 1111 1111'],
    ['Visa 13', '4222222222222'],
    ['Mastercard', '5555-5555-5555-4444'],
    ['Mastercard 2-series', '2223003122003222'],
    ['Amex', '378282246310005'],
    ['Discover', '6011111111111117'],
    ['Discover 65', '6500000000000002'],
    ['Discover 644', '6440000000000005'],
  ])('detects a %s number', (_name, number) => {
    expect(findGuardrailMatch(`card ${number} thanks`, pii)).toBe('payment_card');
  });

  it('ignores long numbers without a card issuer shape, even when they pass Luhn', () => {
    // Millisecond timestamp that passes Luhn: the old detector flagged these.
    expect(findGuardrailMatch('ts=1700000000004', pii)).toBeNull();
    // Visa prefix with a length Visa never issues.
    expect(findGuardrailMatch('41111111111111111', pii)).toBeNull();
    // Amex prefix, wrong length; Mastercard prefix, wrong length.
    expect(findGuardrailMatch('3782822463100055', pii)).toBeNull();
    expect(findGuardrailMatch('55555555555544445', pii)).toBeNull();
    // Discover prefix, wrong length.
    expect(findGuardrailMatch('601111111111111', pii)).toBeNull();
  });

  it('ignores card-shaped numbers that fail Luhn', () => {
    expect(findGuardrailMatch('4111 1111 1111 1112', pii)).toBeNull();
  });

  it('checks every card-like candidate, not just the first', () => {
    expect(findGuardrailMatch('order 1234567890123 then 4111111111111111', pii)).toBe(
      'payment_card',
    );
  });
});
