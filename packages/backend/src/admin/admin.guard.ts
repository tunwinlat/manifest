import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithTenantContext } from '../common/decorators/tenant-context.decorator';
import { AdminUsersService } from './admin-users.service';

/** The authenticated user's id, from either the session or a user-owned API key. */
export function requestUserId(request: Request): string | null {
  const fromContext = (request as RequestWithTenantContext).tenantContext?.userId;
  if (typeof fromContext === 'string' && fromContext.length > 0) return fromContext;
  const fromUser = (request as Request & { user?: { id?: unknown } }).user?.id;
  return typeof fromUser === 'string' && fromUser.length > 0 ? fromUser : null;
}

/**
 * Fork: lets only install administrators through. The role is read from the
 * database on every call — the session cookie caches user data for minutes,
 * and a revoked administrator must lose access at once.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly users: AdminUsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = requestUserId(context.switchToHttp().getRequest<Request>());
    if (!userId || !(await this.users.isAdmin(userId))) {
      throw new ForbiddenException('Administrator access required');
    }
    return true;
  }
}
