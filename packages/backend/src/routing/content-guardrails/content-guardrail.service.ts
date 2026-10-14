import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManifestError } from '../../common/errors/manifest-error';
import { TtlCache } from '../../common/utils/ttl-cache';
import { Agent } from '../../entities/agent.entity';
import { findGuardrailMatch } from './content-guardrail.matcher';
import { extractRequestText, extractResponseText } from './content-guardrail.text';
import {
  DEFAULT_CONTENT_GUARDRAIL_CONFIG,
  MAX_BLOCKED_PHRASE_LENGTH,
  MAX_BLOCKED_PHRASES,
  type ContentGuardrailConfig,
} from './content-guardrail.types';

/**
 * Config is read on every proxied request, so it is cached per agent. A save
 * on this replica refreshes the entry immediately; other replicas pick it up
 * within the TTL.
 */
const CONFIG_CACHE_TTL_MS = 30_000;
const CONFIG_CACHE_MAX = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class ContentGuardrailService {
  private readonly logger = new Logger(ContentGuardrailService.name);
  private readonly cache = new TtlCache<string, ContentGuardrailConfig>({
    maxSize: CONFIG_CACHE_MAX,
    ttlMs: CONFIG_CACHE_TTL_MS,
  });

  constructor(@InjectRepository(Agent) private readonly agents: Repository<Agent>) {}

  async configForAgent(agentId: string): Promise<ContentGuardrailConfig> {
    const cached = this.cache.get(agentId);
    if (cached) return cached;
    const agent = await this.agents.findOne({
      where: { id: agentId },
      select: { id: true, content_guardrails: true },
    });
    const config = this.normalize(agent?.content_guardrails);
    this.cache.set(agentId, config);
    return config;
  }

  /** Coerce a stored (possibly older or partial) JSON value into a full config. */
  normalize(value: unknown): ContentGuardrailConfig {
    if (!isRecord(value)) return { ...DEFAULT_CONTENT_GUARDRAIL_CONFIG };
    const phrases = Array.isArray(value.blocked_phrases)
      ? value.blocked_phrases
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim().slice(0, MAX_BLOCKED_PHRASE_LENGTH))
          .filter(Boolean)
          .slice(0, MAX_BLOCKED_PHRASES)
      : [];
    return {
      enabled: value.enabled === true,
      blocked_phrases: phrases,
      detect_pii: value.detect_pii === true,
      request_action: value.request_action === 'audit' ? 'audit' : 'block',
      audit_responses: value.audit_responses !== false,
    };
  }

  async update(agentId: string, value: ContentGuardrailConfig): Promise<ContentGuardrailConfig> {
    const config = this.normalize(value);
    await this.agents.update({ id: agentId }, { content_guardrails: config });
    this.cache.set(agentId, config);
    return config;
  }

  /** Throws M205 when the request's new content matches and the action is block. */
  async checkRequest(agentId: string, body: unknown): Promise<void> {
    const config = await this.configForAgent(agentId);
    if (!config.enabled) return;
    const match = findGuardrailMatch(extractRequestText(body), config);
    if (!match) return;
    if (config.request_action === 'block') {
      this.logger.warn(`Content guardrail blocked request: ${match} (agent=${agentId})`);
      throw new ManifestError('M205', 400);
    }
    // Log the rule only — never the matched text, which may be the PII itself.
    this.logger.warn(`Content guardrail audit (request): ${match} (agent=${agentId})`);
  }

  /**
   * Logs a match in a non-streaming response. Never blocks (see
   * audit_responses) and never throws: it runs after the client response.
   */
  async auditResponse(agentId: string, body: unknown): Promise<void> {
    try {
      const config = await this.configForAgent(agentId);
      if (!config.enabled || !config.audit_responses) return;
      const match = findGuardrailMatch(extractResponseText(body), config);
      if (match) {
        this.logger.warn(`Content guardrail audit (response): ${match} (agent=${agentId})`);
      }
    } catch (err) {
      this.logger.warn(`Content guardrail response audit failed (agent=${agentId}): ${err}`);
    }
  }
}
