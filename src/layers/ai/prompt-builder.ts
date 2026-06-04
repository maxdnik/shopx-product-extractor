import type { ProductExtractResult } from '../../domain/product-extract-result.js';

export function buildAiFallbackPrompt(input: {
  url: string;
  missingFields: string[];
  visibleText: string;
  partialResult: ProductExtractResult;
}): string {
  return [
    'Extract ecommerce product data as strict JSON only.',
    'Only fill requested missing or low-confidence fields.',
    'Every field must include: value, confidence, evidence.',
    'Evidence must be an exact text snippet from the provided page content.',
    `URL: ${input.url}`,
    `Requested fields: ${input.missingFields.join(', ')}`,
    `Current partial result: ${JSON.stringify({
      title: input.partialResult.title,
      price: input.partialResult.price,
      currency: input.partialResult.currency,
      availability: input.partialResult.availability
    })}`,
    `Page content:\n${input.visibleText.slice(0, 20_000)}`
  ].join('\n\n');
}
