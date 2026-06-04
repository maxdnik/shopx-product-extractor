import { describe, expect, it } from 'vitest';
import { productCacheKey } from '../../src/cache/cache-key.js';
import { normalizeProductUrl } from '../../src/normalization/url.js';

describe('product cache key', () => {
  it('normalizes tracking parameters before hashing', () => {
    const a = productCacheKey('https://www.example.com/products/a?utm_source=x&variant=1');
    const b = productCacheKey('https://example.com/products/a?variant=1');
    expect(a).toBe(b);
  });

  it('extracts store domain', () => {
    expect(normalizeProductUrl('example.com/products/a').storeDomain).toBe('example.com');
  });
});
