import * as cheerio from 'cheerio';
import { normalizeAvailability } from '../../domain/availability.js';
import { createEvidence, evidenceRef, type Evidence } from '../../domain/evidence.js';
import { field, type PartialProductExtractResult, type ProductVariant } from '../../domain/product-extract-result.js';
import { normalizeImageList } from '../../normalization/images.js';
import { parsePrice } from '../../normalization/price.js';
import { cleanText, firstCleanText, uniqNormalized } from '../../normalization/text.js';
import { asArray, deepFindObjects, isRecord, safeJsonParse, type JsonObject } from '../../utils/json.js';
import { sha256 } from '../../utils/hash.js';
import { isProductLikeJson } from './product-json-detector.js';

export function parseEmbeddedProductJson(html: string, pageUrl: string): { fields: PartialProductExtractResult; evidence: Evidence[] } {
  const $ = cheerio.load(html);
  const candidates: Array<{ object: JsonObject; evidence: Evidence }> = [];

  $('script').each((index, element) => {
    const raw = $(element).text().trim();
    if (!raw || raw.length < 20) return;
    const parsed = parseScriptJson(raw);
    if (!parsed) return;

    const evidence = createEvidence({
      source: 'EMBEDDED_JSON',
      kind: 'embedded_json',
      selectorOrPath: scriptPath($, element, index),
      url: pageUrl,
      snippet: raw.slice(0, 4_000),
      rawHash: sha256(raw)
    });

    for (const object of deepFindObjects(parsed, isProductLikeJson, 20)) {
      candidates.push({ object, evidence });
    }
  });

  const best = candidates[0];
  if (!best) return { fields: {}, evidence: [] };
  return {
    fields: productJsonToFields(best.object, pageUrl, best.evidence),
    evidence: [...new Map(candidates.map((candidate) => [candidate.evidence.id, candidate.evidence])).values()]
  };
}

function parseScriptJson(raw: string): unknown | null {
  const direct = safeJsonParse(raw);
  if (direct) return direct;

  const assignmentMatch = raw.match(/(?:window\.)?[\w$.__-]+\s*=\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*;?$/);
  if (assignmentMatch?.[1]) return safeJsonParse(assignmentMatch[1]);

  return null;
}

function productJsonToFields(product: JsonObject, pageUrl: string, evidence: Evidence): PartialProductExtractResult {
  const ref = evidenceRef(evidence);
  const priceValue = firstValue(product.price, product.currentPrice, product.salePrice, nested(product, 'offers.price'));
  const currencyValue = firstValue(product.currency, product.priceCurrency, nested(product, 'offers.priceCurrency'));
  const parsedPrice = parsePrice(priceValue, currencyValue);
  const images = normalizeImageList(firstValue(product.images, product.image, product.media, product.gallery), pageUrl);
  const variants = parseEmbeddedVariants(product, pageUrl, evidence);
  const colors = uniqNormalized(variants.map((variant) => variant.color.value).filter((value): value is string => Boolean(value)));
  const sizes = uniqNormalized(variants.map((variant) => variant.size.value).filter((value): value is string => Boolean(value)));
  const availability = normalizeAvailability(firstValue(product.availability, product.available, product.inStock, nested(product, 'offers.availability')));

  const fields: PartialProductExtractResult = {};
  const title = firstCleanText(product.title, product.name, product.productName);
  const brand = parseBrand(firstValue(product.brand, product.vendor, product.manufacturer));
  const description = firstCleanText(product.description, product.shortDescription, product.body_html);
  const sku = firstCleanText(product.sku, product.SKU);
  const productId = firstCleanText(product.id, product.productId, product.productID, product.handle, product.gtin, product.mpn);

  if (title) fields.title = field(title, 'EMBEDDED_JSON', 0.86, [ref]);
  if (brand) fields.brand = field(brand, 'EMBEDDED_JSON', 0.82, [ref]);
  if (description) fields.description = field(description, 'EMBEDDED_JSON', 0.78, [ref]);
  if (parsedPrice.amount !== null) fields.price = field(parsedPrice.amount, 'EMBEDDED_JSON', 0.86, [ref]);
  if (parsedPrice.currency) fields.currency = field(parsedPrice.currency, 'EMBEDDED_JSON', 0.84, [ref]);
  if (images.length) fields.images = field(images, 'EMBEDDED_JSON', 0.84, [ref]);
  if (variants.length) fields.variants = field(variants, 'EMBEDDED_JSON', 0.84, [ref]);
  if (colors.length) fields.colors = field(colors, 'EMBEDDED_JSON', 0.78, [ref]);
  if (sizes.length) fields.sizes = field(sizes, 'EMBEDDED_JSON', 0.78, [ref]);
  if (availability !== 'UNKNOWN') fields.availability = field(availability, 'EMBEDDED_JSON', 0.8, [ref]);
  if (sku) fields.sku = field(sku, 'EMBEDDED_JSON', 0.82, [ref]);
  if (productId) fields.productId = field(productId, 'EMBEDDED_JSON', 0.82, [ref]);
  return fields;
}

