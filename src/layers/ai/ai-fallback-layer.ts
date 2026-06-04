import { normalizeAvailability } from '../../domain/availability.js';
import { createEvidence, evidenceRef } from '../../domain/evidence.js';
import { field, type ProductExtractResult } from '../../domain/product-extract-result.js';
import { normalizeCurrency, parsePrice } from '../../normalization/price.js';
import { emptyPartialExtraction } from '../../pipeline/partial-extraction.js';
import { DisabledAiClient, type AiClient } from './ai-client.js';
import { buildAiFallbackPrompt } from './prompt-builder.js';
import { validateAiExtractionResponse } from './ai-response-validator.js';

export type AiFallbackLayerOptions = {
  client?: AiClient;
  visibleText: string;
  missingFields: string[];
  partialResult: ProductExtractResult;
};

export async function runAiFallbackLayer(url: string, options: AiFallbackLayerOptions) {
  const partial = emptyPartialExtraction('ai-fallback');
  const client = options.client ?? new DisabledAiClient();
  const prompt = buildAiFallbackPrompt({
    url,
    missingFields: options.missingFields,
    visibleText: options.visibleText,
    partialResult: options.partialResult
  });
  const response = validateAiExtractionResponse(await client.extractProduct({ url, missingFields: options.missingFields, prompt }));

  for (const [name, extracted] of Object.entries(response)) {
    if (!extracted || extracted.value === null || extracted.value === undefined || !extracted.evidence) continue;
    const evidence = createEvidence({
      source: 'AI_FALLBACK',
      kind: 'ai_evidence',
      selectorOrPath: `ai.${name}`,
      url,
      snippet: extracted.evidence
    });
    const ref = evidenceRef(evidence);
    partial.evidence.push(evidence);

    if (name === 'price') {
      const parsed = parsePrice(extracted.value);
      if (parsed.amount !== null) partial.fields.price = field(parsed.amount, 'AI_FALLBACK', Math.min(extracted.confidence, 0.78), [ref]);
    } else if (name === 'currency') {
      const currency = normalizeCurrency(String(extracted.value));
      if (currency) partial.fields.currency = field(currency, 'AI_FALLBACK', Math.min(extracted.confidence, 0.78), [ref]);
    } else if (name === 'availability') {
      partial.fields.availability = field(normalizeAvailability(String(extracted.value)), 'AI_FALLBACK', Math.min(extracted.confidence, 0.72), [ref]);
    } else if (name === 'images' && Array.isArray(extracted.value)) {
      partial.fields.images = field(extracted.value.map(String), 'AI_FALLBACK', Math.min(extracted.confidence, 0.7), [ref]);
    } else if (name === 'colors' && Array.isArray(extracted.value)) {
      partial.fields.colors = field(extracted.value.map(String), 'AI_FALLBACK', Math.min(extracted.confidence, 0.68), [ref]);
    } else if (name === 'sizes' && Array.isArray(extracted.value)) {
      partial.fields.sizes = field(extracted.value.map(String), 'AI_FALLBACK', Math.min(extracted.confidence, 0.68), [ref]);
    } else if (name in partialFieldNames) {
      (partial.fields as Record<string, unknown>)[name] = field(String(extracted.value), 'AI_FALLBACK', Math.min(extracted.confidence, 0.76), [ref]);
    }
  }

  partial.fieldsUpdated = Object.keys(partial.fields) as typeof partial.fieldsUpdated;
  return partial;
}

const partialFieldNames: Record<string, true> = {
  title: true,
  brand: true,
  description: true,
  sku: true,
  productId: true
};
