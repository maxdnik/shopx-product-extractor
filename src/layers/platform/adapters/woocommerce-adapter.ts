import * as cheerio from 'cheerio';
import { normalizeAvailability } from '../../../domain/availability.js';
import { createEvidence, evidenceRef } from '../../../domain/evidence.js';
import { field } from '../../../domain/product-extract-result.js';
import { parsePrice } from '../../../normalization/price.js';
import { firstCleanText } from '../../../normalization/text.js';
import { emptyPartialExtraction } from '../../../pipeline/partial-extraction.js';
import { safeJsonParse } from '../../../utils/json.js';
import type { PlatformAdapter, PlatformAdapterContext } from './platform-adapter.js';
import { productObjectToPartial } from './adapter-utils.js';

export const woocommerceAdapter: PlatformAdapter = {
  platform: 'WOOCOMMERCE',
  async extract(context: PlatformAdapterContext) {
    const partial = emptyPartialExtraction('platform-woocommerce');
    const $ = cheerio.load(context.html);

    $('form.variations_form[data-product_variations]').each((index, element) => {
      const raw = $(element).attr('data-product_variations');
      if (!raw) return;
      const data = safeJsonParse(decodeHtml(raw));
      if (!Array.isArray(data)) return;
      const result = productObjectToPartial({
        object: { variants: data },
        source: 'PLATFORM_WOOCOMMERCE',
        pageUrl: context.url,
        evidencePath: `form.variations_form[data-product_variations][${index}]`,
        confidence: 0.9
      });
      Object.assign(partial.fields, result.fields);
      partial.evidence.push(...result.evidence);
    });

    const evidence = createEvidence({
      source: 'PLATFORM_WOOCOMMERCE',
      kind: 'rendered_dom',
      selectorOrPath: 'woocommerce semantic product markup',
      url: context.url,
      snippet: $('body').text().slice(0, 1_500)
    });
    const ref = evidenceRef(evidence);
    const title = firstCleanText($('.product_title').first().text(), $('h1[itemprop="name"]').first().text());
    const price = parsePrice($('.summary .price').first().text());
    const sku = firstCleanText($('.sku').first().text());
    const availability = normalizeAvailability($('.stock').first().text());

    if (title && !partial.fields.title) partial.fields.title = field(title, 'PLATFORM_WOOCOMMERCE', 0.78, [ref]);
    if (price.amount !== null && !partial.fields.price) partial.fields.price = field(price.amount, 'PLATFORM_WOOCOMMERCE', 0.74, [ref]);
    if (price.currency && !partial.fields.currency) partial.fields.currency = field(price.currency, 'PLATFORM_WOOCOMMERCE', 0.72, [ref]);
    if (sku && !partial.fields.sku) partial.fields.sku = field(sku, 'PLATFORM_WOOCOMMERCE', 0.78, [ref]);
    if (availability !== 'UNKNOWN' && !partial.fields.availability) partial.fields.availability = field(availability, 'PLATFORM_WOOCOMMERCE', 0.72, [ref]);
    if (Object.keys(partial.fields).length) partial.evidence.push(evidence);

    partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
    return partial;
  }
};

function decodeHtml(input: string): string {
  return input.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
}
