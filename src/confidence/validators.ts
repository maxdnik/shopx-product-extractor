import type { ProductAvailability } from '../domain/availability.js';
import type { StoreInfo } from '../domain/store.js';

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

export function isValidImageList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => /^https?:\/\//.test(item));
}

export function isValidAvailability(value: unknown): value is ProductAvailability {
  return (
    value === 'IN_STOCK' ||
    value === 'OUT_OF_STOCK' ||
    value === 'LOW_STOCK' ||
    value === 'PREORDER' ||
    value === 'BACKORDER' ||
    value === 'DISCONTINUED' ||
    value === 'UNKNOWN'
  );
}

export function isValidStoreInfo(value: unknown): value is StoreInfo {
  return Boolean(value && typeof value === 'object' && isNonEmptyString((value as StoreInfo).domain));
}
