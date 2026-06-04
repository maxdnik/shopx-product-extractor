import * as cheerio from 'cheerio';
import { normalizeAvailability } from '../../domain/availability.js';
import { createEvidence, evidenceRef } from '../../domain/evidence.js';
import { field, type PartialProductExtractResult } from '../../domain/product-extract-result.js';
import { normalizeImageUrl } from '../../normalization/images.js';
import { parsePrice, normalizeCurrency } from '../../normalization/price.js';
import { cleanText, firstCleanText } from '../../normalization/text.js';
import { sha256 } from '../../utils/hash.js';

export function parseOpenGraph(html: string, pageUrl: string): { fields: PartialProductExtractResult; evidence: ReturnType<typeof createEvidence>[] } {
  const $ = cheerio.load(html);
  const meta: Record<string, string> = {};

  $('meta').each((_, element) => {
    const key = $(element).attr('property') ?? $(element).attr('name');
    const content = $(element).attr('content');
    if (key && content && !meta[key]) meta[key] = content;
  });

  const evidence = createEvidence({
    source: 'OPEN_GRAPH',
    kind: 'meta',
    selectorOrPath: 'meta[property^="og:"], meta[property^="product:"]',
    url: pageUrl,
    snippet: JSON.stringify(meta),
    rawHash: sha256(JSON.stringify(meta))
  });
  const ref = evidenceRef(evidence);
  const parsedPrice = parsePrice(firstCleanText(meta['product:price:amount'], meta['og:price:amount']), meta['product:price:currency']);
  const image = normalizeImageUrl(firstCleanText(meta['og:image:secure_url'], meta['og:image'], meta['twitter:image']), pageUrl);
  const currency = parsedPrice.currency ?? normalizeCurrency(meta['og:price:currency']);

  const fields: PartialProductExtractResult = {};
  const title = firstCleanText(meta['og:title'], meta['twitter:title']);
  const description = firstCleanText(meta['og:description'], meta['twitter:description'], meta.description);
  const brand = firstCleanText(meta['product:brand'], meta.brand);
  const availability = normalizeAvailability(meta['product:availability']);
  const sku = cleanText(meta['product:retailer_item_id']);

  if (title) fields.title = field(title, 'OPEN_GRAPH', 0.78, [ref]);
  if (description) fields.description = field(description, 'OPEN_GRAPH', 0.74, [ref]);
  if (brand) fields.brand = field(brand, 'OPEN_GRAPH', 0.76, [ref]);
  if (parsedPrice.amount !== null) fields.price = field(parsedPrice.amount, 'OPEN_GRAPH', 0.78, [ref]);
  if (currency) fields.currency = field(currency, 'OPEN_GRAPH', 0.78, [ref]);
  if (image) fields.images = field([image], 'OPEN_GRAPH', 0.78, [ref]);
  if (availability !== 'UNKNOWN') fields.availability = field(availability, 'OPEN_GRAPH', 0.72, [ref]);
  if (sku) fields.sku = field(sku, 'OPEN_GRAPH', 0.72, [ref]);

  return Object.keys(meta).length ? { fields, evidence: [evidence] } : { fields: {}, evidence: [] };
}
