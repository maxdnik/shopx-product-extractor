import type { ProductExtractResult } from '../domain/product-extract-result.js';
import type { CachePolicy } from './cache-policy.js';

export type CachedProduct = {
  cacheKey: string;
  normalizedUrl: string;
  result: ProductExtractResult;
  fetchedAt: string;
  expiresAt?: string | null;
};

export type ProductCache = {
  get(cacheKey: string, policy: CachePolicy): Promise<CachedProduct | null>;
  set(entry: CachedProduct): Promise<void>;
};

export class InMemoryProductCache implements ProductCache {
  private readonly entries = new Map<string, CachedProduct>();

  async get(cacheKey: string, policy: CachePolicy): Promise<CachedProduct | null> {
    const entry = this.entries.get(cacheKey);
    if (!entry) return null;
    const { isCacheUsable } = await import('./cache-policy.js');
    if (!isCacheUsable(entry, policy)) return null;
    const result = structuredClone(entry.result);
    result.extraction.cacheHit = true;
    return { ...entry, result };
  }

  async set(entry: CachedProduct): Promise<void> {
    this.entries.set(entry.cacheKey, entry);
  }
}
