import { DEFAULT_CACHE_POLICY } from '../cache/cache-policy.js';
import { productCacheKey } from '../cache/cache-key.js';
import { InMemoryProductCache, type ProductCache } from '../cache/product-cache.js';
import { createEmptyProductExtractResult } from '../domain/product-extract-result.js';
import type { StoreInfo } from '../domain/store.js';
import { runPlatformDetectionLayer } from '../layers/platform/platform-detection-layer.js';
import { runStructuredDataLayer } from '../layers/structured-data/structured-data-layer.js';
import { normalizeProductUrl } from '../normalization/url.js';
import { evaluateEscalation } from './escalation-policy.js';
import type { ExtractionOptions } from './extraction-context.js';
import { mergePartialExtraction } from './result-merger.js';
import { traceLayer } from './telemetry.js';

export class ProductDiscoveryEngine {
  private readonly cache: ProductCache;

  constructor(cache: ProductCache = new InMemoryProductCache()) {
    this.cache = cache;
  }

  async extract(url: string, options: ExtractionOptions = {}) {
    const normalized = normalizeProductUrl(url);
    const cacheKey = productCacheKey(normalized.normalizedUrl);
    const cachePolicy = options.cachePolicy ?? DEFAULT_CACHE_POLICY;
    const cache = options.cache ?? this.cache;

    const cached = await cache.get(cacheKey, cachePolicy);
    if (cached) return cached.result;

    const store: StoreInfo = {
      domain: normalized.storeDomain,
      platform: 'UNKNOWN',
      platformConfidence: 0
    };
    const result = createEmptyProductExtractResult({
      url,
      normalizedUrl: normalized.normalizedUrl,
      store
    });
    result.extraction.cacheKey = cacheKey;

    const structuredTrace = await traceLayer('structured-data', () => runStructuredDataLayer(normalized.normalizedUrl));
    result.extraction.layers.push(structuredTrace.trace);
    mergePartialExtraction(result, structuredTrace.partial);

    if (evaluateEscalation(result).shouldEscalate) {
      const platformTrace = await traceLayer('platform-detection', () =>
        runPlatformDetectionLayer(normalized.normalizedUrl, { storeDomain: normalized.storeDomain })
      );
      result.extraction.layers.push(platformTrace.trace);
      mergePartialExtraction(result, platformTrace.partial);
    }

    result.extraction.expiresAt = new Date(Date.now() + cachePolicy.maxAgeSeconds * 1000).toISOString();
    await cache.set({
      cacheKey,
      normalizedUrl: normalized.normalizedUrl,
      result,
      fetchedAt: result.extraction.fetchedAt,
      expiresAt: result.extraction.expiresAt
    });

    return result;
  }
}
