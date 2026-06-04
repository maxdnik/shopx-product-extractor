import type { ProductExtractResult } from '../domain/product-extract-result.js';

export type EscalationDecision = {
  shouldEscalate: boolean;
  missingCriticalFields: string[];
  lowConfidenceFields: string[];
};

const CRITICAL_THRESHOLDS: Array<[keyof ProductExtractResult, number]> = [
  ['title', 0.8],
  ['price', 0.85],
  ['currency', 0.85],
  ['images', 0.75],
  ['availability', 0.75]
];

export function evaluateEscalation(result: ProductExtractResult): EscalationDecision {
  const missingCriticalFields: string[] = [];
  const lowConfidenceFields: string[] = [];

  for (const [fieldName, threshold] of CRITICAL_THRESHOLDS) {
    const field = result[fieldName];
    if (!field || typeof field !== 'object' || !('value' in field)) continue;
    const value = field.value;
    if (
      value === null ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      value === 'UNKNOWN'
    ) {
      missingCriticalFields.push(String(fieldName));
    } else if (field.confidence < threshold) {
      lowConfidenceFields.push(String(fieldName));
    }
  }

  return {
    shouldEscalate: missingCriticalFields.length > 0 || lowConfidenceFields.length > 0,
    missingCriticalFields,
    lowConfidenceFields
  };
}
