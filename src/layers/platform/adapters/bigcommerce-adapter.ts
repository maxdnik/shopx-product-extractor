import { emptyPartialExtraction } from '../../../pipeline/partial-extraction.js';
import { extractJsonAssignment, productObjectToPartial } from './adapter-utils.js';
import { isRecord } from '../../../utils/json.js';
import type { PlatformAdapter, PlatformAdapterContext } from './platform-adapter.js';

export const bigCommerceAdapter: PlatformAdapter = {
  platform: 'BIGCOMMERCE',
  async extract(context: PlatformAdapterContext) {
    const partial = emptyPartialExtraction('platform-bigcommerce');
    const candidates = extractJsonAssignment(context.html, [
      /window\.BCData\s*=\s*(\{[\s\S]*?\});/g,
      /window\.__stencilStorefrontData\s*=\s*(\{[\s\S]*?\});/g
    ]);

    for (const candidate of candidates) {
      if (!isRecord(candidate.data)) continue;
      const object = isRecord(candidate.data.product) ? candidate.data.product : candidate.data;
      const result = productObjectToPartial({
        object,
        source: 'PLATFORM_BIGCOMMERCE',
        pageUrl: context.url,
        evidencePath: `BigCommerce storefront data:${candidate.path}`,
        confidence: 0.9
      });
      Object.assign(partial.fields, result.fields);
      partial.evidence.push(...result.evidence);
    }

    partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
    return partial;
  }
};
