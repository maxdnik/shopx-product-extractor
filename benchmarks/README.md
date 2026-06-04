# ShopX Product Discovery Benchmark

The benchmark suite measures the layered extraction engine against real ecommerce product URLs.

## Modes

- `local-only`: structured data, platform detection, Playwright, AI if enabled.
- `no-ai`: deterministic layers only.
- `provider-comparison`: enables configured commercial fallback providers.
- `cache-cold`: bypass cache.
- `cache-warm`: prefer cache.

## Metrics

- title accuracy
- price/currency accuracy
- image accuracy
- variant completeness
- availability accuracy
- latency p50/p95
- cache hit rate via per-case output
- confidence calibration via per-case confidence

## Run

```bash
npm run benchmark -- --mode cache-cold
npm run benchmark:no-ai
```

Reports are written to `benchmarks/reports/` and ignored by git except for `.gitkeep`.
