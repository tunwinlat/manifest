import { inferProviderFromModel, type ModelRoute } from 'manifest-shared';
import type { DiscoveredModel } from '../../model-discovery/model-fetcher';
import { resolveNewerModelVariant } from '../../common/utils/model-version-family';
import { unambiguousRoute } from '../routing-core/route-helpers';

export const OPENAI_MODEL_ID_AUTO = 'auto';
export const SUBSCRIPTION_MODEL_SUFFIX = '-subscription';

export interface ExplicitModelRouteCandidate {
  provider: string;
  model: string;
  providerQualified: boolean;
}

/** Encode a provider-native model for Manifest's public subscription route. */
export function subscriptionOpenAiModelId(provider: string, modelId: string): string {
  const normalizedProvider = provider.toLowerCase();
  if (modelId === OPENAI_MODEL_ID_AUTO || normalizedProvider.startsWith('custom:')) return modelId;

  const prefix = `${normalizedProvider}/`;
  const routeId = modelId.toLowerCase().startsWith(prefix)
    ? modelId
    : `${normalizedProvider}/${modelId}`;
  return routeId.endsWith(SUBSCRIPTION_MODEL_SUFFIX)
    ? routeId
    : `${routeId}${SUBSCRIPTION_MODEL_SUFFIX}`;
}

export function openAiModelId(model: DiscoveredModel): string {
  const provider = model.provider.toLowerCase();
  if (provider.startsWith('custom:')) return model.id;

  const prefix = `${provider}/`;
  const routeId = model.id.toLowerCase().startsWith(prefix) ? model.id : `${provider}/${model.id}`;
  return model.authType === 'subscription'
    ? subscriptionOpenAiModelId(provider, model.id)
    : routeId;
}

/**
 * Resolve the `model` field of a proxy request to a route.
 *
 * Matches the provider-qualified id published by `/v1/models`
 * (`openai/gpt-5.4-nano`) first, then the bare provider-native name
 * (`gpt-5.4-nano`) when it names exactly one discovered model.
 *
 * Returns null for an unknown name, and for a bare name carried by more than
 * one connection (the same id under both an API key and a subscription) — the
 * caller cannot guess which was meant.
 */
export function routeForOpenAiModelId(
  modelId: string,
  models: readonly DiscoveredModel[],
): ModelRoute | null {
  for (const model of models) {
    if (!model.authType) continue;
    if (openAiModelId(model) !== modelId) continue;
    return {
      provider: model.provider,
      authType: model.authType,
      model: model.id,
    };
  }
  const exact = unambiguousRoute(modelId, [...models]);
  if (exact) return exact;

  // A client can hold on to a public /v1/models ID after the provider moves
  // that family to a new minor release. Resolve only within the same provider,
  // auth path, and product variant; ambiguous bare IDs remain rejected.
  const candidate = explicitModelRouteCandidate(modelId);
  if (!candidate || candidate.provider.startsWith('custom:')) return null;
  const isSubscription = candidate.model.endsWith(SUBSCRIPTION_MODEL_SUFFIX);
  const requestedNativeModel = isSubscription
    ? candidate.model.slice(0, -SUBSCRIPTION_MODEL_SUFFIX.length)
    : candidate.model;
  const compatible = models.filter(
    (model): model is DiscoveredModel & { authType: NonNullable<DiscoveredModel['authType']> } => {
      if (!model.authType) return false;
      if (candidate.providerQualified && model.provider.toLowerCase() !== candidate.provider) {
        return false;
      }
      if (candidate.providerQualified && (model.authType === 'subscription') !== isSubscription) {
        return false;
      }
      return (
        resolveNewerModelVariant(candidate.provider, requestedNativeModel, [model.id]) !== null
      );
    },
  );
  if (compatible.length !== 1) return null;

  return {
    provider: compatible[0].provider,
    authType: compatible[0].authType,
    model: compatible[0].id,
  };
}

/**
 * Infer the provider transport and provider-native model from an explicit
 * request when the model is not yet present in the discovered catalog.
 *
 * Provider-qualified IDs use the first path segment as the transport
 * (`openrouter/anthropic/claude` → OpenRouter + `anthropic/claude`). Bare IDs
 * are accepted only when their naming convention identifies a provider.
 * Connection and auth-type checks remain the caller's responsibility.
 */
export function explicitModelRouteCandidate(modelId: string): ExplicitModelRouteCandidate | null {
  if (modelId.startsWith('custom:')) {
    const slashIndex = modelId.indexOf('/');
    if (slashIndex <= 0) return null;
    return {
      provider: modelId.slice(0, slashIndex),
      model: modelId,
      providerQualified: true,
    };
  }

  const slashIndex = modelId.indexOf('/');
  if (slashIndex > 0 && slashIndex < modelId.length - 1) {
    return {
      provider: modelId.slice(0, slashIndex).toLowerCase(),
      model: modelId.slice(slashIndex + 1),
      providerQualified: true,
    };
  }

  const provider = inferProviderFromModel(modelId);
  return provider ? { provider, model: modelId, providerQualified: false } : null;
}
