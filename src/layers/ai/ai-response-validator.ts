import { aiProductExtractionSchema, type AiProductExtraction } from './product-extraction-schema.js';

export function validateAiExtractionResponse(response: unknown): AiProductExtraction {
  return aiProductExtractionSchema.parse(response);
}
