import 'reflect-metadata';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { SharedConnectionService } from '../shared-connection.service';
import { TierService } from '../tier.service';
import { ProviderKeyService } from '../provider-key.service';
import { HeaderTierService } from '../../header-tiers/header-tier.service';

/**
 * Fork: these services take the sharing service as an optional `T | null`
 * parameter. TypeScript emits `Object` for that type, so without an explicit
 * `@Inject` token Nest silently injects null and shared routes stop working
 * at runtime while every hand-constructed unit test still passes.
 */
describe('SharedConnectionService injection', () => {
  it.each([
    ['TierService', TierService],
    ['ProviderKeyService', ProviderKeyService],
    ['HeaderTierService', HeaderTierService],
  ])('%s declares an explicit token for it', (_name, target) => {
    const deps = (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, target) ?? []) as Array<{
      param: unknown;
    }>;
    expect(deps.some((d) => d.param === SharedConnectionService)).toBe(true);
  });
});
