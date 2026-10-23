import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantCacheService } from '../common/services/tenant-cache.service';
import { RequestRecordingStorageService } from '../common/services/request-recording-storage.service';
import { RoutingCacheService } from '../routing/routing-core/routing-cache.service';
import { SharedConnectionService } from '../routing/routing-core/shared-connection.service';
import { runAsProvisioning } from '../auth/signup-gate';
import { INSTANCE_SETTINGS_ID } from '../entities/instance-settings.entity';
import type { UserRoleName } from '../entities/user-role.entity';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  role: UserRoleName;
  harnessCount: number;
  subscriptionCount: number;
  sharedSubscriptionCount: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRoleName;
}

interface UserListRow {
  id: string;
  name: string;
  email: string;
  created_at: string | Date;
  role: string | null;
  harness_count: string | number;
  subscription_count: string | number;
  shared_count: string | number;
}

/**
 * Tables with a `tenant_id` that must go before the rest: attempts reference
 * requests, so both leave first. Everything else is discovered from the
 * schema so a table added later is never left behind; `agents` goes last and
 * cascades its own children.
 */
const FIRST_TENANT_TABLES = ['agent_messages', 'requests'];
const LAST_TENANT_TABLES = ['agents'];

/**
 * Fork: install-level user administration. The first user of an install is
 * its administrator; administrators add and remove the other users.
 *
 * Users are Better Auth rows. Roles live in `user_roles` (no row = regular
 * user) and a user's data lives in their tenant, so removing a user removes
 * the tenant's data in the same transaction.
 */
