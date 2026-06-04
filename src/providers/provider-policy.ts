import type { ProductExtractResult } from '../domain/product-extract-result.js';
import { evaluateEscalation } from '../pipeline/escalation-policy.js';

export type ProviderPolicy = {
  enabled: boolean;
  maxProvidersPerRequest: number;
};

export const DEFAULT_PROVIDER_POLICY: ProviderPolicy = {
  enabled: false,
  maxProvidersPerRequest: 1
};

export function shouldUseFallbackProvider(result: ProductExtractResult, policy: ProviderPolicy): boolean {
  return policy.enabled && evaluateEscalation(result).shouldEscalate;
}
