import { isRecord, type JsonObject } from '../../utils/json.js';

const PRODUCT_KEYS = ['product', 'products', 'variant', 'variants', 'offers', 'price', 'images', 'sku', 'brand', 'availability'];
const TITLE_KEYS = ['title', 'name', 'productName'];

export function isProductLikeJson(object: JsonObject): boolean {
  const keys = new Set(Object.keys(object).map((key) => key.toLowerCase()));
  const productKeyScore = PRODUCT_KEYS.filter((key) => keys.has(key.toLowerCase())).length;
  const titleScore = TITLE_KEYS.some((key) => keys.has(key.toLowerCase())) ? 1 : 0;
  const hasPrice = hasNestedKey(object, 'price');
  const hasImages = hasNestedKey(object, 'images') || hasNestedKey(object, 'image');
  return productKeyScore + titleScore + (hasPrice ? 1 : 0) + (hasImages ? 1 : 0) >= 3;
}

export function hasNestedKey(value: unknown, targetKey: string, depth = 0): boolean {
  if (depth > 4 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasNestedKey(item, targetKey, depth + 1));
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => key.toLowerCase() === targetKey.toLowerCase())) return true;
  return Object.values(value).some((child) => hasNestedKey(child, targetKey, depth + 1));
}
