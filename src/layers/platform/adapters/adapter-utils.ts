import { createEvidence, evidenceRef } from '../../../domain/evidence.js';
import { field, type PartialProductExtractResult, type ProductVariant } from '../../../domain/product-extract-result.js';
import type { ExtractSource } from '../../../domain/sources.js';
import { normalizeAvailability } from '../../../domain/availability.js';
import { normalizeImageList } from '../../../normalization/images.js';
import { parsePrice } from '../../../normalization/price.js';
import { cleanText, firstCleanText, uniqNormalized } from '../../../normalization/text.js';
import { asArray, isRecord, safeJsonParse, type JsonObject } from '../../../utils/json.js';
import { sha256 } from '../../../utils/hash.js';

export function extractJsonAssignment(html: string, patterns: RegExp[]): Array<{ data: unknown; raw: string; path: string }> {
  const results: Array<{ data: unknown; raw: string; path: string }> = [];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      const data = safeJsonParse(raw);
      if (data) results.push({ data, raw, path: pattern.source.slice(0, 80) });
    }
  }
  return results;
}

export function productObjectToPartial(input: {
  object: JsonObject;
  source: ExtractSource;
  pageUrl: string;
  evidencePath: string;
  confidence?: number;
}): { fields: PartialProductExtractResult; evidence: ReturnType<typeof createEvidence>[] } {
  const raw = JSON.stringify(input.object);
  const evidence = createEvidence({
    source: input.source,
    kind: 'embedded_json',
    selectorOrPath: input.evidencePath,
    url: input.pageUrl,
    snippet: raw,
    rawHash: sha256(raw)
  });
  const ref = evidenceRef(evidence);
  const source = input.source;
  const baseConfidence = input.confidence ?? 0.9;
  const price = parsePrice(firstValue(input.object.price, input.object.currentPrice, input.object.salePrice), firstValue(input.object.currency, input.object.priceCurrency));
  const images = normalizeImageList(firstValue(input.object.images, input.object.image, input.object.media, input.object.featured_image), input.pageUrl);
  const variants = variantsFromObject(input.object, source, input.pageUrl, ref);
  const colors = uniqNormalized([
    ...variants.map((variant) => variant.color.value).filter((value): value is string => Boolean(value)),
    ...asArray<string>(input.object.colors).filter((value): value is string => typeof value === 'string')
  ]);
  const sizes = uniqNormalized([
    ...variants.map((variant) => variant.size.value).filter((value): value is string => Boolean(value)),
    ...asArray<string>(input.object.sizes).filter((value): value is string => typeof value === 'string')
  ]);

  const fields: PartialProductExtractResult = {};
  const title = firstCleanText(input.object.title, input.object.name, input.object.productName);
  const brand = parseBrand(firstValue(input.object.brand, input.object.vendor, input.object.manufacturer));
  const description = firstCleanText(input.object.description, input.object.shortDescription, input.object.body_html);
  const sku = firstCleanText(input.object.sku, input.object.SKU);
  const productId = firstCleanText(input.object.id, input.object.productId, input.object.productID, input.object.handle);
  const availability = normalizeAvailability(firstValue(input.object.availability, input.object.available, input.object.inStock));

  if (title) fields.title = field(title, source, baseConfidence, [ref]);
  if (brand) fields.brand = field(brand, source, baseConfidence - 0.04, [ref]);
  if (description) fields.description = field(description, source, baseConfidence - 0.1, [ref]);
  if (price.amount !== null) fields.price = field(price.amount, source, baseConfidence, [ref]);
  if (price.currency) fields.currency = field(price.currency, source, baseConfidence, [ref]);
  if (images.length) fields.images = field(images, source, baseConfidence - 0.03, [ref]);
  if (variants.length) fields.variants = field(variants, source, baseConfidence - 0.02, [ref]);
  if (colors.length) fields.colors = field(colors, source, baseConfidence - 0.08, [ref]);
  if (sizes.length) fields.sizes = field(sizes, source, baseConfidence - 0.08, [ref]);
  if (availability !== 'UNKNOWN') fields.availability = field(availability, source, baseConfidence - 0.08, [ref]);
  if (sku) fields.sku = field(sku, source, baseConfidence - 0.05, [ref]);
  if (productId) fields.productId = field(productId, source, baseConfidence - 0.05, [ref]);

  return { fields, evidence: [evidence] };
}

function variantsFromObject(object: JsonObject, source: ExtractSource, pageUrl: string, ref: ReturnType<typeof evidenceRef>): ProductVariant[] {
  const rawVariants = asArray<JsonObject>(firstValue(object.variants, object.hasVariant, object.variationAttributes, object.items)).filter(isRecord);
  return rawVariants.slice(0, 250).map((variant, index) => {
    const price = parsePrice(firstValue(variant.price, variant.currentPrice, variant.salePrice), firstValue(variant.currency, variant.priceCurrency));
    const image = normalizeImageList(firstValue(variant.image, variant.images, variant.featured_image), pageUrl)[0] ?? null;
    const options = variantOptions(variant, source);
    const color = firstCleanText(variant.color, variant.colour, options.Color?.value, options.Colour?.value, options.color?.value);
    const size = firstCleanText(variant.size, options.Size?.value, options.size?.value);
    return {
      id: field(firstCleanText(variant.id, variant.variantId, variant.productId) ?? `${source.toLowerCase()}-variant-${index}`, source, 0.84, [ref]),
      sku: field(firstCleanText(variant.sku, variant.SKU), source, variant.sku ? 0.86 : 0, [ref]),
      title: field(firstCleanText(variant.title, variant.name), source, variant.title || variant.name ? 0.8 : 0, [ref]),
      price: field(price.amount, source, price.amount !== null ? 0.86 : 0, [ref]),
      currency: field(price.currency, source, price.currency ? 0.86 : 0, [ref]),
      color: field(color, source, color ? 0.82 : 0, [ref]),
      size: field(size, source, size ? 0.82 : 0, [ref]),
      availability: field(normalizeAvailability(firstValue(variant.availability, variant.available, variant.inStock)), source, 0.8, [ref]),
      image: field(image, source, image ? 0.78 : 0, [ref]),
      options
    };
  });
}

function variantOptions(variant: JsonObject, source: ExtractSource): Record<string, ReturnType<typeof field<string>>> {
  const options: Record<string, ReturnType<typeof field<string>>> = {};
  const rawOptions = firstValue(variant.options, variant.selectedOptions, variant.attributes);
  if (Array.isArray(rawOptions)) {
    for (const option of rawOptions) {
      if (!isRecord(option)) continue;
      const name = firstCleanText(option.name, option.label, option.key);
      const value = firstCleanText(option.value, option.optionValue);
      if (name && value) options[name] = field(value, source, 0.78);
    }
  } else if (isRecord(rawOptions)) {
    for (const [name, value] of Object.entries(rawOptions)) {
      const cleaned = cleanText(String(value));
      if (cleaned) options[name] = field(cleaned, source, 0.78);
    }
  }
  return options;
}

function parseBrand(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value);
  if (isRecord(value)) return firstCleanText(value.name, value.brand);
  return null;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}
