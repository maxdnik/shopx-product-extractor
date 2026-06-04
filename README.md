# ShopX Product Discovery Engine

Universal ecommerce product discovery and extraction engine for ShopX Quotes.

## Architecture

ShopX no longer relies on individual store selector patches. Product extraction is layered:

1. **Structured data**: JSON-LD, Schema.org Product/ProductGroup/Offer, OpenGraph, embedded product JSON.
2. **Platform detection**: Shopify, WooCommerce, Magento, BigCommerce, Salesforce Commerce Cloud, custom.
3. **Playwright rendering**: network interception, hydrated app state, generic variants, rendered availability/images.
4. **AI fallback**: optional and only for missing/low-confidence critical fields.
5. **Commercial fallback providers**: optional Rye, Diffbot, Zyte, and Bright Data adapters.

Every returned field is normalized as:

```ts
{
  value,
  source,
  confidence,
  evidence
}
```

## Commands

```bash
npm install
npm run typecheck
npm test
npm run benchmark -- --mode cache-cold --limit 10
```

## Cache

The engine checks product cache before scraping. The default POC implementation includes in-memory cache and a Node SQLite-backed cache.

## Benchmarks

`benchmarks/urls/product-benchmark-v1.jsonl` contains 200 real ecommerce URL seeds across platforms and product categories. Populate the expected file with manually verified ground truth before enforcing accuracy gates in CI.
