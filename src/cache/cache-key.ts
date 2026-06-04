import { normalizeProductUrl } from '../normalization/url.js';
import { sha256 } from '../utils/hash.js';

export function productCacheKey(url: string): string {
  const normalized = normalizeProductUrl(url);
  return sha256(`${normalized.storeDomain}|${normalized.normalizedUrl}`);
}
