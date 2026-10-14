import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../../entities/agent.entity';
import { ContentGuardrailService } from './content-guardrail.service';

/**
 * One shared ContentGuardrailService instance for the proxy (which enforces)
 * and the routing controllers (which save config), so a save refreshes the
 * same config cache the proxy reads.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Agent])],
  providers: [ContentGuardrailService],
  exports: [ContentGuardrailService],
})
export class ContentGuardrailsModule {}
