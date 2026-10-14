import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';
import {
  GUARDRAIL_ACTIONS,
  MAX_BLOCKED_PHRASE_LENGTH,
  MAX_BLOCKED_PHRASES,
  type GuardrailAction,
} from './content-guardrail.types';

export class UpdateContentGuardrailsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_BLOCKED_PHRASES)
  @IsString({ each: true })
  @MaxLength(MAX_BLOCKED_PHRASE_LENGTH, { each: true })
  blocked_phrases!: string[];

  @IsBoolean()
  detect_pii!: boolean;

  @IsIn(GUARDRAIL_ACTIONS)
  request_action!: GuardrailAction;

  @IsBoolean()
  audit_responses!: boolean;
}
