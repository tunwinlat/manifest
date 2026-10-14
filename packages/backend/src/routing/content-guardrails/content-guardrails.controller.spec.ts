import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContentGuardrailsController } from './content-guardrails.controller';
import { UpdateContentGuardrailsDto } from './content-guardrails.dto';

const ctx = { tenantId: 'tenant-1', userId: 'user-1' } as never;
const validBody = {
  enabled: true,
  blocked_phrases: ['secret'],
  detect_pii: true,
  request_action: 'audit',
  audit_responses: false,
};

function build() {
  const resolveAgent = {
    resolve: jest.fn().mockResolvedValue({ id: 'agent-1', tenant_id: 'tenant-1' }),
  };
  const guardrails = {
    configForAgent: jest.fn().mockResolvedValue({ enabled: false }),
    update: jest.fn().mockImplementation(async (_id: string, body: unknown) => body),
  };
  return {
    ctrl: new ContentGuardrailsController(resolveAgent as never, guardrails as never),
    resolveAgent,
    guardrails,
  };
}

describe('ContentGuardrailsController', () => {
  it('GET returns the config for an agent in the caller tenant', async () => {
    const { ctrl, resolveAgent, guardrails } = build();
    await expect(ctrl.get(ctx, 'my-agent')).resolves.toEqual({ config: { enabled: false } });
    expect(resolveAgent.resolve).toHaveBeenCalledWith('tenant-1', 'my-agent');
    expect(guardrails.configForAgent).toHaveBeenCalledWith('agent-1');
  });

  it('PUT saves the config for the resolved agent', async () => {
    const { ctrl, guardrails } = build();
    const body = plainToInstance(UpdateContentGuardrailsDto, validBody);
    await expect(ctrl.put(ctx, 'my-agent', body)).resolves.toEqual({ config: body });
    expect(guardrails.update).toHaveBeenCalledWith('agent-1', body);
  });

  it('404s for an unknown agent instead of returning an empty config', async () => {
    const { ctrl, resolveAgent, guardrails } = build();
    resolveAgent.resolve.mockRejectedValue(new NotFoundException('Agent "nope" not found'));
    await expect(ctrl.get(ctx, 'nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctrl.put(ctx, 'nope', plainToInstance(UpdateContentGuardrailsDto, validBody)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(guardrails.update).not.toHaveBeenCalled();
  });
});

describe('UpdateContentGuardrailsDto', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateContentGuardrailsDto, body))).map((e) => e.property);

  it('accepts a complete config', async () => {
    await expect(errorsFor(validBody)).resolves.toEqual([]);
  });

  it.each([
    ['enabled', { enabled: 'yes' }],
    ['blocked_phrases', { blocked_phrases: 'secret' }],
    ['blocked_phrases', { blocked_phrases: [1] }],
    ['blocked_phrases', { blocked_phrases: ['x'.repeat(201)] }],
    ['blocked_phrases', { blocked_phrases: Array(101).fill('p') }],
    ['detect_pii', { detect_pii: undefined }],
    ['request_action', { request_action: 'drop' }],
    ['audit_responses', { audit_responses: 'no' }],
  ])('rejects an invalid %s', async (property, override) => {
    await expect(errorsFor({ ...validBody, ...override })).resolves.toContain(property);
  });
});
