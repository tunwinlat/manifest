import type { ContentGuardrailConfig, GuardrailMatchKind } from './content-guardrail.types';

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SSN_RE = /\b(\d{3})-(\d{2})-(\d{4})\b/g;
// 13–19 digits with at most one space or hyphen between digits. A single
// optional separator keeps this linear (no nested unbounded quantifiers).
const CARD_CANDIDATE_RE = /\b\d(?:[ -]?\d){12,18}\b/g;

/** SSA never issues area 000, 666 or 9xx, group 00, or serial 0000. */
function isPlausibleSsn(area: string, group: string, serial: string): boolean {
  if (area === '000' || area === '666' || area.startsWith('9')) return false;
  return group !== '00' && serial !== '0000';
}

function hasSsn(text: string): boolean {
  for (const [, area, group, serial] of text.matchAll(SSN_RE)) {
    if (isPlausibleSsn(area, group, serial)) return true;
  }
  return false;
}

function passesLuhn(digits: string): boolean {
  let total = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let digit = Number(digits[i]);
    if (double) digit *= 2;
    total += digit > 9 ? digit - 9 : digit;
  }
  return total % 10 === 0;
}

/**
 * Issuer prefix and length for the major networks. Requiring a real issuer
 * prefix (on top of Luhn) keeps timestamps, order IDs and other long numbers
 * from tripping the detector — 1 in 10 random digit strings pass Luhn alone.
 */
function hasCardIssuerShape(digits: string): boolean {
  const len = digits.length;
  const two = Number(digits.slice(0, 2));
  const three = Number(digits.slice(0, 3));
  const four = Number(digits.slice(0, 4));
  if (digits[0] === '4') return len === 13 || len === 16 || len === 19; // Visa
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return len === 16; // Mastercard
  if (two === 34 || two === 37) return len === 15; // Amex
  if (four === 6011 || two === 65 || (three >= 644 && three <= 649)) {
    return len >= 16 && len <= 19; // Discover
  }
  return false;
}

function hasPaymentCard(text: string): boolean {
  for (const [candidate] of text.matchAll(CARD_CANDIDATE_RE)) {
    const digits = candidate.replace(/\D/g, '');
    if (hasCardIssuerShape(digits) && passesLuhn(digits)) return true;
  }
  return false;
}

/** First guardrail rule the text trips, or null. */
export function findGuardrailMatch(
  text: string,
  config: ContentGuardrailConfig,
): GuardrailMatchKind | null {
  if (!text) return null;
  if (config.blocked_phrases.length > 0) {
    const haystack = text.toLocaleLowerCase();
    if (config.blocked_phrases.some((p) => haystack.includes(p.toLocaleLowerCase()))) {
      return 'blocked_phrase';
    }
  }
  if (!config.detect_pii) return null;
  if (EMAIL_RE.test(text)) return 'email';
  if (hasSsn(text)) return 'ssn';
  if (hasPaymentCard(text)) return 'payment_card';
  return null;
}
