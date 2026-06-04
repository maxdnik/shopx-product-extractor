import { normalizeAvailability } from '../../domain/availability.js';
import { evidenceRef, type Evidence } from '../../domain/evidence.js';
import { field, type ProductVariant, type PartialProductExtractResult } from '../../domain/product-extract-result.js';
import { normalizeImageList } from '../../normalization/images.js';
import { parsePrice } from '../../normalization/price.js';
import { cleanText, firstCleanText, uniqNormalized } from '../../normalization/text.js';
import { asArray, deepFindObjects, isRecord, type JsonObject } from '../../utils/json.js';

export type SchemaProductCandidate = {
  fields: PartialProductExtractResult;
  evidence: Evidence[];
  sourceObject: JsonObject;
};

export function parseSchemaOrgProducts(blocks: Array<{ data: unknown; evidence: Evidence }>, pageUrl: string): SchemaProductCandidate[] {
  const candidates: SchemaProductCandidate[] = [];

  for (const block of blocks) {
    const productObjects = deepFindObjects(block.data, isSchemaProductLike, 25);
    for (const product of productObjects) {
      candidates.push({
        fields: schemaProductToFields(product, pageUrl, block.evidence),
        evidence: [block.evidence],
        sourceObject: product
      });
    }
  }

  return candidates;
}

function schemaProductToFields(product: JsonObject, pageUrl: string, evidence: Evidence): PartialProductExtractResult {
  const source = isProductGroup(product) ? 'SCHEMA_ORG_PRODUCT_GROUP' : 'SCHEMA_ORG_PRODUCT';
  const ref = evidenceRef({ ...evidence, source });
  const offers = firstOffer(product.offers);
  const parsedPrice = parsePrice(
    firstValue(offers?.price, offers?.lowPrice, offers?.highPrice, product.price),
    firstValue(offers?.priceCurrency, product.priceCurrency)
  );
  const brand = parseBrand(product.brand);
  const images = normalizeImageList(firstValue(product.image, product.images), pageUrl);
  const availability = normalizeAvailability(firstValue(offers?.availability, product.availability));
  const variants = parseVariants(product, pageUrl, evidence);
  const colors = uniqNormalized([
    ...variants.map((variant) => variant.color.value).filter((value): value is string => Boolean(value)),
    ...asArray<string>(product.color).filter((value): value is string => typeof value === 'string')
  ]);
  const sizes = uniqNormalized([
    ...variants.map((variant) => variant.size.value).filter((value): value is string => Boolean(value)),
    ...asArray<string>(product.size).filter((value): value is string => typeof value === 'string')
  ]);

  const fields: PartialProductExtractResult = {};
  const titleField = maybeField(firstCleanText(product.name, product.headline), source, 0.94, [ref]);
  const brandField = maybeField(brand, source, brand ? 0.9 : 0, [ref]);
  const descriptionField = maybeField(cleanText(product.description), source, 0.86, [ref]);
  const priceField = maybeField(parsedPrice.amount, source, parsedPrice.amount !== null ? 0.94 : 0, [ref]);
  const currencyField = maybeField(parsedPrice.currency, source, parsedPrice.currency ? 0.94 : 0, [ref]);
  const skuField = maybeField(cleanText(product.sku), source, 0.9, [ref]);
  const productIdField = maybeField(firstCleanText(product.productID, product['@id'], product.gtin14, product.gtin13, product.gtin12, product.gtin8, product.mpn), source, 0.86, [ref]);

  if (titleField) fields.title = titleField;
  if (brandField) fields.brand = brandField;
  if (descriptionField) fields.description = descriptionField;
  if (priceField) fields.price = priceField;
  if (currencyField) fields.currency = currencyField;
  if (images.length) fields.images = field(images, source, 0.9, [ref]);
  if (availability !== 'UNKNOWN') fields.availability = field(availability, source, 0.88, [ref]);
  if (skuField) fields.sku = skuField;
  if (productIdField) fields.productId = productIdField;
  if (variants.length) fields.variants = field(variants, source, 0.9, [ref]);
  if (colors.length) fields.colors = field(colors, source, 0.84, [ref]);
  if (sizes.length) fields.sizes = field(sizes, source, 0.84, [ref]);

  return fields;
}

function parseVariants(product: JsonObject, pageUrl: string, evidence: Evidence): ProductVariant[] {
  const rawVariants = [
    ...asArray<JsonObject>(product.hasVariant).filter(isRecord),
    ...asArray<JsonObject>(product.isVariantOf).filter(isRecord)
  ];
  const ref = evidenceRef({ ...evidence, source: 'SCHEMA_ORG_PRODUCT_GROUP' });

  return rawVariants.map((variant, index) => {
    const offer = firstOffer(variant.offers);
    const parsedPrice = parsePrice(firstValue(offer?.price, variant.price), firstValue(offer?.priceCurrency, variant.priceCurrency));
    const image = normalizeImageList(firstValue(variant.image, variant.images), pageUrl)[0] ?? null;
    const source = 'SCHEMA_ORG_PRODUCT_GROUP';
    return {
      id: field(firstCleanText(variant.productID, variant['@id'], variant.sku) ?? `schema-variant-${index}`, source, 0.82, [ref]),
      sku: field(cleanText(variant.sku), source, variant.sku ? 0.9 : 0, [ref]),
      title: field(firstCleanText(variant.name, variant.title), source, variant.name ? 0.86 : 0, [ref]),
      price: field(parsedPrice.amount, source, parsedPrice.amount !== null ? 0.9 : 0, [ref]),
      currency: field(parsedPrice.currency, source, parsedPrice.currency ? 0.9 : 0, [ref]),
      color: field(cleanText(variant.color), source, variant.color ? 0.86 : 0, [ref]),
      size: field(cleanText(variant.size), source, variant.size ? 0.86 : 0, [ref]),
      availability: field(normalizeAvailability(firstValue(offer?.availability, variant.availability)), source, 0.78, [ref]),
      image: field(image, source, image ? 0.84 : 0, [ref]),
      options: {}
    };
  });
}

function isSchemaProductLike(object: JsonObject): boolean {
  const type = object['@type'];
  return asArray<string>(type).some((item) => /(^|[/#])(Product|ProductGroup)$/i.test(String(item)));
}

function isProductGroup(object: JsonObject): boolean {
  return asArray<string>(object['@type']).some((item) => /ProductGroup$/i.test(String(item)));
}

function firstOffer(value: unknown): JsonObject | undefined {
  const offers = asArray<JsonObject>(value).filter(isRecord);
  return offers.find((offer) => /Offer/i.test(String(offer['@type'] ?? ''))) ?? offers[0];
}

function parseBrand(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value);
  if (isRecord(value)) return firstCleanText(value.name, value.brand);
  return null;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function maybeField<T>(
  value: T | null | undefined,
  source: Parameters<typeof field<T>>[1],
  confidence: number,
  evidence: Parameters<typeof field<T>>[3]
) {
  return value === null || value === undefined ? undefined : field(value, source, confidence, evidence);
}
