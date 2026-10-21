import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_ROLES, type UserRoleName } from '../../entities/user-role.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRoleName;
}

export class UpdateUserRoleDto {
  @IsIn(USER_ROLES)
  role!: UserRoleName;
}

export class UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;
}

export class UpdateInstanceSettingsDto {
  @IsBoolean()
  publicSignup!: boolean;
}
