import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthType, ModelRoute } from 'manifest-shared';
import { TenantProvider } from '../../entities/tenant-provider.entity';
import { ModelDiscoveryService } from '../../model-discovery/model-discovery.service';
import type { DiscoveredModel } from '../../model-discovery/model-fetcher';
import { TtlFifoCache } from '../../common/utils/ttl-fifo-cache';
import type { ModelRouteScope, SharedRoutePools } from './resolve-model-route';

export const SHARED_CONNECTION_UNAVAILABLE =
  'That shared subscription is no longer available. Its owner may have stopped sharing it.';

/** Only subscriptions can be shared; metered API keys stay with their owner. */
export const SHAREABLE_AUTH_TYPE: AuthType = 'subscription';

/**
 * How long a share decision is reused on the request path. Short, because
 * turning sharing off must stop other users' traffic promptly; the owner's own
 * replica drops the entry immediately (see {@link SharedConnectionService.invalidate}).
 */
const SHARE_CACHE_TTL_MS = 10_000;

export interface SharedConnectionSummary {
  id: string;
  provider: string;
  authType: AuthType;
  label: string;
  ownerName: string | null;
  ownerEmail: string | null;
  models: DiscoveredModel[];
}

interface SharedRow {
  id: string;
  tenant_id: string;
  owner_name: string | null;
  owner_email: string | null;
}

/**
 * Fork: subscriptions one user shares with the rest of the install.
 *
 * A shared connection stays owned by its tenant — the owner's credential is
 * never copied. Another user's route points at it by id
 * (`ModelRoute.sharedConnectionId`), and every lookup re-checks that the row
 * is still shared, active, a subscription, and not the caller's own.
 */
@Injectable()
export class SharedConnectionService {
  private readonly cache = new TtlFifoCache<string, TenantProvider | null>({
    maxEntries: 1_000,
    ttlMs: SHARE_CACHE_TTL_MS,
  });

  constructor(
    @InjectRepository(TenantProvider)
    private readonly providerRepo: Repository<TenantProvider>,
    private readonly dataSource: DataSource,
    private readonly discovery: ModelDiscoveryService,
  ) {}

  /**
   * The shared connection `connectionId` as `consumerTenantId` may use it, or
   * null when it is not (or no longer) shared with them.
   */
  async findUsable(consumerTenantId: string, connectionId: string): Promise<TenantProvider | null> {
    const row = await this.cache.resolve(connectionId, (id) =>
      this.providerRepo.findOne({ where: { id } }),
    );
    if (!row) return null;
    if (!row.is_shared || !row.is_active || row.auth_type !== SHAREABLE_AUTH_TYPE) return null;
    if (!row.api_key_encrypted) return null;
    if (row.tenant_id === consumerTenantId) return null;
    return row;
  }

  /** Models a consumer may route to on the shared connection, or null when not usable. */
  async modelsFor(
    consumerTenantId: string,
    connectionId: string,
  ): Promise<DiscoveredModel[] | null> {
    const row = await this.findUsable(consumerTenantId, connectionId);
    return row ? this.discovery.modelsForConnection(row) : null;
  }

  /**
   * The models and route scope for a route write that names a shared
   * connection; a 400 when the connection is not shared with the caller.
   */
  async requireRouteScope(
    consumerTenantId: string,
    connectionId: string,
  ): Promise<{ models: DiscoveredModel[]; scope: Required<ModelRouteScope> }> {
    const row = await this.findUsable(consumerTenantId, connectionId);
    if (!row) throw new BadRequestException(SHARED_CONNECTION_UNAVAILABLE);
    return {
      models: this.discovery.modelsForConnection(row),
      scope: {
        provider: row.provider,
        authType: row.auth_type,
        keyLabel: row.label,
        sharedConnectionId: row.id,
      },
    };
  }

  /**
   * Model pools for every shared connection a fallback write names. A 400 when
   * one of them is not shared with the caller; stored routes that are merely
   * carried over are matched before this is consulted.
   */
  async poolsForRoutes(
    consumerTenantId: string,
    routes: readonly ModelRoute[] | undefined,
    storedRoutes?: readonly ModelRoute[] | null,
  ): Promise<SharedRoutePools> {
    const pools = new Map<string, { models: DiscoveredModel[]; label: string }>();
    const stored = new Set((storedRoutes ?? []).map((r) => r.sharedConnectionId).filter(Boolean));
    for (const route of routes ?? []) {
      const id = route.sharedConnectionId;
      if (!id || pools.has(id)) continue;
      const row = await this.findUsable(consumerTenantId, id);
      if (!row) {
        if (stored.has(id)) continue;
        throw new BadRequestException(SHARED_CONNECTION_UNAVAILABLE);
      }
      pools.set(id, { models: this.discovery.modelsForConnection(row), label: row.label });
    }
    return pools;
  }

  /** Every subscription other users share with `consumerTenantId`, with its models. */
  async listForConsumer(consumerTenantId: string): Promise<SharedConnectionSummary[]> {
    const rows = await this.dataSource.query<SharedRow[]>(
      `SELECT tp.id, tp.tenant_id, u.name AS owner_name, u.email AS owner_email
         FROM tenant_providers tp
         JOIN tenants t ON t.id = tp.tenant_id
         LEFT JOIN "user" u ON u.id = t.owner_user_id
        WHERE tp.is_shared = true
          AND tp.is_active = true
          AND tp.auth_type = $1
          AND tp.api_key_encrypted IS NOT NULL
          AND tp.tenant_id <> $2
        ORDER BY u.name ASC NULLS LAST, tp.provider ASC, tp.priority ASC, tp.id ASC`,
      [SHAREABLE_AUTH_TYPE, consumerTenantId],
    );
    if (rows.length === 0) return [];
    const owners = new Map(rows.map((r) => [r.id, r]));
    const connections = await this.providerRepo.find({ where: { id: In(rows.map((r) => r.id)) } });
    const byId = new Map(connections.map((c) => [c.id, c]));
    const summaries: SharedConnectionSummary[] = [];
    for (const row of rows) {
      const connection = byId.get(row.id);
      if (!connection) continue;
      const owner = owners.get(row.id)!;
      summaries.push({
        id: connection.id,
        provider: connection.provider,
        authType: connection.auth_type,
        label: connection.label,
        ownerName: owner.owner_name,
        ownerEmail: owner.owner_email,
        models: this.discovery.modelsForConnection(connection),
      });
    }
    return summaries;
  }

  /** Owner-side switch. Returns the updated flag. */
  async setShared(ownerTenantId: string, connectionId: string, shared: boolean): Promise<boolean> {
    const row = await this.providerRepo.findOne({
      where: { id: connectionId, tenant_id: ownerTenantId },
    });
    if (!row) throw new NotFoundException('Connection not found');
    if (shared && row.auth_type !== SHAREABLE_AUTH_TYPE) {
      throw new BadRequestException('Only subscription connections can be shared.');
    }
    await this.providerRepo.update(
      { id: connectionId, tenant_id: ownerTenantId },
      { is_shared: shared, updated_at: new Date().toISOString() },
    );
    this.invalidate(connectionId);
    return shared;
  }

  /** Drop cached share decisions (one connection, or all of them). */
  invalidate(connectionId?: string): void {
    if (connectionId) this.cache.invalidate(connectionId);
    else this.cache.clear();
  }
}
