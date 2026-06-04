import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../../src/layers/platform/platform-detector.js';

describe('platform detector', () => {
  it('detects Shopify from platform-level signals', () => {
    const detection = detectPlatform(
      '<script>window.Shopify = {}; ShopifyAnalytics = { meta: { product: { id: 1 } } }</script><img src="https://cdn.shopify.com/x.jpg">',
      'https://merchant.example/products/shoe'
    );
    expect(detection.platform).toBe('SHOPIFY');
    expect(detection.confidence).toBeGreaterThan(0.5);
    expect(detection.signals.length).toBeGreaterThan(0);
  });

  it('classifies unknown pages as custom without domain-specific fallbacks', () => {
    const detection = detectPlatform('<html><body><h1>Product</h1></body></html>', 'https://custom.example/product');
    expect(detection.platform).toBe('CUSTOM');
  });
});
