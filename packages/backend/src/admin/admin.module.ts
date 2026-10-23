import { Module } from '@nestjs/common';
import { RoutingCoreModule } from '../routing/routing-core/routing-core.module';
import { AdminUsersService } from './admin-users.service';
import { AdminGuard } from './admin.guard';
import { AdminAccessController, AdminController } from './admin.controller';

/** Fork: multi-user administration (first user is the administrator). */
@Module({
  imports: [RoutingCoreModule],
  controllers: [AdminAccessController, AdminController],
  providers: [AdminUsersService, AdminGuard],
  exports: [AdminUsersService],
})
export class AdminModule {}
