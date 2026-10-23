import { Entity, Column, PrimaryColumn } from 'typeorm';
import { timestampType, timestampDefault } from '../common/utils/postgres-sql';

export const INSTANCE_SETTINGS_ID = 'singleton';

/** Fork: install-wide switches controlled by an administrator (one row). */
@Entity('instance_settings')
export class InstanceSettings {
  @PrimaryColumn('varchar')
  id!: string;

  /** Whether visitors may create their own account on the sign-up page. */
  @Column('boolean', { default: false })
  public_signup!: boolean;

  @Column(timestampType(), { default: timestampDefault() })
  updated_at!: string;
}
