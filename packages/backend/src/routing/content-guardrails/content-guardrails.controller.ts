import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { TenantCtx, TenantContext } from '../../common/decorators/tenant-context.decorator';
import { ResolveAgentService } from '../routing-core/resolve-agent.service';
import { ContentGuardrailService } from './content-guardrail.service';
import { UpdateContentGuardrailsDto } from './content-guardrails.dto';

@Controller('api/v1/agents/:agentName/content-guardrails')
export class ContentGuardrailsController {
  constructor(
    private readonly resolveAgent: ResolveAgentService,
    private readonly guardrails: ContentGuardrailService,
  ) {}

  @Get()
  async get(@TenantCtx() ctx: TenantContext, @Param('agentName') agentName: string) {
    const agent = await this.resolveAgent.resolve(ctx.tenantId, agentName);
    return { config: await this.guardrails.configForAgent(agent.id) };
  }

  @Put()
  async put(
    @TenantCtx() ctx: TenantContext,
    @Param('agentName') agentName: string,
    @Body() body: UpdateContentGuardrailsDto,
  ) {
    const agent = await this.resolveAgent.resolve(ctx.tenantId, agentName);
    return { config: await this.guardrails.update(agent.id, body) };
  }
}
