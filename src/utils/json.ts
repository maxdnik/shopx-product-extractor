export type JsonObject = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function asArray<T = unknown>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

export function deepFindObjects(value: unknown, predicate: (object: JsonObject) => boolean, limit = 50): JsonObject[] {
  const found: JsonObject[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown): void {
    if (found.length >= limit || !node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);

    if (isRecord(node) && predicate(node)) {
      found.push(node);
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    for (const child of Object.values(node as JsonObject)) {
      visit(child);
    }
  }

  visit(value);
  return found;
}

export function getPath(object: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current === 'object') return (current as JsonObject)[part];
    return undefined;
  }, object);
}

export function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
