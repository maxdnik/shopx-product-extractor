import { describe, expect, it } from 'vitest';
import { createEmptyProductExtractResult, field } from '../../src/domain/product-extract-result.js';
import { mergePartialExtraction } from '../../src/pipeline/result-merger.js';

describe('result merger', () => {
  it('keeps lower-confidence conflicting values as alternatives', () => {
    const result = createEmptyProductExtractResult({
      url: 'https://example.com/products/a',
      normalizedUrl: 'https://example.com/products/a',
      store: { domain: 'example.com', platform: 'CUSTOM', platformConfidence: 0.3 }
    });

    mergePartialExtraction(result, {
      layer: 'first',
      fields: { title: field('Structured Title', 'JSON_LD', 0.95) },
      evidence: [],
      fieldsUpdated: ['title'],
      warnings: []
    });
    mergePartialExtraction(result, {
      layer: 'second',
      fields: { title: field('AI Title', 'AI_FALLBACK', 0.6) },
      evidence: [],
      fieldsUpdated: ['title'],
      warnings: []
    });

    expect(result.title.value).toBe('Structured Title');
    expect(result.title.alternatives?.[0]?.value).toBe('AI Title');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
