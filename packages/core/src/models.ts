import { ConfigError } from './errors.js';
import type { ModelPricing, ModelRole, ProjectConfig, ProviderKind } from './schema.js';

export interface ResolvedModelRole {
  provider: string;
  model: string;
  params: Record<string, unknown>;
  pricing?: ModelPricing;
  maxDuration?: number;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Pick the model slug, params, and price for the provider the project selected.
 *
 * The base role is written for `role.provider`. A project that selects a
 * different provider needs either an `alternatives.<provider>` entry in
 * `config/models.yaml` or an explicit `models.<role>.model` and `.pricing`
 * override in `project.yaml`.
 */
export function resolveModelRole(
  role: ModelRole,
  provider: string,
  override: Record<string, unknown> = {},
  roleName = role.model,
): ResolvedModelRole {
  const overrideParams = objectValue(override.params);
  const overrideModel = typeof override.model === 'string' ? override.model : undefined;
  const overridePricing =
    override.pricing && typeof override.pricing === 'object' && !Array.isArray(override.pricing)
      ? (override.pricing as ModelPricing)
      : undefined;

  // The mock adapter ignores the slug and costs nothing. It can run any role
  // without provider-specific configuration.
  if (provider === 'mock') {
    return {
      provider,
      model: overrideModel ?? role.model,
      params: { ...role.params, ...overrideParams },
      pricing: overridePricing ?? role.pricing,
      maxDuration: role.maxDuration,
    };
  }

  const isBaseProvider = provider === role.provider;
  const alternative = role.alternatives?.[provider];

  if (!isBaseProvider && !alternative) {
    if (!overrideModel) {
      throw new ConfigError(
        `Role "${roleName}" is configured for provider "${role.provider}", not "${provider}". ` +
          `Add alternatives.${provider} to config/models.yaml or set models.${roleName}.model in project.yaml.`,
      );
    }
    // A local backend has no price; everything else needs one.
    if (!overridePricing && provider !== 'comfyui') {
      throw new ConfigError(
        `Role "${roleName}" has no pricing for provider "${provider}". ` +
          `Add alternatives.${provider}.pricing to config/models.yaml or set models.${roleName}.pricing in project.yaml.`,
      );
    }
  }

  // Without an alternative, the base role's params and price belong to another
  // provider's model; only the project override applies.
  const source = isBaseProvider ? role : alternative;
  const params = { ...(source?.params ?? {}), ...overrideParams };
  const pricing = overridePricing ?? source?.pricing;
  const maxDuration = source?.maxDuration ?? role.maxDuration;

  return {
    provider,
    model: overrideModel ?? source?.model ?? role.model,
    params,
    pricing,
    maxDuration,
  };
}

/** The provider a role uses in a given project. */
export function providerForRole(config: ProjectConfig, role: string): ProviderKind {
  if (role === 'video.lipsync') {
    if (config.providers.lipsync) return config.providers.lipsync;
    // Projects that render clips in ComfyUI keep lip-sync on fal unless they opt in.
    return config.providers.video === 'comfyui' ? 'fal' : config.providers.video;
  }
  if (role.startsWith('audio.')) return config.providers.audio ?? 'comfyui';
  if (role.startsWith('video.')) return config.providers.video;
  return config.providers.image;
}
