import { HttpException, HttpStatus } from '@nestjs/common';

export function optionalTrimmedStringQuery(
  value: string | string[] | undefined,
  name: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new HttpException(`${name} query parameter must be a string`, HttpStatus.BAD_REQUEST);
  }
  return value.trim() || undefined;
}

/** `true`/`false` (or `1`/`0`) query flag; absent means false. */
export function booleanFlagQuery(value: string | string[] | undefined, name: string): boolean {
  if (value === undefined) return false;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new HttpException(`${name} query parameter must be true or false`, HttpStatus.BAD_REQUEST);
}
