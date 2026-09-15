import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSelfHosted } from '../../common/utils/detect-self-hosted';
import { resolveHealingUrl } from './autofix-healing-config';

const PROBE_TIMEOUT_MS = 5_000;

/**
 * On boot, ping hosted Phoenix's public `GET /api/health` once when the
 * selected healing mode uses it. Local mode has no external dependency. The
 * probe never registers or sends credentials, and never delays or fails boot.
 */
@Injectable()
export class AutofixHealthProbe implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutofixHealthProbe.name);

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    // Do not await: a slow/unreachable healer must not hold up boot.
    void this.probe();
  }

  async probe(): Promise<void> {
    // With no healer URL to blank out, `AUTOFIX_GLOBAL_ENABLED=false` is the
    // only opt-out an operator has left — so it has to mean *no contact at
    // all*, boot probe included. Previously `AUTOFIX_HEALING_URL=off` carried
    // that guarantee and the probe was allowed to run regardless.
    if (this.config.get<string>('AUTOFIX_GLOBAL_ENABLED') === 'false') return;

    const url = resolveHealingUrl(
      this.config.get<string>('NODE_ENV'),
      isSelfHosted(),
      this.config.get<string>('AUTOFIX_HEALING_MODE'),
    );
    if (!url) return;

    const target = `${url.replace(/\/+$/, '')}/api/health`;
    try {
      // `/api/health` is public in the Phoenix contract (`security: []`), so send
      // no `x-api-key` here — the key belongs only on guarded `/api/heal*` calls,
      // and shipping it to a wrong/misconfigured URL would leak the credential.
      const res = await fetch(target, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(
          `Autofix: Phoenix health probe ${target} returned ${res.status} — ` +
            `Autofix will not heal until this is resolved.`,
        );
        return;
      }
      this.logger.log(`Autofix: Phoenix healer reachable at ${url}.`);
    } catch (err) {
      this.logger.warn(
        `Autofix: Phoenix health probe ${target} failed (${(err as Error).message}) — ` +
          `check this host's outbound network access.`,
      );
    }
  }
}