@Injectable()
export class AdminUsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantCache: TenantCacheService,
    private readonly routingCache: RoutingCacheService,
    private readonly sharedConnections: SharedConnectionService,
    private readonly recordingStorage: RequestRecordingStorageService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureAdmin();
    } catch (err) {
      // Better Auth's tables may not exist yet on a brand-new database; the
      // setup wizard promotes the first user itself.
      this.logger.debug(`Admin bootstrap skipped: ${(err as Error).message}`);
    }
  }

  /**
   * Make sure the install has an administrator: when no user holds the role,
   * the earliest user gets it. This is how an install that predates roles
   * hands administration to the person who set it up.
   */
  async ensureAdmin(): Promise<void> {
    const admins = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT r.user_id FROM user_roles r JOIN "user" u ON u.id = r.user_id
        WHERE r.role = 'admin' LIMIT 1`,
    );
    if (admins.length > 0) return;
    const first = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "user" ORDER BY "createdAt" ASC, id ASC LIMIT 1`,
    );
    if (first.length === 0) return;
    await this.setRoleRow(first[0].id, 'admin');
    this.logger.log(`Granted administrator role to the install's first user ${first[0].id}`);
  }

  async isAdmin(userId: string): Promise<boolean> {
    const role = await this.getRole(userId);
    if (role === 'admin') return true;
    // An install that has users but no administrator yet promotes its first
    // user on demand, so the person who set it up is never locked out.
    await this.ensureAdmin();
    return (await this.getRole(userId)) === 'admin';
  }

  private async getRole(userId: string): Promise<UserRoleName> {
    const rows = await this.dataSource.query<Array<{ role: string }>>(
      `SELECT role FROM user_roles WHERE user_id = $1`,
      [userId],
    );
    return rows[0]?.role === 'admin' ? 'admin' : 'user';
  }

  async listUsers(): Promise<AdminUserRow[]> {
    const rows = await this.dataSource.query<UserListRow[]>(
      `SELECT u.id, u.name, u.email, u."createdAt" AS created_at, r.role,
              (SELECT COUNT(*) FROM agents a
                 WHERE a.tenant_id = t.id AND a.deleted_at IS NULL AND a.is_playground = false)
                AS harness_count,
              (SELECT COUNT(*) FROM tenant_providers tp
                 WHERE tp.tenant_id = t.id AND tp.auth_type = 'subscription') AS subscription_count,
              (SELECT COUNT(*) FROM tenant_providers tp
                 WHERE tp.tenant_id = t.id AND tp.auth_type = 'subscription' AND tp.is_shared)
                AS shared_count
         FROM "user" u
         LEFT JOIN user_roles r ON r.user_id = u.id
         LEFT JOIN tenants t ON t.owner_user_id = u.id
        ORDER BY u."createdAt" ASC, u.id ASC`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      createdAt: new Date(r.created_at).toISOString(),
      role: r.role === 'admin' ? 'admin' : 'user',
      harnessCount: Number(r.harness_count),
      subscriptionCount: Number(r.subscription_count),
      sharedSubscriptionCount: Number(r.shared_count),
    }));
  }

  async createUser(input: CreateUserInput): Promise<AdminUserRow> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "user" WHERE LOWER(email) = $1`,
      [email],
    );
    if (existing.length > 0) {
      throw new ConflictException('A user with that email already exists.');
    }

    // Lazy-require so unit tests that never create users don't load Better
    // Auth's ESM bundle (same pattern as the setup wizard).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { auth } = require('../auth/auth.instance');
    await runAsProvisioning(() =>
      auth.api.signUpEmail({
        body: { email, password: input.password, name: input.name.trim() },
      }),
    );
    // The administrator vouches for the address, as the setup wizard does
    // for the first user, so the account can sign in without an email round trip.
    const created = await this.dataSource.query<Array<{ id: string }>>(
      `UPDATE "user" SET "emailVerified" = true WHERE LOWER(email) = $1 RETURNING id`,
      [email],
    );
    if (created.length === 0) throw new BadRequestException('The user could not be created.');
    const userId = created[0].id;
    if (input.role === 'admin') await this.setRoleRow(userId, 'admin');
    this.logger.log(`Administrator created user ${userId}`);
    const row = (await this.listUsers()).find((u) => u.id === userId);
    return row!;
  }

  async setRole(actorId: string, userId: string, role: UserRoleName): Promise<AdminUserRow> {
    const target = await this.findUser(userId);
    if (role !== 'admin' && (await this.getRole(userId)) === 'admin') {
      if (userId === actorId) {
        throw new BadRequestException('You cannot remove your own administrator role.');
      }
      await this.assertAnotherAdmin(userId);
    }
    if (role === 'admin') await this.setRoleRow(userId, 'admin');
    else await this.dataSource.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    return (await this.listUsers()).find((u) => u.id === target.id)!;
  }

  /**
   * Remove a user and everything their tenant owns. Other users' routes that
   * pointed at this user's shared subscriptions stop resolving immediately and
   * fall through to their fallbacks.
   */
  async removeUser(actorId: string, userId: string): Promise<void> {
    if (userId === actorId) {
      throw new BadRequestException('You cannot remove your own account.');
    }
    await this.findUser(userId);
    if ((await this.getRole(userId)) === 'admin') await this.assertAnotherAdmin(userId);

    const tenants = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM tenants WHERE owner_user_id = $1`,
      [userId],
    );
    const tenantIds = tenants.map((t) => t.id);
    const recordingKeys: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      if (tenantIds.length > 0) {
        const keys = await manager.query<Array<{ recording_key: string }>>(
          `SELECT recording_key FROM agent_messages
            WHERE tenant_id = ANY($1) AND recording_key IS NOT NULL`,
          [tenantIds],
        );
        recordingKeys.push(...keys.map((k) => k.recording_key));
        for (const table of await this.tenantTables(manager.query.bind(manager))) {
          await manager.query(`DELETE FROM "${table}" WHERE tenant_id = ANY($1)`, [tenantIds]);
        }
        await manager.query(`DELETE FROM tenants WHERE id = ANY($1)`, [tenantIds]);
      }
      await manager.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      // Better Auth's session and account rows cascade from the user.
      await manager.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
    });

    this.tenantCache.invalidate(userId);
    for (const tenantId of tenantIds) this.routingCache.invalidateTenant(tenantId);
    this.sharedConnections.invalidate();
    this.logger.log(`Administrator ${actorId} removed user ${userId}`);
    void this.deleteRecordings(recordingKeys);
  }

  async getSettings(): Promise<{ publicSignup: boolean }> {
    const rows = await this.dataSource.query<Array<{ public_signup: boolean }>>(
      `SELECT public_signup FROM instance_settings WHERE id = $1`,
      [INSTANCE_SETTINGS_ID],
    );
    return { publicSignup: rows[0]?.public_signup === true };
  }

  async updateSettings(update: { publicSignup: boolean }): Promise<{ publicSignup: boolean }> {
    await this.dataSource.query(
      `INSERT INTO instance_settings (id, public_signup, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET public_signup = EXCLUDED.public_signup, updated_at = NOW()`,
      [INSTANCE_SETTINGS_ID, update.publicSignup],
    );
    return this.getSettings();
  }

  private async findUser(userId: string): Promise<{ id: string }> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM "user" WHERE id = $1`,
      [userId],
    );
    if (rows.length === 0) throw new NotFoundException('User not found');
    return rows[0];
  }

  private async assertAnotherAdmin(userId: string): Promise<void> {
    const others = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT r.user_id FROM user_roles r JOIN "user" u ON u.id = r.user_id
        WHERE r.role = 'admin' AND r.user_id <> $1 LIMIT 1`,
      [userId],
    );
    if (others.length === 0) {
      throw new BadRequestException('The install must keep at least one administrator.');
    }
  }

  private async setRoleRow(userId: string, role: UserRoleName): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO user_roles (user_id, role, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
      [userId, role],
    );
  }

  /** Every table holding tenant rows, in a deletion order the foreign keys accept. */
  private async tenantTables(
    query: (sql: string, params?: unknown[]) => Promise<Array<{ table_name: string }>>,
  ): Promise<string[]> {
    const rows = await query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND column_name = 'tenant_id'
          AND table_name <> 'tenants'`,
    );
    const names = new Set(rows.map((r) => r.table_name));
    const middle = [...names]
      .filter((n) => !FIRST_TENANT_TABLES.includes(n) && !LAST_TENANT_TABLES.includes(n))
      .sort();
    return [
      ...FIRST_TENANT_TABLES.filter((n) => names.has(n)),
      ...middle,
      ...LAST_TENANT_TABLES.filter((n) => names.has(n)),
    ];
  }

  private async deleteRecordings(keys: string[]): Promise<void> {
    let failed = 0;
    for (const key of keys) {
      try {
        await this.recordingStorage.delete(key);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      this.logger.warn(`Could not delete ${failed} request recording(s) of a removed user`);
    }
  }
}