function parseEmbeddedVariants(product: JsonObject, pageUrl: string, evidence: Evidence): ProductVariant[] {
  const ref = evidenceRef(evidence);
  const rawVariants = asArray<JsonObject>(firstValue(product.variants, product.hasVariant, product.items)).filter(isRecord);
  return rawVariants.slice(0, 200).map((variant, index) => {
    const parsedPrice = parsePrice(firstValue(variant.price, variant.currentPrice, variant.salePrice), firstValue(variant.currency, variant.priceCurrency));
    const options = parseVariantOptions(variant);
    const color = firstCleanText(variant.color, variant.colour, options.Color?.value, options.Colour?.value);
    const size = firstCleanText(variant.size, options.Size?.value);
    const image = normalizeImageList(firstValue(variant.image, variant.images, variant.featured_image), pageUrl)[0] ?? null;
    return {
      id: field(firstCleanText(variant.id, variant.variantId, variant.productId) ?? `embedded-variant-${index}`, 'EMBEDDED_JSON', 0.82, [ref]),
      sku: field(firstCleanText(variant.sku, variant.SKU), 'EMBEDDED_JSON', variant.sku ? 0.82 : 0, [ref]),
      title: field(firstCleanText(variant.title, variant.name), 'EMBEDDED_JSON', variant.title ? 0.78 : 0, [ref]),
      price: field(parsedPrice.amount, 'EMBEDDED_JSON', parsedPrice.amount !== null ? 0.84 : 0, [ref]),
      currency: field(parsedPrice.currency, 'EMBEDDED_JSON', parsedPrice.currency ? 0.82 : 0, [ref]),
      color: field(color, 'EMBEDDED_JSON', color ? 0.78 : 0, [ref]),
      size: field(size, 'EMBEDDED_JSON', size ? 0.78 : 0, [ref]),
      availability: field(normalizeAvailability(firstValue(variant.availability, variant.available, variant.inStock)), 'EMBEDDED_JSON', 0.76, [ref]),
      image: field(image, 'EMBEDDED_JSON', image ? 0.76 : 0, [ref]),
      options
    };
  });
}

function parseVariantOptions(variant: JsonObject): Record<string, ReturnType<typeof field<string>>> {
  const options: Record<string, ReturnType<typeof field<string>>> = {};
  const rawOptions = firstValue(variant.options, variant.selectedOptions, variant.attributes);
  const source = 'EMBEDDED_JSON';

  if (Array.isArray(rawOptions)) {
    for (const option of rawOptions) {
      if (!isRecord(option)) continue;
      const name = firstCleanText(option.name, option.label, option.key);
      const value = firstCleanText(option.value, option.optionValue);
      if (name && value) options[name] = field(value, source, 0.76);
    }
  } else if (isRecord(rawOptions)) {
    for (const [name, value] of Object.entries(rawOptions)) {
      const cleaned = cleanText(String(value));
      if (cleaned) options[name] = field(cleaned, source, 0.76);
    }
  }

  return options;
}

function parseBrand(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value);
  if (isRecord(value)) return firstCleanText(value.name, value.brand);
  return null;
}

function nested(object: JsonObject, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, object);
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function scriptPath($: cheerio.CheerioAPI, element: Parameters<cheerio.CheerioAPI>[0], index: number): string {
  const id = $(element).attr('id');
  if (id) return `script#${id}`;
  const type = $(element).attr('type');
  return type ? `script[type="${type}"][${index}]` : `script[${index}]`;
}
