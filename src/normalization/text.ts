export function cleanText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function firstCleanText(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

export function normalizeOptionValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function uniqNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = normalizeOptionValue(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}
