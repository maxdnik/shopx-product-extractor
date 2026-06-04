export function normalizeImageUrl(input: unknown, baseUrl: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

export function normalizeImageList(input: unknown, baseUrl: string): string[] {
  const raw = Array.isArray(input) ? input : input ? [input] : [];
  const urls = raw
    .flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return [record.url, record.contentUrl, record.src].filter(Boolean);
      }
      return [];
    })
    .map((item) => normalizeImageUrl(item, baseUrl))
    .filter((item): item is string => Boolean(item));

  return [...new Set(urls)].filter(isLikelyProductImage);
}

export function isLikelyProductImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('sprite')) return false;
  if (lower.includes('placeholder')) return false;
  if (lower.includes('logo')) return false;
  if (lower.endsWith('.svg')) return false;
  return true;
}
