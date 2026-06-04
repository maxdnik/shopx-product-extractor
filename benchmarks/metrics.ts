import type { ProductAvailability } from '../src/domain/availability.js';
import type { ProductExtractResult } from '../src/domain/product-extract-result.js';

export type BenchmarkExpected = {
  title?: string;
  brand?: string;
  price?: number;
  currency?: string;
  availability?: ProductAvailability;
  minImages?: number;
  colors?: string[];
  sizes?: string[];
};

export type BenchmarkCase = {
  id: string;
  url: string;
  category: string;
  expected?: BenchmarkExpected;
  notes?: string;
};

export type BenchmarkCaseResult = {
  id: string;
  url: string;
  category: string;
  latencyMs: number;
  layerCount: number;
  cacheHit: boolean;
  confidence: number;
  titleAccurate: boolean | null;
  priceAccurate: boolean | null;
  imageAccurate: boolean | null;
  variantCompleteness: number | null;
  availabilityAccurate: boolean | null;
};

export function scoreBenchmarkCase(testCase: BenchmarkCase, result: ProductExtractResult, latencyMs: number): BenchmarkCaseResult {
  const expected = testCase.expected;
  return {
    id: testCase.id,
    url: testCase.url,
    category: testCase.category,
    latencyMs,
    layerCount: result.extraction.layers.length,
    cacheHit: result.extraction.cacheHit,
    confidence: result.confidence,
    titleAccurate: expected?.title ? normalized(result.title.value) === normalized(expected.title) : null,
    priceAccurate: expected?.price !== undefined ? Math.abs((result.price.value ?? Number.NaN) - expected.price) < 0.01 && result.currency.value === expected.currency : null,
    imageAccurate: expected?.minImages !== undefined ? (result.images.value?.length ?? 0) >= expected.minImages : null,
    variantCompleteness: expected?.colors || expected?.sizes ? variantCompleteness(result, expected) : null,
    availabilityAccurate: expected?.availability ? result.availability.value === expected.availability : null
  };
}

export function summarizeBenchmark(results: BenchmarkCaseResult[]) {
  return {
    count: results.length,
    titleAccuracy: ratio(results.map((result) => result.titleAccurate)),
    priceAccuracy: ratio(results.map((result) => result.priceAccurate)),
    imageAccuracy: ratio(results.map((result) => result.imageAccurate)),
    availabilityAccuracy: ratio(results.map((result) => result.availabilityAccurate)),
    averageVariantCompleteness: average(results.map((result) => result.variantCompleteness)),
    latencyP50: percentile(results.map((result) => result.latencyMs), 0.5),
    latencyP95: percentile(results.map((result) => result.latencyMs), 0.95),
    averageConfidence: average(results.map((result) => result.confidence))
  };
}

function variantCompleteness(result: ProductExtractResult, expected: BenchmarkExpected): number {
  const colorScore = expected.colors?.length ? recall(result.colors.value ?? [], expected.colors) : null;
  const sizeScore = expected.sizes?.length ? recall(result.sizes.value ?? [], expected.sizes) : null;
  return average([colorScore, sizeScore]);
}

function recall(actual: string[], expected: string[]): number {
  const actualSet = new Set(actual.map(normalized));
  return expected.filter((value) => actualSet.has(normalized(value))).length / expected.length;
}

function ratio(values: Array<boolean | null>): number | null {
  const scored = values.filter((value): value is boolean => value !== null);
  if (!scored.length) return null;
  return scored.filter(Boolean).length / scored.length;
}

function average(values: Array<number | null>): number {
  const scored = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!scored.length) return 0;
  return scored.reduce((sum, value) => sum + value, 0) / scored.length;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}
