import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Command } from 'commander';
import { ProductDiscoveryEngine } from '../src/pipeline/product-discovery-engine.js';
import { DEFAULT_CACHE_POLICY, type CacheMode } from '../src/cache/cache-policy.js';
import { scoreBenchmarkCase, summarizeBenchmark, type BenchmarkCase } from './metrics.js';

const program = new Command()
  .option('--mode <mode>', 'benchmark mode: local-only, no-ai, provider-comparison, cache-cold, cache-warm', 'local-only')
  .option('--input <path>', 'JSONL benchmark input', 'benchmarks/urls/product-benchmark-v1.jsonl')
  .option('--output <path>', 'output report path', 'benchmarks/reports/latest.json')
  .option('--limit <number>', 'limit cases');

program.parse();
const options = program.opts<{ mode: string; input: string; output: string; limit?: string }>();

const cases = readJsonl(options.input).slice(0, options.limit ? Number(options.limit) : undefined);
const engine = new ProductDiscoveryEngine();
const results = [];

for (const testCase of cases) {
  const started = performance.now();
  const cacheMode: CacheMode = options.mode === 'cache-cold' ? 'bypass' : 'prefer-cache';
  const result = await engine.extract(testCase.url, {
    cachePolicy: { ...DEFAULT_CACHE_POLICY, mode: cacheMode },
    aiEnabled: options.mode !== 'no-ai',
    commercialFallbackEnabled: options.mode === 'provider-comparison'
  });
  results.push(scoreBenchmarkCase(testCase, result, Math.round(performance.now() - started)));
}

const report = {
  mode: options.mode,
  generatedAt: new Date().toISOString(),
  summary: summarizeBenchmark(results),
  results
};

mkdirSync('benchmarks/reports', { recursive: true });
writeFileSync(options.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));

function readJsonl(path: string): BenchmarkCase[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BenchmarkCase);
}
