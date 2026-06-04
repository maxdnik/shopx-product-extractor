import type { ExtractedField } from '../domain/product-extract-result.js';
import { clampConfidence } from '../domain/product-extract-result.js';
import { sourcePrior } from './source-priors.js';

export function scoreField<T>(field: ExtractedField<T>, options?: { corroboratedBy?: number; penalty?: number }): number {
  if (field.value === null || field.value === undefined) return 0;
  const prior = sourcePrior(field.source);
  const provided = field.confidence || prior;
  const corroborationBoost = Math.min(0.08, (options?.corroboratedBy ?? 0) * 0.03);
  const evidenceBoost = field.evidence?.length ? 0.02 : 0;
  const penalty = options?.penalty ?? 0;
  return clampConfidence(Math.max(prior, provided) + corroborationBoost + evidenceBoost - penalty);
}

export function shouldReplaceField<T>(current: ExtractedField<T>, candidate: ExtractedField<T>): boolean {
  if (candidate.value === null || candidate.value === undefined) return false;
  if (current.value === null || current.value === undefined) return true;
  if (candidate.confidence > current.confidence + 0.03) return true;
  return false;
}
