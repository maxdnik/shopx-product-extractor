import { normalizeAvailability } from '../domain/availability.js';
import { createEvidence, evidenceRef } from '../domain/evidence.js';
import { field, type PartialProductExtractResult } from '../domain/product-extract-result.js';
import type { ExtractSource } from '../domain/sources.js';
import { normalizeImageList } from '../normalization/images.js';
import { parsePrice } from '../normalization/price.js';
import { firstCleanText } from '../normalization/text.js';
import { emptyPartialExtraction } from '../pipeline/partial-extraction.js';
import { isRecord } from '../utils/json.js';
import { sha256 } from '../utils/hash.js';

export function providerResponseToPartial(input: {
  layer: string;
  source: ExtractSource;
  url: string;
  response: unknown;
  productPath?: string;
}) {
  const partial = emptyPartialExtraction(input.layer);
  const object = input.productPath && isRecord(input.response) ? nested(input.response, input.productPath) : input.response;
  if (!isRecord(object)) {
    partial.warnings.push(`${input.layer} response did not contain a product object`);
    return partial;
  }

  const raw = JSON.stringify(object);
  const evidence = createEvidence({
    source: input.source,
    kind: 'provider_response',
    selectorOrPath: input.productPath ?? 'root',
    url: input.url,
    snippet: raw,
    rawHash: sha256(raw)
  });
  const ref = evidenceRef(evidence);
  const fields: PartialProductExtractResult = {};
  const price = parsePrice(firstValue(object.price, object.offerPrice, object.regularPrice, nested(object, 'price.amountSubunits')), firstValue(object.currency, object.currencyCode, nested(object, 'price.currencyCode')));
  const amount = typeof nested(object, 'price.amountSubunits') === 'number' ? Number(nested(object, 'price.amountSubunits')) / 100 : price.amount;
  const images = normalizeImageList(firstValue(object.images, object.image, object.image_url, object.imageUrl), input.url);
  const title = firstCleanText(object.title, object.name, object.productName);
  const brand = firstCleanText(object.brand, nested(object, 'brand.name'));
  const description = firstCleanText(object.description);
  const availability = normalizeAvailability(firstValue(object.availability, object.in_stock, object.inStock, object.isPurchasable));
  const sku = firstCleanText(object.sku, object.SKU);
  const productId = firstCleanText(object.id, object.productId, object.asin, object.gtin, object.mpn);

  if (title) fields.title = field(title, input.source, 0.9, [ref]);
  if (brand) fields.brand = field(brand, input.source, 0.86, [ref]);
  if (description) fields.description = field(description, input.source, 0.82, [ref]);
  if (amount !== null) fields.price = field(amount, input.source, 0.9, [ref]);
  if (price.currency) fields.currency = field(price.currency, input.source, 0.9, [ref]);
  if (images.length) fields.images = field(images, input.source, 0.88, [ref]);
  if (availability !== 'UNKNOWN') fields.availability = field(availability, input.source, 0.86, [ref]);
  if (sku) fields.sku = field(sku, input.source, 0.84, [ref]);
  if (productId) fields.productId = field(productId, input.source, 0.84, [ref]);

  partial.fields = fields;
  partial.fieldsUpdated = Object.keys(fields) as typeof partial.fieldsUpdated;
  partial.evidence.push(evidence);
  return partial;
}

function nested(object: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) {
      const index = Number(key);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (!isRecord(current)) return undefined;
    return current[key];
  }, object);
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}
