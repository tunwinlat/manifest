import { Entity, Column, PrimaryColumn } from 'typeorm';
import { timestampType, timestampDefault } from '../common/utils/postgres-sql';

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRoleName = (typeof USER_ROLES)[number];

/**
 * Fork: install-level role of a Better Auth user. A user without a row is a
 * regular user. Kept outside Better Auth's `user` table because that schema
 * is migrated by Better Auth itself, not by TypeORM.
 */
@Entity('user_roles')
export class UserRole {
  @PrimaryColumn('varchar')
  user_id!: string;

  @Column('varchar')
  role!: UserRoleName;

  @Column(timestampType(), { default: timestampDefault() })
  created_at!: string;

  @Column(timestampType(), { default: timestampDefault() })
  updated_at!: string;
}
