import { deepFindObjects, isRecord, type JsonObject } from '../../utils/json.js';
import { isProductLikeJson } from '../structured-data/product-json-detector.js';

export function findProductObjectsInResponse(data: unknown): JsonObject[] {
  if (isRecord(data) && isProductLikeJson(data)) return [data];
  return deepFindObjects(data, isProductLikeJson, 15);
}

export function looksLikeProductEndpoint(url: string): boolean {
  return /product|variant|inventory|availability|graphql|pdp|catalog/i.test(url);
}
