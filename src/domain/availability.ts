export const PRODUCT_AVAILABILITIES = [
  'IN_STOCK',
  'OUT_OF_STOCK',
  'LOW_STOCK',
  'PREORDER',
  'BACKORDER',
  'DISCONTINUED',
  'UNKNOWN'
] as const;

export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

const AVAILABILITY_MAP: Array<[RegExp, ProductAvailability]> = [
  [/discontinued|no longer available/i, 'DISCONTINUED'],
  [/pre[\s-]?order|preorder/i, 'PREORDER'],
  [/back[\s-]?order|backorder/i, 'BACKORDER'],
  [/low stock|limited stock|only \d+ left/i, 'LOW_STOCK'],
  [/out\s*of\s*stock|outofstock|sold out|unavailable|notify me/i, 'OUT_OF_STOCK'],
  [/in\s*stock|instock|available|add to cart|add to bag|buy now/i, 'IN_STOCK']
];

export function normalizeAvailability(input: unknown): ProductAvailability {
  if (typeof input !== 'string') {
    if (input === true) return 'IN_STOCK';
    if (input === false) return 'OUT_OF_STOCK';
    return 'UNKNOWN';
  }

  const normalized = input.trim();
  const schemaOrgAvailability = normalized.split('/').pop() ?? normalized;

  for (const [pattern, availability] of AVAILABILITY_MAP) {
    if (pattern.test(schemaOrgAvailability)) return availability;
  }

  return 'UNKNOWN';
}
