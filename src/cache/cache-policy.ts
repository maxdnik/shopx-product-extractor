export type CacheMode = 'prefer-cache' | 'refresh' | 'bypass';

export type CachePolicy = {
  mode: CacheMode;
  maxAgeSeconds: number;
};

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  mode: 'prefer-cache',
  maxAgeSeconds: 24 * 60 * 60
};

export const QUOTE_CACHE_POLICY: CachePolicy = {
  mode: 'prefer-cache',
  maxAgeSeconds: 60 * 60
};

export function isCacheUsable(input: { fetchedAt: string; expiresAt?: string | null }, policy: CachePolicy): boolean {
  if (policy.mode === 'bypass' || policy.mode === 'refresh') return false;
  const fetched = Date.parse(input.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  if (input.expiresAt && Date.parse(input.expiresAt) < Date.now()) return false;
  return Date.now() - fetched <= policy.maxAgeSeconds * 1000;
}
