import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminUsersService } from './admin-users.service';
import { AdminGuard, requestUserId } from './admin.guard';
import {
  CreateUserDto,
  UpdateInstanceSettingsDto,
  UpdateUserRoleDto,
  UserIdParamDto,
} from './dto/admin-users.dto';

/** Fork: whether the caller may see the dashboard's Administration section. */
@Controller('api/v1/admin/access')
export class AdminAccessController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  async access(@Req() request: Request): Promise<{ isAdmin: boolean }> {
    const userId = requestUserId(request);
    return { isAdmin: userId ? await this.users.isAdmin(userId) : false };
  }
}

/** Fork: install administration — users and install-wide settings. */
@Controller('api/v1/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('users')
  async listUsers() {
    return { users: await this.users.listUsers() };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() body: CreateUserDto) {
    return this.users.createUser(body);
  }

  @Patch('users/:userId')
  async updateRole(
    @Req() request: Request,
    @Param() params: UserIdParamDto,
    @Body() body: UpdateUserRoleDto,
  ) {
    return this.users.setRole(requestUserId(request)!, params.userId, body.role);
  }

  @Delete('users/:userId')
  async removeUser(@Req() request: Request, @Param() params: UserIdParamDto) {
    await this.users.removeUser(requestUserId(request)!, params.userId);
    return { ok: true };
  }

  @Get('settings')
  async getSettings() {
    return this.users.getSettings();
  }

  @Patch('settings')
  async updateSettings(@Body() body: UpdateInstanceSettingsDto) {
    return this.users.updateSettings(body);
  }
}
