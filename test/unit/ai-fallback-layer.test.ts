import { describe, expect, it } from 'vitest';
import { createEmptyProductExtractResult } from '../../src/domain/product-extract-result.js';
import { runAiFallbackLayer } from '../../src/layers/ai/ai-fallback-layer.js';
import type { AiClient } from '../../src/layers/ai/ai-client.js';

describe('AI fallback layer', () => {
  it('accepts strict evidence-backed fields and caps AI confidence', async () => {
    const client: AiClient = {
      async extractProduct() {
        return {
          title: { value: 'AI Shoe', confidence: 0.99, evidence: 'AI Shoe' },
          price: { value: '$88.00', confidence: 0.99, evidence: '$88.00' },
          availability: { value: 'sold out', confidence: 0.9, evidence: 'sold out' }
        };
      }
    };
    const partial = await runAiFallbackLayer('https://example.com/products/ai-shoe', {
      client,
      missingFields: ['title', 'price', 'availability'],
      visibleText: 'AI Shoe $88.00 sold out',
      partialResult: createEmptyProductExtractResult({
        url: 'https://example.com/products/ai-shoe',
        normalizedUrl: 'https://example.com/products/ai-shoe',
        store: { domain: 'example.com', platform: 'CUSTOM', platformConfidence: 0.3 }
      })
    });

    expect(partial.fields.title?.value).toBe('AI Shoe');
    expect(partial.fields.title?.confidence).toBeLessThanOrEqual(0.76);
    expect(partial.fields.price?.value).toBe(88);
    expect(partial.fields.availability?.value).toBe('OUT_OF_STOCK');
    expect(partial.evidence.every((evidence) => evidence.source === 'AI_FALLBACK')).toBe(true);
  });

  it('rejects AI responses without evidence', async () => {
    const client: AiClient = {
      async extractProduct() {
        return {
          title: { value: 'No Evidence Shoe', confidence: 0.7, evidence: '' }
        };
      }
    };

    await expect(
      runAiFallbackLayer('https://example.com/products/no-evidence', {
        client,
        missingFields: ['title'],
        visibleText: 'No Evidence Shoe',
        partialResult: createEmptyProductExtractResult({
          url: 'https://example.com/products/no-evidence',
          normalizedUrl: 'https://example.com/products/no-evidence',
          store: { domain: 'example.com', platform: 'CUSTOM', platformConfidence: 0.3 }
        })
      })
    ).rejects.toThrow();
  });
});
