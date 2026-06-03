import { extractProduct } from "../src/lib/product-extractor";
import type { ProductEvidenceDebug } from "../src/lib/product-extractor/types";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

const url = argValue("--url");
if (!url) {
  console.error('Usage: npm run debug:extract -- --url "https://..."');
  process.exit(1);
}

const result = await extractProduct(url, {
  includeDebug: true,
  timeoutMs: Number(process.env.PRODUCT_EXTRACTOR_DEBUG_TIMEOUT_MS ?? 25_000),
});

const debug = result.extraction.debug as { evidence?: ProductEvidenceDebug } | undefined;
const evidence = debug?.evidence;

const payload = {
  detected: {
    store: result.store,
    domain: result.domain,
    normalizedUrl: result.normalizedUrl,
    blocked: Boolean(result.blocked),
    blockReason: result.blockReason ?? null,
    partial: Boolean(result.partial),
  },
  candidates: {
    title: evidence?.titleCandidates ?? [],
    price: evidence?.priceCandidates ?? [],
    images: evidence?.imageCandidates ?? [],
    colors: evidence?.colorCandidates ?? [],
    sizes: evidence?.sizeCandidates ?? [],
    rejected: evidence?.rejectedCandidates ?? [],
  },
  final: {
    ok: result.ok,
    error: result.error ?? null,
    title: result.title ?? null,
    brand: result.brand ?? null,
    price: result.price ?? null,
    currency: result.currency ?? null,
    images: result.images,
    colors: result.variants.colors,
    sizes: result.variants.sizes,
    warnings: result.extraction.warnings,
    confidence: result.confidence,
  },
};

console.log(JSON.stringify(payload, null, 2));
