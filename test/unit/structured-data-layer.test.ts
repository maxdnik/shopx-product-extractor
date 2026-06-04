import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStructuredDataLayer } from '../../src/layers/structured-data/structured-data-layer.js';

describe('structured data layer', () => {
  it('extracts ProductGroup fields, variants, and field evidence', async () => {
    const html = readFileSync('test/fixtures/html/schema-product-group.html', 'utf8');
    const result = await runStructuredDataLayer('https://shopx.example/products/runner', { html });

    expect(result.fields.title?.value).toBe('ShopX Runner');
    expect(result.fields.brand?.value).toBe('ShopX Labs');
    expect(result.fields.price?.value).toBe(199.99);
    expect(result.fields.currency?.value).toBe('USD');
    expect(result.fields.availability?.value).toBe('IN_STOCK');
    expect(result.fields.images?.value).toContain('https://cdn.example.com/runner-main.jpg');
    expect(result.fields.variants?.value).toHaveLength(2);
    expect(result.fields.colors?.value).toEqual(['Black', 'White']);
    expect(result.fields.sizes?.value).toEqual(['M', 'L']);
    expect(result.fields.price?.source).toBe('SCHEMA_ORG_PRODUCT_GROUP');
    expect(result.fields.price?.confidence).toBeGreaterThan(0.9);
    expect(result.fields.price?.evidence?.length).toBeGreaterThan(0);
  });
});
