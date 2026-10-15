import { HttpException } from '@nestjs/common';
import { booleanFlagQuery } from './query-params';

describe('booleanFlagQuery', () => {
  it('treats an absent flag as false', () => {
    expect(booleanFlagQuery(undefined, 'removeFromRouting')).toBe(false);
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('parses %p as %p', (value, expected) => {
    expect(booleanFlagQuery(value, 'removeFromRouting')).toBe(expected);
  });

  it.each([['yes'], [''], [['true', 'true']]])('rejects %p with a 400', (value) => {
    expect(() => booleanFlagQuery(value as string | string[], 'removeFromRouting')).toThrow(
      HttpException,
    );
    expect(() => booleanFlagQuery(value as string | string[], 'removeFromRouting')).toThrow(
      'removeFromRouting query parameter must be true or false',
    );
  });
});
