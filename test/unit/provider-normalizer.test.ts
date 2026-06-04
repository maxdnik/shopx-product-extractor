import { describe, expect, it } from 'vitest';
import { providerResponseToPartial } from '../../src/providers/provider-normalizer.js';

describe('provider response normalizer', () => {
  it('normalizes Diffbot-style product objects into field-level provider evidence', () => {
    const partial = providerResponseToPartial({
      layer: 'provider-diffbot',
      source: 'DIFFBOT_API',
      url: 'https://example.com/products/a',
      productPath: 'objects.0',
      response: {
        objects: [
          {
            title: 'Provider Shoe',
            brand: 'Provider Brand',
            offerPrice: '$129.99',
            sku: 'PROVIDER-SKU',
            availability: 'InStock',
            images: ['https://example.com/shoe.jpg']
          }
        ]
      }
    });

    expect(partial.fields.title?.value).toBe('Provider Shoe');
    expect(partial.fields.price?.value).toBe(129.99);
    expect(partial.fields.currency?.value).toBe('USD');
    expect(partial.fields.availability?.value).toBe('IN_STOCK');
    expect(partial.fields.sku?.source).toBe('DIFFBOT_API');
    expect(partial.evidence[0]?.kind).toBe('provider_response');
  });
});
