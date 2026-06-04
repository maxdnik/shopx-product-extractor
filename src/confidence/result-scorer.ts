import type { ProductExtractResult } from '../domain/product-extract-result.js';

const FIELD_WEIGHTS: Array<[keyof ProductExtractResult, number]> = [
  ['title', 0.15],
  ['price', 0.2],
  ['currency', 0.1],
  ['images', 0.1],
  ['availability', 0.15],
  ['variants', 0.15],
  ['brand', 0.05],
  ['sku', 0.025],
  ['productId', 0.025],
  ['description', 0.05]
];

export function scoreResult(result: ProductExtractResult): number {
  let score = 0;
  let weights = 0;

  for (const [fieldName, weight] of FIELD_WEIGHTS) {
    const field = result[fieldName];
    if (field && typeof field === 'object' && 'confidence' in field) {
      score += field.confidence * weight;
      weights += weight;
    }
  }

  return weights === 0 ? 0 : Math.round((score / weights) * 10_000) / 10_000;
}
