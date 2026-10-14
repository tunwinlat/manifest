import { Logger } from '@nestjs/common';
import { ManifestError } from '../../common/errors/manifest-error';
import { ContentGuardrailService } from './content-guardrail.service';
import { DEFAULT_CONTENT_GUARDRAIL_CONFIG } from './content-guardrail.types';

function makeService(stored: unknown) {
  const repo = {
    findOne: jest.fn().mockResolvedValue({ id: 'agent-1', content_guardrails: stored }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new ContentGuardrailService(repo as never), repo };
}

const userTurn = (content: unknown) => ({ messages: [{ role: 'user', content }] });

describe('ContentGuardrailService', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  describe('normalize', () => {
    it('returns the defaults for a missing or malformed value', () => {
      const { service } = makeService(null);
      expect(service.normalize(null)).toEqual(DEFAULT_CONTENT_GUARDRAIL_CONFIG);
      expect(service.normalize(['x'])).toEqual(DEFAULT_CONTENT_GUARDRAIL_CONFIG);
    });

    it('trims, caps and filters phrases and coerces unknown fields', () => {
      const { service } = makeService(null);
      const phrases = ['  keep  ', '', 42, 'x'.repeat(300), ...Array(150).fill('p')];
      const config = service.normalize({
        enabled: 'yes',
        blocked_phrases: phrases,
        detect_pii: true,
        request_action: 'something-else',
        audit_responses: false,
      });
      expect(config.enabled).toBe(false);
      expect(config.blocked_phrases[0]).toBe('keep');
      expect(config.blocked_phrases[1]).toHaveLength(200);
      expect(config.blocked_phrases).toHaveLength(100);
      expect(config.detect_pii).toBe(true);
      expect(config.request_action).toBe('block');
      expect(config.audit_responses).toBe(false);
    });

    it('maps a pre-release response_action-only config onto audit_responses defaults', () => {
      const { service } = makeService(null);
      expect(
        service.normalize({ enabled: true, request_action: 'audit', response_action: 'block' }),
      ).toEqual({
        enabled: true,
        blocked_phrases: [],
        detect_pii: false,
        request_action: 'audit',
        audit_responses: true,
      });
    });

    it('ignores a non-array phrase list', () => {
      const { service } = makeService(null);
      expect(service.normalize({ blocked_phrases: 'nope' }).blocked_phrases).toEqual([]);
    });
  });

  describe('configForAgent', () => {
    it('caches per agent so the request path does not hit the database every time', async () => {
      const { service, repo } = makeService({ enabled: true });
      await service.configForAgent('agent-1');
      await service.configForAgent('agent-1');
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('treats an unknown agent as disabled', async () => {
      const { service, repo } = makeService(null);
      repo.findOne.mockResolvedValueOnce(null);
      await expect(service.configForAgent('gone')).resolves.toEqual(
        DEFAULT_CONTENT_GUARDRAIL_CONFIG,
      );
    });
  });

  it('update persists the normalized config and refreshes the cache', async () => {
    const { service, repo } = makeService(null);
    await service.configForAgent('agent-1');
    const saved = await service.update('agent-1', {
      enabled: true,
      blocked_phrases: [' secret '],
      detect_pii: false,
      request_action: 'block',
      audit_responses: true,
    });
    expect(saved.blocked_phrases).toEqual(['secret']);
    expect(repo.update).toHaveBeenCalledWith({ id: 'agent-1' }, { content_guardrails: saved });
    await expect(service.configForAgent('agent-1')).resolves.toEqual(saved);
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  describe('checkRequest', () => {
    it('does nothing when disabled', async () => {
      const { service } = makeService({ enabled: false, blocked_phrases: ['secret'] });
      await expect(service.checkRequest('agent-1', userTurn('secret'))).resolves.toBeUndefined();
    });

    it('blocks a matching request with M205', async () => {
      const { service } = makeService({ enabled: true, blocked_phrases: ['launch code'] });
      await expect(
        service.checkRequest('agent-1', userTurn('the LAUNCH CODE please')),
      ).rejects.toMatchObject({ code: 'M205' } satisfies Partial<ManifestError>);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('blocked request: blocked_phrase'));
    });

    it('lets a non-matching request through', async () => {
      const { service } = makeService({ enabled: true, blocked_phrases: ['launch code'] });
      await expect(service.checkRequest('agent-1', userTurn('hello'))).resolves.toBeUndefined();
    });

    it('audit mode logs the rule but not the matched text', async () => {
      const { service } = makeService({ enabled: true, detect_pii: true, request_action: 'audit' });
      await expect(
        service.checkRequest('agent-1', userTurn('mail me at person@example.com')),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('Content guardrail audit (request): email (agent=agent-1)');
      expect(warn.mock.calls.flat().join(' ')).not.toContain('person@example.com');
    });
  });

  describe('auditResponse', () => {
    const response = { choices: [{ message: { content: 'the secret is out' } }] };

    it('logs a matching response and never throws', async () => {
      const { service } = makeService({ enabled: true, blocked_phrases: ['secret'] });
      await expect(service.auditResponse('agent-1', response)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        'Content guardrail audit (response): blocked_phrase (agent=agent-1)',
      );
    });

    it('stays quiet when there is no match', async () => {
      const { service } = makeService({ enabled: true, blocked_phrases: ['other'] });
      await service.auditResponse('agent-1', response);
      expect(warn).not.toHaveBeenCalled();
    });

    it('skips responses when disabled or response auditing is off', async () => {
      for (const stored of [
        { enabled: false, blocked_phrases: ['secret'] },
        { enabled: true, blocked_phrases: ['secret'], audit_responses: false },
      ]) {
        const { service } = makeService(stored);
        await service.auditResponse('agent-1', response);
      }
      expect(warn).not.toHaveBeenCalled();
    });

    it('swallows a config lookup failure', async () => {
      const { service, repo } = makeService(null);
      repo.findOne.mockRejectedValueOnce(new Error('db down'));
      await expect(service.auditResponse('agent-1', response)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('response audit failed'));
    });
  });
});
