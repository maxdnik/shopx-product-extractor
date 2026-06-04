import { emptyPartialExtraction } from '../../../pipeline/partial-extraction.js';
import type { PlatformAdapter, PlatformAdapterContext } from './platform-adapter.js';
import { extractJsonAssignment, productObjectToPartial } from './adapter-utils.js';
import { isRecord } from '../../../utils/json.js';

export const shopifyAdapter: PlatformAdapter = {
  platform: 'SHOPIFY',
  async extract(context: PlatformAdapterContext) {
    const partial = emptyPartialExtraction('platform-shopify');
    const candidates = extractJsonAssignment(context.html, [
      /ShopifyAnalytics\.meta\s*=\s*(\{[\s\S]*?\});/g,
      /var\s+meta\s*=\s*(\{[\s\S]*?\});/g,
      /window\.ShopifyAnalytics\s*=\s*window\.ShopifyAnalytics\s*\|\|\s*\{\};[\s\S]*?ShopifyAnalytics\.meta\s*=\s*(\{[\s\S]*?\});/g
    ]);

    for (const candidate of candidates) {
      if (!isRecord(candidate.data)) continue;
      const product = isRecord(candidate.data.product) ? candidate.data.product : candidate.data;
      const result = productObjectToPartial({
        object: product,
        source: 'PLATFORM_SHOPIFY',
        pageUrl: context.url,
        evidencePath: `ShopifyAnalytics.meta:${candidate.path}`,
        confidence: 0.95
      });
      Object.assign(partial.fields, result.fields);
      partial.evidence.push(...result.evidence);
    }

    partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
    return partial;
  }
};
