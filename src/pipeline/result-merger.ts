import { scoreField, shouldReplaceField } from '../confidence/field-scorer.js';
import { scoreResult } from '../confidence/result-scorer.js';
import type {
  ExtractedField,
  PartialProductExtractResult,
  ProductExtractFieldName,
  ProductExtractResult
} from '../domain/product-extract-result.js';
import type { PartialExtraction } from './partial-extraction.js';

export function mergePartialExtraction(result: ProductExtractResult, partial: PartialExtraction): ProductExtractResult {
  for (const evidence of partial.evidence) {
    if (!result.evidence.some((existing) => existing.id === evidence.id)) result.evidence.push(evidence);
  }

  for (const [fieldName, candidate] of Object.entries(partial.fields) as Array<[
    ProductExtractFieldName,
    PartialProductExtractResult[ProductExtractFieldName]
  ]>) {
    if (!candidate) continue;
    mergeField(result, fieldName, candidate as ExtractedField<unknown>);
  }

  result.extraction.warnings.push(...partial.warnings);
  result.confidence = scoreResult(result);
  return result;
}

function mergeField(
  result: ProductExtractResult,
  fieldName: ProductExtractFieldName,
  candidate: ExtractedField<unknown>
): void {
  const current = result[fieldName] as ExtractedField<unknown>;
  candidate.confidence = scoreField(candidate);

  if (shouldReplaceField(current, candidate)) {
    const alternatives = [
      ...(candidate.alternatives ?? []),
      ...(current.value !== null && current.value !== undefined
        ? [
            {
              value: current.value,
              source: current.source,
              confidence: current.confidence,
              ...(current.evidence ? { evidence: current.evidence } : {})
            }
          ]
        : [])
    ];
    (result[fieldName] as ExtractedField<unknown>) = {
      ...candidate,
      ...(alternatives.length ? { alternatives } : {})
    };
    return;
  }

  if (candidate.value !== null && candidate.value !== undefined && !valuesEqual(current.value, candidate.value)) {
    current.alternatives = [
      ...(current.alternatives ?? []),
      {
        value: candidate.value,
        source: candidate.source,
        confidence: candidate.confidence,
        ...(candidate.evidence ? { evidence: candidate.evidence } : {})
      }
    ];
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
