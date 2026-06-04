import * as cheerio from 'cheerio';
import { createEvidence, evidenceRef } from '../../../domain/evidence.js';
import { field } from '../../../domain/product-extract-result.js';
import { firstCleanText } from '../../../normalization/text.js';
import { emptyPartialExtraction } from '../../../pipeline/partial-extraction.js';
import type { PlatformAdapter, PlatformAdapterContext } from './platform-adapter.js';

export const sfccAdapter: PlatformAdapter = {
  platform: 'SFCC',
  async extract(context: PlatformAdapterContext) {
    const partial = emptyPartialExtraction('platform-sfcc');
    const $ = cheerio.load(context.html);
    const productRoot = $('[data-pid], [data-product-id], .product-detail').first();
    const productId = firstCleanText(productRoot.attr('data-pid'), productRoot.attr('data-product-id'));

    if (productId) {
      const evidence = createEvidence({
        source: 'PLATFORM_SFCC',
        kind: 'rendered_dom',
        selectorOrPath: 'SFCC product root data-pid/data-product-id',
        url: context.url,
        snippet: $.html(productRoot).slice(0, 1_500)
      });
      partial.fields.productId = field(productId, 'PLATFORM_SFCC', 0.82, [evidenceRef(evidence)]);
      partial.evidence.push(evidence);
    }

    partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
    return partial;
  }
};
