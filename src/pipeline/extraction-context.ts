import type { CachePolicy } from '../cache/cache-policy.js';
import type { ProductCache } from '../cache/product-cache.js';
import type { AiClient } from '../layers/ai/ai-client.js';
import type { FallbackProvider } from '../providers/fallback-provider.js';
import type { ProductExtractResult } from '../domain/product-extract-result.js';
import type { StoreInfo } from '../domain/store.js';

export type ExtractionOptions = {
  cachePolicy?: CachePolicy;
  cache?: ProductCache;
  aiEnabled?: boolean;
  commercialFallbackEnabled?: boolean;
  fallbackProviders?: FallbackProvider[];
  aiClient?: AiClient;
  timeoutMs?: number;
};

export type ExtractionContext = {
  inputUrl: string;
  normalizedUrl: string;
  store: StoreInfo;
  cacheKey: string;
  options: ExtractionOptions;
  result: ProductExtractResult;
};
