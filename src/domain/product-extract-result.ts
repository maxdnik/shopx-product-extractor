import type { ProductAvailability } from './availability.js';
import type { Evidence, EvidenceRef } from './evidence.js';
import type { ExtractSource } from './sources.js';
import type { StoreInfo } from './store.js';

export type FieldConfidence = number;

export type ExtractedAlternative<T> = {
  value: T;
  source: ExtractSource;
  confidence: FieldConfidence;
  evidence?: EvidenceRef[];
};

export type ExtractedField<T> = {
  value: T | null;
  source: ExtractSource;
  confidence: FieldConfidence;
  evidence?: EvidenceRef[];
  alternatives?: ExtractedAlternative<T>[];
};

export type ProductVariant = {
  id: ExtractedField<string>;
  sku: ExtractedField<string>;
  title: ExtractedField<string>;
  price: ExtractedField<number>;
  currency: ExtractedField<string>;
  color: ExtractedField<string>;
  size: ExtractedField<string>;
  availability: ExtractedField<ProductAvailability>;
  image: ExtractedField<string>;
  options: Record<string, ExtractedField<string>>;
};

export type ExtractionLayerTrace = {
  name: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fieldsUpdated: string[];
  skipped?: boolean;
  error?: string;
};

export type ExtractionMetadata = {
  version: string;
  cacheKey?: string;
  cacheHit: boolean;
  fetchedAt: string;
  expiresAt?: string;
  layers: ExtractionLayerTrace[];
  providerCalls: string[];
  aiUsed: boolean;
  warnings: string[];
};

export type ProductExtractResult = {
  url: ExtractedField<string>;
  canonicalUrl: ExtractedField<string>;
  title: ExtractedField<string>;
  brand: ExtractedField<string>;
  price: ExtractedField<number>;
  currency: ExtractedField<string>;
  images: ExtractedField<string[]>;
  description: ExtractedField<string>;
  variants: ExtractedField<ProductVariant[]>;
  colors: ExtractedField<string[]>;
  sizes: ExtractedField<string[]>;
  availability: ExtractedField<ProductAvailability>;
  sku: ExtractedField<string>;
  productId: ExtractedField<string>;
  store: ExtractedField<StoreInfo>;
  confidence: number;
  evidence: Evidence[];
  extraction: ExtractionMetadata;
};

export type ProductExtractFieldName = Exclude<keyof ProductExtractResult, 'confidence' | 'evidence' | 'extraction'>;

export type PartialProductExtractResult = Partial<Pick<ProductExtractResult, ProductExtractFieldName>> & {
  confidence?: number;
  evidence?: Evidence[];
};

export function emptyField<T>(source: ExtractSource = 'UNKNOWN'): ExtractedField<T> {
  return {
    value: null,
    source,
    confidence: 0
  };
}

export function field<T>(
  value: T | null,
  source: ExtractSource,
  confidence: number,
  evidence?: EvidenceRef[]
): ExtractedField<T> {
  return {
    value,
    source,
    confidence: clampConfidence(confidence),
    ...(evidence?.length ? { evidence } : {})
  };
}

export function clampConfidence(confidence: number): number {
  if (Number.isNaN(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

export function createEmptyProductExtractResult(input: {
  url: string;
  normalizedUrl: string;
  store: StoreInfo;
  fetchedAt?: string;
  version?: string;
}): ProductExtractResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();

  return {
    url: field(input.url, 'NORMALIZER', 1),
    canonicalUrl: field(input.normalizedUrl, 'NORMALIZER', 0.95),
    title: emptyField<string>(),
    brand: emptyField<string>(),
    price: emptyField<number>(),
    currency: emptyField<string>(),
    images: emptyField<string[]>(),
    description: emptyField<string>(),
    variants: field<ProductVariant[]>([], 'UNKNOWN', 0),
    colors: field<string[]>([], 'UNKNOWN', 0),
    sizes: field<string[]>([], 'UNKNOWN', 0),
    availability: emptyField<ProductAvailability>(),
    sku: emptyField<string>(),
    productId: emptyField<string>(),
    store: field(input.store, 'NORMALIZER', 0.9),
    confidence: 0,
    evidence: [],
    extraction: {
      version: input.version ?? '0.1.0',
      cacheHit: false,
      fetchedAt,
      layers: [],
      providerCalls: [],
      aiUsed: false,
      warnings: []
    }
  };
}
